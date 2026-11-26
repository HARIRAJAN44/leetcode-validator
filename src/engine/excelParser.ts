import type ExcelJSType from 'exceljs';

import { ExcelJS } from './excelWorkbookLib';
import { StudentInput } from '../types/api';

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

const RESERVED_LEETCODE_PATHS = new Set([
  'u',
  'problems',
  'problemset',
  'contest',
  'contests',
  'explore',
  'discuss',
  'interview',
  'playground',
  'store',
  'subscribe',
  'accounts',
  'submissions',
  'studyplan',
  'list',
  'profile',
  'progress',
  'graphql',
  'api',
  'assessment',
  'company',
  'tag',
  'support',
  'jobs',
  'privacy',
  'terms',
]);

const NAME_HEADER_ALIASES = new Set([
  'student name',
  'student_name',
  'name',
  'student',
  'full name',
  'fullname',
  'candidate name',
]);

const URL_HEADER_ALIASES = new Set([
  'leetcode profile url',
  'leetcode_profile_url',
  'leetcode url',
  'leetcode_url',
  'profile url',
  'profile_url',
  'leetcode profile',
  'leetcode link',
  'profile link',
  'leetcode',
  'url',
  'link',
  'leetcode username',
  'username',
]);

export interface ParsedExcelResult {
  students: StudentInput[];
  extraColumns: string[];
  warnings: string[];
}

function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractPlainCellValue(value: ExcelJSType.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if (typeof obj.hyperlink === 'string' && obj.hyperlink.trim()) {
      return obj.hyperlink.trim();
    }
    if (typeof obj.text === 'string') {
      return obj.text.trim();
    }
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((part) =>
          typeof part === 'object' && part !== null && 'text' in part
            ? String((part as { text?: unknown }).text ?? '')
            : ''
        )
        .join('')
        .trim();
    }
    if ('result' in obj && obj.result !== undefined && obj.result !== null) {
      return typeof obj.result === 'number' ? obj.result : String(obj.result).trim();
    }
  }

  return String(value).trim();
}

