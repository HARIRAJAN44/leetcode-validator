import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { AggregatedDataset, buildAggregatedDataset } from './aggregator';
import { generateContestWorkbookBytes } from './excelGenerator';
import { generateSampleWorkbookBytes, parseStudentsExcelBuffer } from './excelParser';
import { fetchLatestWeeklyContest, fetchStudentContests } from './leetcodeClient';
import {
  JobListItem,
  JobState,
  JobStatusResponse,
  PreviewResponse,
  StudentContestFetchResult,
  StudentInput,
  UploadResponse,
} from '../types/api';

const JOBS_STORAGE_KEY = '@lct_standalone_jobs_v1';
const PREVIEW_KEY_PREFIX = '@lct_standalone_preview_v1_';
const MAX_CONCURRENCY = 3;

interface StoredJobRecord {
  job_id: string;
  filename: string;
  status: JobState;
  created_at: string;
  updated_at: string;
  total_students: number;
  valid_students: number;
  unique_valid_students: number;
  processed_students: number;
  succeeded_students: number;
  failed_students: number;
  current_student: string | null;
  progress_percent: number;
  total_weekly_contests: number;
  latest_contest_name: string | null;
  latest_contest_date: string | null;
  error_message: string | null;
  output_filename: string | null;
  output_uri: string | null;
  extra_columns: string[];
  warnings: string[];
  students: StudentInput[];
}

interface StoredPreviewPayload {
  job_id: string;
  filename: string;
  latest_contest_name: string | null;
  latest_contest_date: string | null;
  stats: AggregatedDataset['stats'];
  summary: AggregatedDataset['summary'];
  latest_contest_rows: AggregatedDataset['latest_contest_rows'];
  available_contests: AggregatedDataset['contests_meta'];
  historical_contest_rows: AggregatedDataset['historical_contest_rows'];
  extra_columns: string[];
  warnings: string[];
}

type StatusListener = (status: JobStatusResponse) => void;

const statusListeners = new Map<string, Set<StatusListener>>();
const runningJobs = new Set<string>();
const webDownloadCache = new Map<string, Uint8Array>();
const webPreviewCache = new Map<string, StoredPreviewPayload>();

async function savePreviewPayload(jobId: string, payload: StoredPreviewPayload): Promise<void> {
  if (Platform.OS === 'web') {
    webPreviewCache.set(jobId, payload);
    try {
      await AsyncStorage.setItem(`${PREVIEW_KEY_PREFIX}${jobId}`, JSON.stringify(payload));
    } catch {
      // Ignore web quota limits
    }
    return;
  }
  const previewFile = new File(Paths.document, `lct_preview_${jobId}.json`);
  previewFile.create({ overwrite: true });
  previewFile.write(JSON.stringify(payload));
}

async function loadPreviewPayload(jobId: string): Promise<StoredPreviewPayload | null> {
  if (Platform.OS === 'web') {
    const cached = webPreviewCache.get(jobId);
    if (cached) return cached;
    const raw = await AsyncStorage.getItem(`${PREVIEW_KEY_PREFIX}${jobId}`);
    return raw ? (JSON.parse(raw) as StoredPreviewPayload) : null;
  }
  const previewFile = new File(Paths.document, `lct_preview_${jobId}.json`);
  if (!previewFile.exists) return null;
  const raw = await previewFile.text();
  return JSON.parse(raw) as StoredPreviewPayload;
}

async function removePreviewPayload(jobId: string): Promise<void> {
  webPreviewCache.delete(jobId);
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(`${PREVIEW_KEY_PREFIX}${jobId}`);
    return;
  }
  try {
    const previewFile = new File(Paths.document, `lct_preview_${jobId}.json`);
    if (previewFile.exists) previewFile.delete();
  } catch {
    // Ignore cleanup errors
  }
}

function createJobId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36).slice(-6);
  return `${ts}${rand}`;
}

function safeFilenameStem(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const cleaned = withoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 40) || 'leetcode_contests';
}

