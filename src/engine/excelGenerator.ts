import type ExcelJSType from 'exceljs';

import { AggregatedDataset } from './aggregator';
import { ExcelJS } from './excelWorkbookLib';
import { ContestRecord, StudentSummary } from '../types/api';

export const CONTEST_SHEET_HEADERS = [
  'Student Name',
  'LeetCode Username',
  'Contest Name',
  'Contest Date',
  'Global Rank',
  'Contest Rating',
  'Problems Solved',
  'Total Problems',
  'Participation Status',
];

const HEADER_FILL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF15803D' },
};

const HEADER_FONT: Partial<ExcelJSType.Font> = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};

const ZEBRA_GREEN_FILL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF0FDF4' },
};

const WHITE_FILL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFFFF' },
};

const PARTICIPATED_BADGE_FILL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFDCFCE7' },
};

const PARTICIPATED_BADGE_FONT: Partial<ExcelJSType.Font> = {
  name: 'Calibri',
  size: 10,
  bold: true,
  color: { argb: 'FF166534' },
};

const MISSING_ROW_FILL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFBEB' },
};

const MISSING_BADGE_FILL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEF3C7' },
};

const MISSING_BADGE_FONT: Partial<ExcelJSType.Font> = {
  name: 'Calibri',
  size: 10,
  bold: true,
  color: { argb: 'FF92400E' },
};

const ERROR_ROW_FILL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEF2F2' },
};

const ERROR_BADGE_FILL: ExcelJSType.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEE2E2' },
};

const ERROR_BADGE_FONT: Partial<ExcelJSType.Font> = {
  name: 'Calibri',
  size: 10,
  bold: true,
  color: { argb: 'FF991B1B' },
};

const BODY_FONT: Partial<ExcelJSType.Font> = {
  name: 'Calibri',
  size: 10,
  color: { argb: 'FF1E293B' },
};

const BOLD_BODY_FONT: Partial<ExcelJSType.Font> = {
  name: 'Calibri',
  size: 10,
  bold: true,
  color: { argb: 'FF0F172A' },
};

const CELL_BORDER: Partial<ExcelJSType.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

export function sanitizeSheetTitle(title: string, usedTitles: Set<string>): string {
  const cleaned = title.replace(/[:\\/?*[\]]/g, '-').trim() || 'Sheet';
  const base = cleaned.slice(0, 31);
  let candidate = base;
  let suffix = 2;

  const hasCaseInsensitive = (name: string) =>
    Array.from(usedTitles).some((t) => t.toLowerCase() === name.toLowerCase());

  while (hasCaseInsensitive(candidate)) {
    const tag = ` (${suffix})`;
    candidate = `${base.slice(0, 31 - tag.length)}${tag}`;
    suffix += 1;
  }

  usedTitles.add(candidate);
  return candidate;
}

