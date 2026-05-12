import { describe, it, expect } from "vitest";
import { renderExportPdf } from "../export-pdf";

describe("renderExportPdf", () => {
  it(
    "returns a non-empty Buffer starting with %PDF for representative props",
    async () => {
      const buf = await renderExportPdf({
        entity: "Events",
        tenantName: "Acme Marine",
        filterSummary: "priority>=200",
        generatedAt: new Date("2026-05-12T10:00:00Z"),
        columns: [
          { key: "title", label: "Title" },
          { key: "priority", label: "Priority" },
        ],
        rows: [
          { title: "Boat incident", priority: 200 },
          { title: "Patrol report", priority: 100 },
        ],
      });

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    },
    20000,
  );

  it(
    "renders successfully with zero rows (empty table)",
    async () => {
      const buf = await renderExportPdf({
        entity: "Patrols",
        tenantName: "Acme Marine",
        filterSummary: "no filters",
        generatedAt: new Date("2026-05-12T10:00:00Z"),
        columns: [{ key: "name", label: "Name" }],
        rows: [],
      });

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(0);
    },
    20000,
  );
});
