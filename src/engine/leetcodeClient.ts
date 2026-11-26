import {
  ContestRecord,
  ParticipationStatus,
  StudentContestFetchResult,
  StudentInput,
} from '../types/api';

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_DELAY_MS = 350;
const DEFAULT_JITTER_MS = 250;

const USER_CONTEST_QUERY = `
query userContestRankingInfo($username: String!) {
  matchedUser(username: $username) {
    username
  }
  userContestRanking(username: $username) {
    attendedContestsCount
    rating
    globalRanking
    totalParticipants
    topPercentage
  }
  userContestBaseRating(username: $username) {
    rating
    attendedContestsCount
  }
  userContestRankingHistory(username: $username) {
    attended
    trendDirection
    problemsSolved
    totalProblems
    finishTimeInSeconds
    rating
    ranking
    contest {
      title
      startTime
    }
  }
}
`;

const PAST_CONTESTS_QUERY = `
query pastContests($pageNo: Int, $numPerPage: Int) {
  pastContests(pageNo: $pageNo, numPerPage: $numPerPage) {
    data {
      title
      titleSlug
      startTime
      duration
    }
  }
}
`;

export interface ContestMetadata {
  title: string;
  startTime: number;
  dateStr: string;
}

export function isWeeklyContestTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return title.trim().toLowerCase().startsWith('weekly contest');
}

