/**
 * TypeScript models for Standalone On-Device LeetCode Contest Tracker.
 */

export type JobState = 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed';

export type ParticipationStatus =
  | 'Participated'
  | 'Not Participated'
  | 'No History'
  | 'Profile Unavailable'
  | 'Invalid Username'
  | 'Fetch Failed'
  | 'Access Restricted';

export interface StudentInput {
  row_number: number;
  student_name: string;
  profile_url: string;
  username: string | null;
  is_valid: boolean;
  is_duplicate: boolean;
  duplicate_of_row: number | null;
  validation_error: string | null;
  extra_fields: Record<string, string | number>;
}

export interface UploadResponse {
  job_id: string;
  filename: string;
  total_rows: number;
  valid_students: number;
  invalid_rows: number;
  duplicate_rows: number;
  unique_valid_students: number;
  extra_columns: string[];
  warnings: string[];
  students: StudentInput[];
  status: JobState;
}

export interface ContestRecord {
  row_number: number;
  student_name: string;
  leetcode_username: string;
  contest_name: string;
  contest_date: string;
  contest_timestamp: number | null;
  global_rank: number | null;
  contest_rating: number | null;
  problems_solved: number | null;
  total_problems: number | null;
  participation_status: ParticipationStatus;
}

export interface StudentContestFetchResult {
  row_number: number;
  student_name: string;
  profile_url: string;
  username: string | null;
  profile_status: string;
  error_message: string | null;
  current_rating: number | null;
  global_ranking: number | null;
  attended_contests_count: number;
  weekly_contests: ContestRecord[];
  extra_fields: Record<string, string | number>;
}

export interface StudentSummary {
  row_number: number;
  student_name: string;
  leetcode_username: string;
  profile_url: string;
  profile_status: string;
  weekly_contests_attended: number;
  latest_contest_name: string | null;
  latest_contest_date: string | null;
  latest_rank: number | null;
  current_rating: number | null;
  best_rank: number | null;
  peak_rating: number | null;
  total_problems_solved: number;
  notes: string | null;
  extra_fields: Record<string, string | number>;
}

export interface ContestSummaryMeta {
  contest_name: string;
  contest_date: string;
  contest_timestamp: number | null;
  participated_count: number;
  total_students: number;
}

export interface PreviewStats {
  total_students: number;
  active_profiles: number;
  never_participated: number;
  unavailable_or_failed: number;
  total_weekly_contests: number;
  latest_contest_participated: number;
}

export interface JobStatusResponse {
  job_id: string;
  filename: string;
  status: JobState;
  created_at: string;
  updated_at: string;
  total_students: number;
  processed_students: number;
  succeeded_students: number;
  failed_students: number;
  current_student: string | null;
  progress_percent: number;
  total_weekly_contests: number;
  latest_contest_name: string | null;
  latest_contest_date: string | null;
  error_message: string | null;
  download_ready: boolean;
  output_filename: string | null;
  output_uri: string | null;
  warnings: string[];
}

export interface JobListItem {
  job_id: string;
  filename: string;
  status: JobState;
  created_at: string;
  updated_at: string;
  total_students: number;
  valid_students: number;
  total_weekly_contests: number;
  latest_contest_name: string | null;
  download_ready: boolean;
  output_filename: string | null;
  output_uri: string | null;
}

export interface PreviewResponse {
  job_id: string;
  filename: string;
  latest_contest_name: string | null;
  latest_contest_date: string | null;
  stats: PreviewStats;
  summary: StudentSummary[];
  latest_contest_rows: ContestRecord[];
  available_contests: ContestSummaryMeta[];
  selected_contest: string | null;
  selected_contest_rows: ContestRecord[];
  extra_columns: string[];
  warnings: string[];
}

export type RootStackParamList = {
  Home: undefined;
  Upload: undefined;
  Processing: { jobId: string; filename: string };
  ResultsPreview: { jobId: string };
  Download: { jobId: string; filename?: string };
  History: undefined;
};