async function readJobsMap(): Promise<Record<string, StoredJobRecord>> {
  const raw = await AsyncStorage.getItem(JOBS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, StoredJobRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeJobsMap(map: Record<string, StoredJobRecord>): Promise<void> {
  await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(map));
}

function toStatusResponse(job: StoredJobRecord): JobStatusResponse {
  let downloadReady = false;
  if (job.status === 'completed') {
    if (Platform.OS === 'web') {
      downloadReady = webDownloadCache.has(job.job_id);
    } else if (job.output_uri) {
      try {
        const file = new File(job.output_uri);
        downloadReady = file.exists;
      } catch {
        downloadReady = false;
      }
    }
  }

  return {
    job_id: job.job_id,
    filename: job.filename,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    total_students: job.total_students,
    processed_students: job.processed_students,
    succeeded_students: job.succeeded_students,
    failed_students: job.failed_students,
    current_student: job.current_student,
    progress_percent: job.progress_percent,
    total_weekly_contests: job.total_weekly_contests,
    latest_contest_name: job.latest_contest_name,
    latest_contest_date: job.latest_contest_date,
    error_message: job.error_message,
    download_ready: downloadReady,
    output_filename: job.output_filename,
    output_uri: job.output_uri,
    warnings: job.warnings,
  };
}

function notifyListeners(job: StoredJobRecord): void {
  const listeners = statusListeners.get(job.job_id);
  if (!listeners || listeners.size === 0) return;
  const snapshot = toStatusResponse(job);
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function subscribeJobStatus(jobId: string, listener: StatusListener): () => void {
  let set = statusListeners.get(jobId);
  if (!set) {
    set = new Set();
    statusListeners.set(jobId, set);
  }
  set.add(listener);
  return () => {
    const existing = statusListeners.get(jobId);
    if (existing) {
      existing.delete(listener);
      if (existing.size === 0) statusListeners.delete(jobId);
    }
  };
}

async function readAssetArrayBuffer(asset: DocumentPickerAsset): Promise<ArrayBuffer> {
  if (Platform.OS === 'web' && asset.file) {
    return asset.file.arrayBuffer();
  }
  const localFile = new File(asset.uri);
  return localFile.arrayBuffer();
}

export async function createJobFromAsset(asset: DocumentPickerAsset): Promise<UploadResponse> {
  const filename = asset.name || 'students.xlsx';
  const lowerName = filename.toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xlsm')) {
    throw new Error('Unsupported file format. Please select a .xlsx Excel file.');
  }

  const buffer = await readAssetArrayBuffer(asset);
  if (buffer.byteLength === 0) {
    throw new Error('Selected Excel file is empty.');
  }

  const parsed = await parseStudentsExcelBuffer(buffer);
  const students = parsed.students;

  const validCount = students.filter((s) => s.is_valid).length;
  const invalidCount = students.filter((s) => !s.is_valid).length;
  const duplicateCount = students.filter((s) => s.is_duplicate).length;
  const uniqueValidCount = students.filter((s) => s.is_valid && !s.is_duplicate).length;

  const jobId = createJobId();
  const now = new Date().toISOString();

  const record: StoredJobRecord = {
    job_id: jobId,
    filename,
    status: 'uploaded',
    created_at: now,
    updated_at: now,
    total_students: students.length,
    valid_students: validCount,
    unique_valid_students: uniqueValidCount,
    processed_students: 0,
    succeeded_students: 0,
    failed_students: 0,
    current_student: null,
    progress_percent: 0,
    total_weekly_contests: 0,
    latest_contest_name: null,
    latest_contest_date: null,
    error_message: null,
    output_filename: null,
    output_uri: null,
    extra_columns: parsed.extraColumns,
    warnings: parsed.warnings,
    students,
  };

  const jobs = await readJobsMap();
  jobs[jobId] = record;
  await writeJobsMap(jobs);

  return {
    job_id: jobId,
    filename,
    total_rows: students.length,
    valid_students: validCount,
    invalid_rows: invalidCount,
    duplicate_rows: duplicateCount,
    unique_valid_students: uniqueValidCount,
    extra_columns: parsed.extraColumns,
    warnings: parsed.warnings,
    students,
    status: 'uploaded',
  };
}

async function persistJobUpdate(job: StoredJobRecord): Promise<void> {
  job.updated_at = new Date().toISOString();
  const jobs = await readJobsMap();
  jobs[job.job_id] = job;
  await writeJobsMap(jobs);
  notifyListeners(job);
}

async function runExtractionJob(jobId: string, includeDuplicates: boolean): Promise<void> {
  const jobs = await readJobsMap();
  const job = jobs[jobId];
  if (!job) return;

  try {
    const uniqueMap = new Map<string, StudentInput>();
    for (const s of job.students) {
      if (s.is_valid && s.username) {
        const key = s.username.toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, s);
        }
      }
    }

    const queue = Array.from(uniqueMap.entries());
    const totalToFetch = queue.length;

    job.status = 'processing';
    job.total_students = totalToFetch;
    job.processed_students = 0;
    job.succeeded_students = 0;
    job.failed_students = 0;
    job.progress_percent = totalToFetch === 0 ? 50 : 2;
    job.error_message = null;
    await persistJobUpdate(job);

    const latestPlatformContest = await fetchLatestWeeklyContest();

    const fetchResults = new Map<string, StudentContestFetchResult>();
    let cursor = 0;

    const worker = async () => {
      while (cursor < queue.length) {
        const index = cursor;
        cursor += 1;
        const [key, student] = queue[index];

        job.current_student = `${student.student_name} (@${student.username})`;
        notifyListeners(job);

        const res = await fetchStudentContests(student);
        fetchResults.set(key, res);

        job.processed_students += 1;
        if (res.profile_status === 'Active' || res.profile_status === 'Not Participated') {
          job.succeeded_students += 1;
        } else {
          job.failed_students += 1;
        }
        job.progress_percent =
          totalToFetch > 0 ? Math.round((job.processed_students / totalToFetch) * 900) / 10 : 90;
        await persistJobUpdate(job);
      }
    };

    const workersCount = Math.min(MAX_CONCURRENCY, Math.max(1, queue.length));
    if (queue.length > 0) {
      await Promise.all(Array.from({ length: workersCount }, () => worker()));
    }

    job.current_student = 'Generating Excel workbook...';
    job.progress_percent = 95;
    await persistJobUpdate(job);

    const dataset = buildAggregatedDataset(
      job.students,
      fetchResults,
      latestPlatformContest,
      includeDuplicates
    );

    const outputFilename = `${safeFilenameStem(job.filename)}_${job.job_id}_report.xlsx`;
    const workbookBytes = await generateContestWorkbookBytes(dataset, job.extra_columns);

    let outputUri: string | null = null;
    if (Platform.OS === 'web') {
      webDownloadCache.set(job.job_id, workbookBytes);
      outputUri = `web-memory://${outputFilename}`;
    } else {
      const outFile = new File(Paths.document, outputFilename);
      outFile.create({ overwrite: true });
      outFile.write(workbookBytes);
      outputUri = outFile.uri;
    }

    const previewPayload: StoredPreviewPayload = {
      job_id: job.job_id,
      filename: job.filename,
      latest_contest_name: dataset.latest_contest_name,
      latest_contest_date: dataset.latest_contest_date,
      stats: dataset.stats,
      summary: dataset.summary,
      latest_contest_rows: dataset.latest_contest_rows,
      available_contests: dataset.contests_meta,
      historical_contest_rows: dataset.historical_contest_rows,
      extra_columns: job.extra_columns,
      warnings: job.warnings,
    };

    await savePreviewPayload(job.job_id, previewPayload);

    job.status = 'completed';
    job.output_filename = outputFilename;
    job.output_uri = outputUri;
    job.current_student = null;
    job.progress_percent = 100;
    job.total_weekly_contests = dataset.contests_meta.length;
    job.latest_contest_name = dataset.latest_contest_name;
    job.latest_contest_date = dataset.latest_contest_date;
    await persistJobUpdate(job);
  } catch (err) {
    job.status = 'failed';
    job.current_student = null;
    job.error_message = err instanceof Error ? err.message : String(err);
    await persistJobUpdate(job);
  } finally {
    runningJobs.delete(jobId);
  }
}

