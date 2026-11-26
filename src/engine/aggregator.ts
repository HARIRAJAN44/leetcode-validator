import {
  ContestRecord,
  ContestSummaryMeta,
  ParticipationStatus,
  PreviewStats,
  StudentContestFetchResult,
  StudentInput,
  StudentSummary,
} from '../types/api';
import { ContestMetadata } from './leetcodeClient';

export interface AggregatedDataset {
  latest_contest_name: string | null;
  latest_contest_date: string | null;
  latest_contest_timestamp: number | null;
  summary: StudentSummary[];
  latest_contest_rows: ContestRecord[];
  contests_meta: ContestSummaryMeta[];
  historical_contest_rows: Record<string, ContestRecord[]>;
  stats: PreviewStats;
}

function statusSortPriority(status: ParticipationStatus): number {
  if (status === 'Participated') return 0;
  if (status === 'No History') return 1;
  if (status === 'Not Participated') return 2;
  if (status === 'Profile Unavailable') return 3;
  if (status === 'Access Restricted') return 4;
  if (status === 'Fetch Failed') return 5;
  return 6;
}

export function sortContestRowsByRank(rows: ContestRecord[]): ContestRecord[] {
  return [...rows].sort((a, b) => {
    const pDiff = statusSortPriority(a.participation_status) - statusSortPriority(b.participation_status);
    if (pDiff !== 0) return pDiff;
    const rankA = a.global_rank ?? 1_000_000_000;
    const rankB = b.global_rank ?? 1_000_000_000;
    if (rankA !== rankB) return rankA - rankB;
    return a.row_number - b.row_number;
  });
}

function studentNonParticipationStatus(res: StudentContestFetchResult): ParticipationStatus {
  if (
    res.profile_status === 'Active' &&
    res.weekly_contests.length === 0 &&
    res.attended_contests_count > 0
  ) {
    return 'No History';
  }
  switch (res.profile_status) {
    case 'Invalid Username':
      return 'Invalid Username';
    case 'Profile Unavailable':
      return 'Profile Unavailable';
    case 'Access Restricted':
      return 'Access Restricted';
    case 'Fetch Failed':
      return 'Fetch Failed';
    default:
      return 'Not Participated';
  }
}