export function extractUsernameFromProfile(rawInput: string): {
  username: string | null;
  error: string | null;
} {
  const text = (rawInput || '').trim();
  if (!text) {
    return { username: null, error: 'Missing LeetCode profile URL.' };
  }

  if (!text.includes('/') && !text.includes('.') && !text.includes(':')) {
    if (RESERVED_LEETCODE_PATHS.has(text.toLowerCase())) {
      return {
        username: null,
        error: `'${text}' is a reserved LeetCode path, not a username.`,
      };
    }
    if (USERNAME_PATTERN.test(text)) {
      return { username: text, error: null };
    }
    return { username: null, error: `Invalid LeetCode username format: '${text}'.` };
  }

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`;

  // Parse host and path cleanly without relying on URL polyfill quirks
  const match = candidate.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)([^?#]*)/);
  if (!match) {
    return { username: null, error: `Malformed profile URL: '${text}'.` };
  }

  const host = match[1].toLowerCase().split(':')[0];
  const path = match[2] || '';

  if (host !== 'leetcode.com' && host !== 'www.leetcode.com') {
    return {
      username: null,
      error: `Unsupported host '${host || rawInput}'; expected leetcode.com profile URL.`,
    };
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) {
    return { username: null, error: 'LeetCode URL does not contain a username.' };
  }

  let username: string;
  if (segments[0].toLowerCase() === 'u') {
    if (segments.length < 2) {
      return { username: null, error: 'LeetCode /u/ URL is missing the username segment.' };
    }
    username = segments[1];
  } else {
    if (RESERVED_LEETCODE_PATHS.has(segments[0].toLowerCase())) {
      return {
        username: null,
        error: `URL points to LeetCode '/${segments[0]}' section, not a user profile.`,
      };
    }
    username = segments[0];
  }

  username = username.trim();
  if (RESERVED_LEETCODE_PATHS.has(username.toLowerCase())) {
    return {
      username: null,
      error: `Extracted segment '${username}' is a reserved LeetCode path.`,
    };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return {
      username: null,
      error: `Invalid LeetCode username '${username}' extracted from URL.`,
    };
  }

  return { username, error: null };
}

function detectHeaderRow(rows: (string | number | null)[][]): {
  headerRowIdx: number;
  nameCol: number;
  urlCol: number;
  extraColumns: { colIdx: number; headerName: string }[];
} {
  const scanLimit = Math.min(rows.length, 10);
  for (let rowIdx = 0; rowIdx < scanLimit; rowIdx += 1) {
    const row = rows[rowIdx];
    const normalized = row.map((cell) => normalizeHeader(cell));
    let nameCol = -1;
    let urlCol = -1;

    for (let colIdx = 0; colIdx < normalized.length; colIdx += 1) {
      const norm = normalized[colIdx];
      if (!norm) continue;
      if (nameCol === -1 && NAME_HEADER_ALIASES.has(norm)) {
        nameCol = colIdx;
      } else if (urlCol === -1 && URL_HEADER_ALIASES.has(norm)) {
        urlCol = colIdx;
      }
    }

    if (nameCol === -1) {
      for (let colIdx = 0; colIdx < normalized.length; colIdx += 1) {
        const norm = normalized[colIdx];
        if (norm.includes('student') || norm === 'name') {
          nameCol = colIdx;
          break;
        }
      }
    }

    if (urlCol === -1) {
      for (let colIdx = 0; colIdx < normalized.length; colIdx += 1) {
        if (colIdx === nameCol) continue;
        const norm = normalized[colIdx];
        if (
          norm.includes('leetcode') ||
          norm.includes('profile') ||
          norm.includes('url') ||
          norm.includes('username')
        ) {
          urlCol = colIdx;
          break;
        }
      }
    }

    if (nameCol !== -1 && urlCol !== -1) {
      const extraColumns: { colIdx: number; headerName: string }[] = [];
      for (let colIdx = 0; colIdx < row.length; colIdx += 1) {
        if (colIdx === nameCol || colIdx === urlCol) continue;
        const headerVal = row[colIdx];
        const headerText = headerVal !== null && headerVal !== undefined ? String(headerVal).trim() : '';
        if (headerText) {
          extraColumns.push({ colIdx, headerName: headerText });
        }
      }
      return { headerRowIdx: rowIdx, nameCol, urlCol, extraColumns };
    }
  }

  throw new Error(
    "Could not find required columns in Excel file. Please include 'Student Name' and 'LeetCode Profile URL' (or 'LeetCode URL') headers."
  );
}

export async function parseStudentsExcelBuffer(buffer: ArrayBuffer): Promise<ParsedExcelResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid or corrupted Excel (.xlsx) file: ${msg}`);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Excel workbook contains no worksheets.');
  }

  const rows: (string | number | null)[][] = [];
  const totalRows = worksheet.rowCount;
  const colCount = Math.max(worksheet.columnCount, 1);

  for (let r = 1; r <= totalRows; r += 1) {
    const row = worksheet.getRow(r);
    const parsedRow: (string | number | null)[] = [];
    for (let c = 1; c <= colCount; c += 1) {
      parsedRow.push(extractPlainCellValue(row.getCell(c).value));
    }
    rows.push(parsedRow);
  }

  if (rows.length === 0) {
    throw new Error('The first worksheet in the Excel file is empty.');
  }

  const { headerRowIdx, nameCol, urlCol, extraColumns } = detectHeaderRow(rows);
  const extraColNames = extraColumns.map((c) => c.headerName);

  const students: StudentInput[] = [];
  const warnings: string[] = [];
  const seenUsernames = new Map<string, number>();

  for (let idx = headerRowIdx + 1; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const rowNumber = idx + 1;

    const isBlank = row.every((cell) => cell === null || String(cell).trim() === '');
    if (isBlank) continue;

    const rawName = row[nameCol];
    const rawUrl = row[urlCol];
    let studentName = rawName !== null && rawName !== undefined ? String(rawName).trim() : '';
    const profileUrl = rawUrl !== null && rawUrl !== undefined ? String(rawUrl).trim() : '';

    const extraFields: Record<string, string | number> = {};
    for (const colDef of extraColumns) {
      const val = row[colDef.colIdx];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        extraFields[colDef.headerName] = val;
      }
    }

    if (!studentName && !profileUrl) continue;

    if (!studentName) {
      studentName = `Row ${rowNumber}`;
      warnings.push(`Row ${rowNumber}: Missing student name; defaulted to '${studentName}'.`);
    }

    const { username, error } = extractUsernameFromProfile(profileUrl);
    const isValid = error === null;
    let isDuplicate = false;
    let duplicateOfRow: number | null = null;

    if (isValid && username !== null) {
      const key = username.toLowerCase();
      const firstRow = seenUsernames.get(key);
      if (firstRow !== undefined) {
        isDuplicate = true;
        duplicateOfRow = firstRow;
        warnings.push(
          `Row ${rowNumber} (${studentName}): Duplicate LeetCode username '${username}' (already listed at row ${firstRow}).`
        );
      } else {
        seenUsernames.set(key, rowNumber);
      }
    } else if (error) {
      warnings.push(`Row ${rowNumber} (${studentName}): ${error}`);
    }

    students.push({
      row_number: rowNumber,
      student_name: studentName,
      profile_url: profileUrl,
      username,
      is_valid: isValid,
      is_duplicate: isDuplicate,
      duplicate_of_row: duplicateOfRow,
      validation_error: error,
      extra_fields: extraFields,
    });
  }

  if (students.length === 0) {
    throw new Error('No student rows were found below the header row.');
  }

  return {
    students,
    extraColumns: extraColNames,
    warnings,
  };
}

export async function generateSampleWorkbookBytes(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(['Student Name', 'LeetCode Profile URL', 'Roll Number', 'Department']);
  ws.addRow(['Neal Wu', 'https://leetcode.com/u/neal_wu/', 'CS2026-001', 'CSE']);
  ws.addRow(['Lee215', 'https://leetcode.com/u/lee215/', 'CS2026-002', 'CSE']);
  ws.addRow(['Votrubac', 'https://leetcode.com/u/votrubac/', 'CS2026-003', 'IT']);
  ws.addRow(['Tourist (Never Participated)', 'https://leetcode.com/u/tourist/', 'CS2026-004', 'ECE']);
  ws.addRow(['Duplicate Neal', 'https://leetcode.com/neal_wu/', 'CS2026-005', 'CSE']);
  ws.addRow(['Non-Existent Profile', 'https://leetcode.com/u/lct_nonexistent_profile_999/', 'CS2026-006', 'MECH']);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

