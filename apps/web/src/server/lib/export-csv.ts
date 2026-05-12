export interface CsvColumn<T> {
  key: keyof T;
  label: string;
  format?: (value: unknown) => string;
}

const BOM = "﻿";
const CRLF = "\r\n";

function escapeCell(raw: string): string {
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function renderCell<T>(row: T, col: CsvColumn<T>): string {
  const value = row[col.key];
  if (col.format) return escapeCell(col.format(value));
  if (value === null || value === undefined) return "";
  return escapeCell(String(value));
}

/**
 * Render rows as an RFC 4180 CSV string.
 *
 * - UTF-8 BOM prefix so Excel detects encoding.
 * - CRLF line endings.
 * - Cells containing `"`, `,`, `\r`, or `\n` are wrapped in double quotes;
 *   internal `"` is doubled.
 * - `null` / `undefined` render as empty cells unless a `format` is supplied.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => renderCell(r, c)).join(","))
    .join(CRLF);
  return BOM + header + CRLF + (body.length > 0 ? body + CRLF : "");
}