export async function startExtractionJob(
  jobId: string,
  includeDuplicates = false
): Promise<JobStatusResponse> {
  const jobs = await readJobsMap();
  const job = jobs[jobId];
  if (!job) {
    throw new Error(`Job '${jobId}' not found.`);
  }

  if (runningJobs.has(jobId)) {
    return toStatusResponse(job);
  }

  job.status = 'queued';
  job.processed_students = 0;
  job.succeeded_students = 0;
  job.failed_students = 0;
  job.progress_percent = 0;
  job.error_message = null;
  await persistJobUpdate(job);

  runningJobs.add(jobId);
  void runExtractionJob(jobId, includeDuplicates);

  return toStatusResponse(job);
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const jobs = await readJobsMap();
  const job = jobs[jobId];
  if (!job) {
    throw new Error(`Job '${jobId}' not found.`);
  }
  // Recover jobs that were interrupted by app kill while running
  if ((job.status === 'processing' || job.status === 'queued') && !runningJobs.has(jobId)) {
    job.status = 'failed';
    job.error_message = 'Extraction was interrupted when the app closed. Tap Retry to run again.';
    await persistJobUpdate(job);
  }
  return toStatusResponse(job);
}

export async function getJobPreview(
  jobId: string,
  contestName?: string
): Promise<PreviewResponse> {
  const parsed = await loadPreviewPayload(jobId);
  if (!parsed) {
    throw new Error('Preview data not found for this job.');
  }

  let selectedContest = contestName ?? parsed.latest_contest_name;
  let selectedRows = parsed.latest_contest_rows;

  if (contestName) {
    if (
      contestName === 'Latest Weekly Contest' ||
      contestName === parsed.latest_contest_name
    ) {
      selectedRows = parsed.latest_contest_rows;
    } else if (parsed.historical_contest_rows[contestName]) {
      selectedRows = parsed.historical_contest_rows[contestName];
    } else {
      throw new Error(`Contest '${contestName}' not found.`);
    }
    selectedContest = contestName;
  }

  return {
    job_id: parsed.job_id,
    filename: parsed.filename,
    latest_contest_name: parsed.latest_contest_name,
    latest_contest_date: parsed.latest_contest_date,
    stats: parsed.stats,
    summary: parsed.summary,
    latest_contest_rows: parsed.latest_contest_rows,
    available_contests: parsed.available_contests,
    selected_contest: selectedContest,
    selected_contest_rows: selectedRows,
    extra_columns: parsed.extra_columns,
    warnings: parsed.warnings,
  };
}