export function formatContestDate(startTime: number | null | undefined): string {
  if (startTime === null || startTime === undefined) return 'N/A';
  return new Date(startTime * 1000).toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeChallengeOrBlocked(status: number, bodyText: string): boolean {
  if (status === 403) return true;
  const lower = bodyText.slice(0, 1000).toLowerCase();
  return (
    lower.includes('cf-browser-verification') ||
    lower.includes('captcha') ||
    lower.includes('just a moment') ||
    lower.includes('<html')
  );
}

class AccessRestrictedError extends Error {}

async function postGraphql(
  query: string,
  variables: Record<string, unknown> = {},
  options?: { delayMs?: number; jitterMs?: number; maxRetries?: number }
): Promise<Record<string, unknown>> {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const jitterMs = options?.jitterMs ?? DEFAULT_JITTER_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt === 0 && delayMs > 0) {
      await sleep(delayMs + Math.random() * jitterMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(LEETCODE_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Referer: 'https://leetcode.com/',
          Origin: 'https://leetcode.com',
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      const bodyText = await response.text();

      if (looksLikeChallengeOrBlocked(response.status, bodyText)) {
        throw new AccessRestrictedError(
          `LeetCode returned access restriction/challenge (HTTP ${response.status}).`
        );
      }

      if (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) {
        const retryAfterRaw = response.headers.get('retry-after');
        const backoffMs =
          retryAfterRaw && /^\d+$/.test(retryAfterRaw)
            ? Math.min(Number(retryAfterRaw) * 1000, 15000)
            : Math.pow(1.5, attempt) * 1000 + 200 + Math.random() * 600;
        if (attempt < maxRetries) {
          await sleep(backoffMs);
          continue;
        }
        throw new Error(`HTTP ${response.status} from LeetCode GraphQL.`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from LeetCode GraphQL.`);
      }

      const parsed = JSON.parse(bodyText) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Unexpected non-JSON-object response from LeetCode GraphQL.');
      }
      return parsed;
    } catch (err) {
      if (err instanceof AccessRestrictedError) {
        throw err;
      }
      lastError = err;
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(1.5, attempt) * 1000 + 200 + Math.random() * 500;
        await sleep(backoffMs);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `Failed to query LeetCode GraphQL after ${maxRetries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

export async function testLeetCodeConnection(): Promise<ContestMetadata | null> {
  const payload = await postGraphql(
    PAST_CONTESTS_QUERY,
    { pageNo: 1, numPerPage: 10 },
    { delayMs: 0, jitterMs: 0, maxRetries: 1 }
  );
  const data = (payload.data as Record<string, unknown> | undefined) || {};
  const pastContests = (data.pastContests as Record<string, unknown> | undefined) || {};
  const items = Array.isArray(pastContests.data) ? pastContests.data : [];

  const weekly = items.filter((item): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null && isWeeklyContestTitle(String(item.title ?? ''))
  );
  if (weekly.length === 0) return null;

  weekly.sort((a, b) => Number(b.startTime ?? 0) - Number(a.startTime ?? 0));
  const latest = weekly[0];
  const startTime = Number(latest.startTime ?? 0);
  return {
    title: String(latest.title).trim(),
    startTime,
    dateStr: formatContestDate(startTime || null),
  };
}

export async function fetchLatestWeeklyContest(): Promise<ContestMetadata | null> {
  try {
    return await testLeetCodeConnection();
  } catch {
    return null;
  }
}

export async function fetchStudentContests(student: StudentInput): Promise<StudentContestFetchResult> {
  if (!student.is_valid || !student.username) {
    return {
      row_number: student.row_number,
      student_name: student.student_name,
      profile_url: student.profile_url,
      username: student.username,
      profile_status: 'Invalid Username',
      error_message: student.validation_error || 'Invalid LeetCode username.',
      current_rating: null,
      global_ranking: null,
      attended_contests_count: 0,
      weekly_contests: [],
      extra_fields: student.extra_fields,
    };
  }

  const username = student.username;
  let payload: Record<string, unknown>;

  try {
    payload = await postGraphql(USER_CONTEST_QUERY, { username });
  } catch (err) {
    const status =
      err instanceof AccessRestrictedError ? 'Access Restricted' : 'Fetch Failed';
    return {
      row_number: student.row_number,
      student_name: student.student_name,
      profile_url: student.profile_url,
      username,
      profile_status: status,
      error_message: err instanceof Error ? err.message : String(err),
      current_rating: null,
      global_ranking: null,
      attended_contests_count: 0,
      weekly_contests: [],
      extra_fields: student.extra_fields,
    };
  }

  const data = (payload.data as Record<string, unknown> | undefined) || {};
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const matchedUser = data.matchedUser as Record<string, unknown> | null | undefined;

  if (!matchedUser) {
    const errMsg =
      errors
        .map((e) => (typeof e === 'object' && e !== null ? String((e as { message?: unknown }).message ?? '') : ''))
        .filter(Boolean)
        .join('; ') || `LeetCode profile '${username}' does not exist or is unavailable.`;

    return {
      row_number: student.row_number,
      student_name: student.student_name,
      profile_url: student.profile_url,
      username,
      profile_status: 'Profile Unavailable',
      error_message: errMsg,
      current_rating: null,
      global_ranking: null,
      attended_contests_count: 0,
      weekly_contests: [],
      extra_fields: student.extra_fields,
    };
  }

  const canonicalUsername = String(matchedUser.username || username);
  const rankingSummary = (data.userContestRanking as Record<string, unknown> | null | undefined) || {};
  const baseRatingSummary = (data.userContestBaseRating as Record<string, unknown> | null | undefined) || {};
  const rawHistory = Array.isArray(data.userContestRankingHistory)
    ? data.userContestRankingHistory
    : [];

  const weeklyRecords: ContestRecord[] = [];
  for (const entry of rawHistory) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (!item.attended) continue;

    const contestInfo = (item.contest as Record<string, unknown> | undefined) || {};
    const title = String(contestInfo.title || '').trim();
    if (!isWeeklyContestTitle(title)) continue;

    const startTimeVal = contestInfo.startTime;
    const startTime =
      startTimeVal !== null && startTimeVal !== undefined ? Number(startTimeVal) : null;
    const ratingVal = item.rating;
    const rankingVal = item.ranking;
    const solvedVal = item.problemsSolved;
    const totalVal = item.totalProblems;

    weeklyRecords.push({
      row_number: student.row_number,
      student_name: student.student_name,
      leetcode_username: canonicalUsername,
      contest_name: title,
      contest_date: formatContestDate(startTime),
      contest_timestamp: startTime,
      global_rank: rankingVal !== null && rankingVal !== undefined ? Math.trunc(Number(rankingVal)) : null,
      contest_rating:
        ratingVal !== null && ratingVal !== undefined ? Math.round(Number(ratingVal) * 100) / 100 : null,
      problems_solved: solvedVal !== null && solvedVal !== undefined ? Math.trunc(Number(solvedVal)) : null,
      total_problems: totalVal !== null && totalVal !== undefined ? Math.trunc(Number(totalVal)) : null,
      participation_status: 'Participated',
    });
  }

  weeklyRecords.sort(
    (a, b) => (a.contest_timestamp ?? 0) - (b.contest_timestamp ?? 0) || a.contest_name.localeCompare(b.contest_name)
  );

  const currentRatingRaw = rankingSummary.rating ?? baseRatingSummary.rating;
  const globalRankRaw = rankingSummary.globalRanking;
  const baseAttendedRaw = baseRatingSummary.attendedContestsCount;
  const baseAttendedCount =
    baseAttendedRaw !== null && baseAttendedRaw !== undefined
      ? Math.max(0, Math.trunc(Number(baseAttendedRaw)))
      : 0;
  const attendedContestsCount =
    weeklyRecords.length > 0 ? weeklyRecords.length : baseAttendedCount;
  const profileStatus = attendedContestsCount > 0 ? 'Active' : 'Not Participated';
  const noteMessage =
    weeklyRecords.length === 0 && baseAttendedCount > 0
      ? `${baseAttendedCount} contest(s) attended; LeetCode hides per-contest history until 6 contests.`
      : null;

  return {
    row_number: student.row_number,
    student_name: student.student_name,
    profile_url: student.profile_url,
    username: canonicalUsername,
    profile_status: profileStatus,
    error_message: noteMessage,
    current_rating:
      currentRatingRaw !== null && currentRatingRaw !== undefined
        ? Math.round(Number(currentRatingRaw) * 100) / 100
        : null,
    global_ranking:
      globalRankRaw !== null && globalRankRaw !== undefined ? Math.trunc(Number(globalRankRaw)) : null,
    attended_contests_count: attendedContestsCount,
    weekly_contests: weeklyRecords,
    extra_fields: student.extra_fields,
  };
}