export function buildAggregatedDataset(
  students: StudentInput[],
  fetchResultsByUsername: Map<string, StudentContestFetchResult>,
  latestPlatformContest: ContestMetadata | null = null,
  includeDuplicates = false
): AggregatedDataset {
  const effectiveStudents = students.filter((s) => includeDuplicates || !s.is_duplicate);

  const studentResults: { student: StudentInput; res: StudentContestFetchResult }[] = [];
  const contestCatalog = new Map<string, { timestamp: number; dateStr: string }>();

  for (const student of effectiveStudents) {
    let res: StudentContestFetchResult;
    if (!student.is_valid || !student.username) {
      res = {
        row_number: student.row_number,
        student_name: student.student_name,
        profile_url: student.profile_url,
        username: student.username,
        profile_status: 'Invalid Username',
        error_message: student.validation_error || 'Invalid LeetCode profile URL/username.',
        current_rating: null,
        global_ranking: null,
        attended_contests_count: 0,
        weekly_contests: [],
        extra_fields: student.extra_fields,
      };
    } else {
      const cached = fetchResultsByUsername.get(student.username.toLowerCase());
      if (!cached) {
        res = {
          row_number: student.row_number,
          student_name: student.student_name,
          profile_url: student.profile_url,
          username: student.username,
          profile_status: 'Fetch Failed',
          error_message: 'No fetch result available for student.',
          current_rating: null,
          global_ranking: null,
          attended_contests_count: 0,
          weekly_contests: [],
          extra_fields: student.extra_fields,
        };
      } else {
        res = {
          ...cached,
          row_number: student.row_number,
          student_name: student.student_name,
          profile_url: student.profile_url,
          extra_fields: student.extra_fields,
          weekly_contests: cached.weekly_contests.map((rec) => ({
            ...rec,
            row_number: student.row_number,
            student_name: student.student_name,
          })),
        };
      }
    }

    studentResults.push({ student, res });

    for (const rec of res.weekly_contests) {
      const ts = rec.contest_timestamp ?? 0;
      const existing = contestCatalog.get(rec.contest_name);
      if (!existing || ts > existing.timestamp) {
        contestCatalog.set(rec.contest_name, { timestamp: ts, dateStr: rec.contest_date });
      }
    }
  }

  const sortedContests = Array.from(contestCatalog.entries()).sort((a, b) => {
    const tsDiff = b[1].timestamp - a[1].timestamp;
    if (tsDiff !== 0) return tsDiff;
    return b[0].localeCompare(a[0]);
  });

  let latestContestName: string;
  let latestContestDate: string;
  let latestContestTimestamp: number | null;

  if (latestPlatformContest) {
    latestContestName = latestPlatformContest.title;
    latestContestDate = latestPlatformContest.dateStr;
    latestContestTimestamp = latestPlatformContest.startTime;
  } else if (sortedContests.length > 0) {
    latestContestName = sortedContests[0][0];
    latestContestTimestamp = sortedContests[0][1].timestamp;
    latestContestDate = sortedContests[0][1].dateStr;
  } else {
    latestContestName = 'Latest Weekly Contest';
    latestContestDate = 'N/A';
    latestContestTimestamp = null;
  }

  const recordLookup = new Map<string, ContestRecord>();
  for (const { student, res } of studentResults) {
    for (const rec of res.weekly_contests) {
      recordLookup.set(`${student.row_number}::${rec.contest_name}`, rec);
    }
  }

  const buildContestRows = (
    contestName: string,
    contestDate: string,
    contestTs: number | null
  ): ContestRecord[] => {
    const rows: ContestRecord[] = [];
    for (const { student, res } of studentResults) {
      const found = recordLookup.get(`${student.row_number}::${contestName}`);
      if (found) {
        rows.push(found);
      } else {
        rows.push({
          row_number: student.row_number,
          student_name: student.student_name,
          leetcode_username: res.username || student.username || 'N/A',
          contest_name: contestName,
          contest_date: contestDate,
          contest_timestamp: contestTs,
          global_rank: null,
          contest_rating: null,
          problems_solved: null,
          total_problems: null,
          participation_status: studentNonParticipationStatus(res),
        });
      }
    }
    return sortContestRowsByRank(rows);
  };

  const latestContestRows = buildContestRows(
    latestContestName,
    latestContestDate,
    latestContestTimestamp
  );

  const historicalContestRows: Record<string, ContestRecord[]> = {};
  const contestsMeta: ContestSummaryMeta[] = [];

  for (const [contestName, meta] of sortedContests) {
    const rows = buildContestRows(contestName, meta.dateStr, meta.timestamp);
    historicalContestRows[contestName] = rows;
    const participatedCount = rows.filter((r) => r.participation_status === 'Participated').length;
    contestsMeta.push({
      contest_name: contestName,
      contest_date: meta.dateStr,
      contest_timestamp: meta.timestamp,
      participated_count: participatedCount,
      total_students: rows.length,
    });
  }

  const summaryRows: StudentSummary[] = [];
  let activeProfiles = 0;
  let neverParticipated = 0;
  let unavailableOrFailed = 0;

  for (const { student, res } of studentResults) {
    const contests = res.weekly_contests;
    if (res.profile_status === 'Active') {
      activeProfiles += 1;
    } else if (res.profile_status === 'Not Participated') {
      neverParticipated += 1;
    } else {
      unavailableOrFailed += 1;
    }

    const latestRec = contests.length > 0 ? contests[contests.length - 1] : null;
    const ranks = contests
      .map((c) => c.global_rank)
      .filter((r): r is number => r !== null);
    const ratings = contests
      .map((c) => c.contest_rating)
      .filter((r): r is number => r !== null);
    const totalSolved = contests.reduce((acc, c) => acc + (c.problems_solved ?? 0), 0);

    let notes = res.error_message;
    if (student.is_duplicate && student.duplicate_of_row) {
      const dupNote = `Duplicate of row ${student.duplicate_of_row}`;
      notes = notes ? `${dupNote}; ${notes}` : dupNote;
    }

    summaryRows.push({
      row_number: student.row_number,
      student_name: student.student_name,
      leetcode_username: res.username || student.username || 'N/A',
      profile_url: student.profile_url,
      profile_status: res.profile_status,
      weekly_contests_attended:
        contests.length > 0 ? contests.length : res.attended_contests_count,
      latest_contest_name: latestRec ? latestRec.contest_name : null,
      latest_contest_date: latestRec ? latestRec.contest_date : null,
      latest_rank: latestRec ? latestRec.global_rank : null,
      current_rating:
        res.current_rating !== null
          ? res.current_rating
          : latestRec
          ? latestRec.contest_rating
          : null,
      best_rank: ranks.length > 0 ? Math.min(...ranks) : null,
      peak_rating: ratings.length > 0 ? Math.max(...ratings) : null,
      total_problems_solved: totalSolved,
      notes,
      extra_fields: student.extra_fields,
    });
  }

  const latestParticipatedCount = latestContestRows.filter(
    (r) => r.participation_status === 'Participated'
  ).length;

  return {
    latest_contest_name: latestContestName,
    latest_contest_date: latestContestDate,
    latest_contest_timestamp: latestContestTimestamp,
    summary: summaryRows,
    latest_contest_rows: latestContestRows,
    contests_meta: contestsMeta,
    historical_contest_rows: historicalContestRows,
    stats: {
      total_students: summaryRows.length,
      active_profiles: activeProfiles,
      never_participated: neverParticipated,
      unavailable_or_failed: unavailableOrFailed,
      total_weekly_contests: contestsMeta.length,
      latest_contest_participated: latestParticipatedCount,
    },
  };
}

