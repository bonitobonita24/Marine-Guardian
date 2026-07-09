// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  ReportFilterProvider,
  useReportFilter,
} from "../report-filter-context";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

afterEach(() => {
  cleanup();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <ReportFilterProvider>{children}</ReportFilterProvider>;
}

describe("ReportFilterProvider / useReportFilter", () => {
  it("defaults to a last-7-days window and all municipalities", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    expect(result.current.municipalityId).toBeNull();
    const spanMs = result.current.to.getTime() - result.current.from.getTime();
    // Within a second of exactly 7 days (allowing for render time).
    expect(Math.abs(spanMs - SEVEN_DAYS_MS)).toBeLessThan(1000);
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

  it("resetRange restores the default window and clears municipality", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setRange({
        from: new Date("2020-01-01"),
        to: new Date("2020-01-02"),
      });
      result.current.setMunicipalityId("muni-9");
    });

    act(() => {
      result.current.resetRange();
    });

    expect(result.current.municipalityId).toBeNull();
    const spanMs = result.current.to.getTime() - result.current.from.getTime();
    expect(Math.abs(spanMs - SEVEN_DAYS_MS)).toBeLessThan(1000);
  });

  it("defaults province to null", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });
    expect(result.current.province).toBeNull();
  });

  it("setProvince sets and clears the province", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setProvince("Oriental Mindoro");
    });
    expect(result.current.province).toBe("Oriental Mindoro");

    act(() => {
      result.current.setProvince(null);
    });
    expect(result.current.province).toBeNull();
  });

  it("resetRange also clears the province", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setProvince("Palawan");
    });
    expect(result.current.province).toBe("Palawan");

    act(() => {
      result.current.resetRange();
    });
    expect(result.current.province).toBeNull();
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useReportFilter())).toThrow(
      /must be used within a ReportFilterProvider/,
    );
  });
});
