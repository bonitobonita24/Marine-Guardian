import { describe, it, expect } from "vitest";
import { toCsv } from "../export-csv";

interface Row {
  name: string;
  count: number | null;
  notes: string | null;
}

const columns = [
  { key: "name" as const, label: "Name" },
  {
    key: "count" as const,
    label: "Count",
    format: (v: unknown) => {
      if (typeof v !== "number" && typeof v !== "string") return "";
      return String(v);
    },
  },
  { key: "notes" as const, label: "Notes" },
];

describe("toCsv", () => {
  it("emits BOM + CRLF + header row even for empty rows", () => {
    const out = toCsv<Row>([], columns);
    expect(out).toBe("﻿Name,Count,Notes\r\n");
  });

  it("emits plain rows without quoting when no special characters present", () => {
    const out = toCsv<Row>([{ name: "Alpha", count: 3, notes: "ok" }], columns);
    expect(out).toContain("Alpha,3,ok\r\n");
  });

  it("wraps fields containing commas in double quotes (RFC 4180)", () => {
    const out = toCsv<Row>(
      [{ name: "Smith, John", count: 1, notes: "x" }],
      columns,
    );
    expect(out).toContain('"Smith, John",1,x\r\n');
  });

  it("doubles internal double-quotes and wraps the cell (RFC 4180)", () => {
    const out = toCsv<Row>(
      [{ name: 'He said "hi"', count: 1, notes: "x" }],
      columns,
    );
    expect(out).toContain('"He said ""hi""",1,x\r\n');
  });

  it("wraps fields containing newlines in double quotes", () => {
    const out = toCsv<Row>(
      [{ name: "line1\nline2", count: 1, notes: "x" }],
      columns,
    );
    expect(out).toContain('"line1\nline2",1,x\r\n');
  });

  it("wraps fields containing CR in double quotes", () => {
    const out = toCsv<Row>(
      [{ name: "line1\rline2", count: 1, notes: "x" }],
      columns,
    );
    expect(out).toContain('"line1\rline2",1,x\r\n');
  });

  it("renders null and undefined as empty cells", () => {
    const out = toCsv<Row>([{ name: "x", count: null, notes: null }], columns);
    expect(out).toContain("x,,\r\n");
  });

  it("applies the per-column format function when provided", () => {
    const out = toCsv<Row>(
      [{ name: "x", count: 42, notes: "y" }],
      columns,
    );
    expect(out).toContain("x,42,y\r\n");
  });

  it("prefixes output with UTF-8 BOM for Excel compatibility", () => {
    const out = toCsv<Row>([{ name: "x", count: 1, notes: "y" }], columns);
    expect(out.charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings between rows", () => {
    const out = toCsv<Row>(
      [
        { name: "a", count: 1, notes: "x" },
        { name: "b", count: 2, notes: "y" },
      ],
      columns,
    );
    const dataPortion = out.slice(1); // strip BOM
    expect(dataPortion.split("\r\n").length).toBeGreaterThanOrEqual(3); // header + 2 rows + trailing
  });
});