export async function listJobs(): Promise<JobListItem[]> {
  const jobs = await readJobsMap();
  const items: JobListItem[] = Object.values(jobs).map((job) => {
    const status = toStatusResponse(job);
    return {
      job_id: job.job_id,
      filename: job.filename,
      status: status.status,
      created_at: job.created_at,
      updated_at: job.updated_at,
      total_students: job.students.length,
      valid_students: job.valid_students,
      total_weekly_contests: job.total_weekly_contests,
      latest_contest_name: job.latest_contest_name,
      download_ready: status.download_ready,
      output_filename: job.output_filename,
      output_uri: job.output_uri,
    };
  });

  items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return items;
}

export async function deleteJob(jobId: string): Promise<void> {
  if (runningJobs.has(jobId)) {
    throw new Error('Cannot delete a job while extraction is currently running.');
  }

  const jobs = await readJobsMap();
  const job = jobs[jobId];
  if (!job) return;

  if (job.output_uri && Platform.OS !== 'web') {
    try {
      const f = new File(job.output_uri);
      if (f.exists) {
        f.delete();
      }
    } catch {
      // Ignore file cleanup errors
    }
  }
  webDownloadCache.delete(jobId);

  delete jobs[jobId];
  await writeJobsMap(jobs);
  await removePreviewPayload(jobId);
}

export async function getOutputBytesForWeb(jobId: string): Promise<Uint8Array | null> {
  return webDownloadCache.get(jobId) ?? null;
}

export async function createSampleExcelFile(): Promise<{ uri: string; bytes: Uint8Array }> {
  const bytes = await generateSampleWorkbookBytes();
  if (Platform.OS === 'web') {
    return { uri: 'web-memory://sample_students_input.xlsx', bytes };
  }
  const file = new File(Paths.cache, 'sample_students_input.xlsx');
  file.create({ overwrite: true });
  file.write(bytes);
  return { uri: file.uri, bytes };
}