function colNumberToLetter(col: number): string {
  let n = col;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function styleHeaderRow(ws: ExcelJSType.Worksheet, headers: string[]): void {
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headers.forEach((header, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = header;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = CELL_BORDER;
  });
}

function applyRowStyling(
  ws: ExcelJSType.Worksheet,
  rowIdx: number,
  numCols: number,
  statusColIdx: number,
  statusValue: string,
  numericCols: Set<number>,
  ratingCols: Set<number>
): void {
  const row = ws.getRow(rowIdx);
  row.height = 22;

  const isParticipated = statusValue === 'Participated' || statusValue === 'Active';
  const isNotParticipated =
    statusValue === 'Not Participated' || statusValue === 'No History';

  const rowFill = isParticipated
    ? rowIdx % 2 === 1
      ? ZEBRA_GREEN_FILL
      : WHITE_FILL
    : isNotParticipated
    ? MISSING_ROW_FILL
    : ERROR_ROW_FILL;

  const badgeFill = isParticipated
    ? PARTICIPATED_BADGE_FILL
    : isNotParticipated
    ? MISSING_BADGE_FILL
    : ERROR_BADGE_FILL;

  const badgeFont = isParticipated
    ? PARTICIPATED_BADGE_FONT
    : isNotParticipated
    ? MISSING_BADGE_FONT
    : ERROR_BADGE_FONT;

  for (let colIdx = 1; colIdx <= numCols; colIdx += 1) {
    const cell = row.getCell(colIdx);
    cell.border = CELL_BORDER;

    if (colIdx === statusColIdx) {
      cell.fill = badgeFill;
      cell.font = badgeFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      cell.fill = rowFill;
      cell.font = colIdx === 1 ? BOLD_BODY_FONT : BODY_FONT;
      if (ratingCols.has(colIdx) && typeof cell.value === 'number') {
        cell.numFmt = '0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (numericCols.has(colIdx) && typeof cell.value === 'number') {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (cell.value === 'N/A') {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
  }
}

function finalizeTableSheet(
  ws: ExcelJSType.Worksheet,
  numRows: number,
  numCols: number
): void {
  ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
  const lastColLetter = colNumberToLetter(numCols);
  const lastRow = Math.max(1, numRows);
  ws.autoFilter = `A1:${lastColLetter}${lastRow}`;

  for (let colIdx = 1; colIdx <= numCols; colIdx += 1) {
    let maxLen = 0;
    for (let r = 1; r <= lastRow; r += 1) {
      const val = ws.getRow(r).getCell(colIdx).value;
      const str = val !== null && val !== undefined ? String(val) : '';
      if (str.length > maxLen) maxLen = str.length;
    }
    ws.getColumn(colIdx).width = Math.max(12, Math.min(40, maxLen + 4));
  }
}

function writeSummarySheet(
  ws: ExcelJSType.Worksheet,
  summaryRows: StudentSummary[],
  extraColumns: string[]
): void {
  const headers = [
    'Student Name',
    'LeetCode Username',
    'Profile URL',
    ...extraColumns,
    'Profile Status',
    'Weekly Contests Attended',
    'Latest Weekly Contest',
    'Latest Contest Date',
    'Latest Global Rank',
    'Current Rating',
    'Best Rank',
    'Peak Rating',
    'Total Problems Solved',
    'Notes',
  ];
  styleHeaderRow(ws, headers);

  const extraOffset = extraColumns.length;
  const statusColIdx = 4 + extraOffset;
  const numericCols = new Set([
    5 + extraOffset,
    8 + extraOffset,
    10 + extraOffset,
    12 + extraOffset,
  ]);
  const ratingCols = new Set([9 + extraOffset, 11 + extraOffset]);

  summaryRows.forEach((item, index) => {
    const rowIdx = index + 2;
    const values: (string | number)[] = [
      item.student_name,
      item.leetcode_username,
      item.profile_url,
      ...extraColumns.map((col) => item.extra_fields[col] ?? ''),
      item.profile_status,
      item.weekly_contests_attended,
      item.latest_contest_name || 'N/A',
      item.latest_contest_date || 'N/A',
      item.latest_rank !== null ? item.latest_rank : 'N/A',
      item.current_rating !== null ? item.current_rating : 'N/A',
      item.best_rank !== null ? item.best_rank : 'N/A',
      item.peak_rating !== null ? item.peak_rating : 'N/A',
      item.total_problems_solved,
      item.notes || '',
    ];
    const row = ws.getRow(rowIdx);
    values.forEach((val, colOffset) => {
      row.getCell(colOffset + 1).value = val;
    });

    applyRowStyling(
      ws,
      rowIdx,
      headers.length,
      statusColIdx,
      item.profile_status,
      numericCols,
      ratingCols
    );
  });

  finalizeTableSheet(ws, summaryRows.length + 1, headers.length);
}

function writeContestSheet(ws: ExcelJSType.Worksheet, rows: ContestRecord[]): void {
  styleHeaderRow(ws, CONTEST_SHEET_HEADERS);
  const numericCols = new Set([5, 7, 8]);
  const ratingCols = new Set([6]);
  const statusColIdx = 9;

  rows.forEach((rec, index) => {
    const rowIdx = index + 2;
    const values: (string | number)[] = [
      rec.student_name,
      rec.leetcode_username,
      rec.contest_name,
      rec.contest_date,
      rec.global_rank !== null ? rec.global_rank : 'N/A',
      rec.contest_rating !== null ? rec.contest_rating : 'N/A',
      rec.problems_solved !== null ? rec.problems_solved : 'N/A',
      rec.total_problems !== null ? rec.total_problems : 'N/A',
      rec.participation_status,
    ];
    const row = ws.getRow(rowIdx);
    values.forEach((val, colOffset) => {
      row.getCell(colOffset + 1).value = val;
    });

    applyRowStyling(
      ws,
      rowIdx,
      CONTEST_SHEET_HEADERS.length,
      statusColIdx,
      rec.participation_status,
      numericCols,
      ratingCols
    );
  });

  finalizeTableSheet(ws, rows.length + 1, CONTEST_SHEET_HEADERS.length);
}

export async function generateContestWorkbookBytes(
  dataset: AggregatedDataset,
  extraColumns: string[]
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LeetCode Contest Tracker (Standalone)';
  workbook.created = new Date();

  const usedTitles = new Set<string>();

  const summaryWs = workbook.addWorksheet(sanitizeSheetTitle('Summary', usedTitles));
  writeSummarySheet(summaryWs, dataset.summary, extraColumns);

  const latestWs = workbook.addWorksheet(
    sanitizeSheetTitle('Latest Weekly Contest', usedTitles)
  );
  writeContestSheet(latestWs, dataset.latest_contest_rows);

  for (const contestMeta of dataset.contests_meta) {
    const rows = dataset.historical_contest_rows[contestMeta.contest_name] ?? [];
    const sheetTitle = sanitizeSheetTitle(contestMeta.contest_name, usedTitles);
    const contestWs = workbook.addWorksheet(sheetTitle);
    writeContestSheet(contestWs, rows);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

