// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  ReportFilterProvider,
  useReportFilter,
} from "../report-filter-context";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

afterEach(() => {
  cleanup();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <ReportFilterProvider>{children}</ReportFilterProvider>;
}

describe("ReportFilterProvider / useReportFilter", () => {
  it("defaults to a last-30-days window and all municipalities", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    expect(result.current.municipalityId).toBeNull();
    const spanMs = result.current.to.getTime() - result.current.from.getTime();
    // Within a second of exactly 30 days (allowing for render time).
    expect(Math.abs(spanMs - THIRTY_DAYS_MS)).toBeLessThan(1000);
  });

  it("setRange replaces the active window", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    const from = new Date("2026-01-01T00:00:00");
    const to = new Date("2026-02-01T23:59:59");
    act(() => {
      result.current.setRange({ from, to });
    });

    expect(result.current.from).toEqual(from);
    expect(result.current.to).toEqual(to);
  });

  it("setMunicipalityId sets and clears the municipality", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setMunicipalityId("muni-1");
    });
    expect(result.current.municipalityId).toBe("muni-1");

    act(() => {
      result.current.setMunicipalityId(null);
    });
    expect(result.current.municipalityId).toBeNull();
  });

  it("resetTo30d restores the default window and clears municipality", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setRange({
        from: new Date("2020-01-01"),
        to: new Date("2020-01-02"),
      });
      result.current.setMunicipalityId("muni-9");
    });

    act(() => {
      result.current.resetTo30d();
    });

    expect(result.current.municipalityId).toBeNull();
    const spanMs = result.current.to.getTime() - result.current.from.getTime();
    expect(Math.abs(spanMs - THIRTY_DAYS_MS)).toBeLessThan(1000);
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useReportFilter())).toThrow(
      /must be used within a ReportFilterProvider/,
    );
  });
});
