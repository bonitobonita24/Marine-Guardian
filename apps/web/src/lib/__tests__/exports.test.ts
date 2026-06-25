import { describe, it, expect } from "vitest";
import { buildExportUrl } from "../exports";

describe("buildExportUrl", () => {
  it("produces a base URL with only format when filters are empty", () => {
    const url = buildExportUrl("events", {}, "csv");
    expect(url).toBe("/api/exports/events?format=csv");
  });

  it("appends state filter to the export URL", () => {
    const url = buildExportUrl("events", { state: "new_event" }, "csv");
    expect(url).toContain("state=new_event");
    expect(url).toContain("format=csv");
  });

  it("appends category filter to the export URL", () => {
    const url = buildExportUrl("events", { category: "Law Enforcement" }, "csv");
    expect(url).toContain("category=Law+Enforcement");
  });

  it("appends areaName filter to the export URL", () => {
    const url = buildExportUrl("events", { areaName: "Palawan" }, "csv");
    expect(url).toContain("areaName=Palawan");
  });

  it("appends dateFrom and dateTo when monthFilter is active (expanded ISO strings)", () => {
    const dateFrom = "2026-05-01T00:00:00.000Z";
    const dateTo   = "2026-05-31T23:59:59.999Z";
    const url = buildExportUrl("events", { dateFrom, dateTo }, "pdf");
    expect(url).toContain("dateFrom=");
    expect(url).toContain("dateTo=");
    expect(url).toContain("format=pdf");
  });

  it("omits undefined and empty-string filter values", () => {
    const url = buildExportUrl("events", { state: "", category: undefined, areaName: null }, "csv");
    expect(url).toBe("/api/exports/events?format=csv");
  });

  it("combines multiple active filters in the URL", () => {
    const url = buildExportUrl(
      "events",
      { state: "active", category: "Law Enforcement", areaName: "Palawan" },
      "csv",
    );
    expect(url).toContain("state=active");
    expect(url).toContain("category=Law+Enforcement");
    expect(url).toContain("areaName=Palawan");
    expect(url).toContain("format=csv");
  });
});
