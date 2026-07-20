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

  it("defaults includeChildren to false", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });
    expect(result.current.includeChildren).toBe(false);
  });

  it("setIncludeChildren toggles the flag", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setIncludeChildren(true);
    });
    expect(result.current.includeChildren).toBe(true);

    act(() => {
      result.current.setIncludeChildren(false);
    });
    expect(result.current.includeChildren).toBe(false);
  });

  it("resetRange also clears includeChildren", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setIncludeChildren(true);
    });
    expect(result.current.includeChildren).toBe(true);

    act(() => {
      result.current.resetRange();
    });
    expect(result.current.includeChildren).toBe(false);
  });

  it("setProvince (to a non-null value) PRESERVES includeChildren", () => {
    // ⚠ INVERTED INVARIANT (owner decision, 2026-07-20). This test previously
    // asserted that selecting a province CLEARED includeChildren. The owner
    // has enabled "Include child boundaries" at province scope, so clearing
    // it here would silently flip an ON toggle back OFF the moment the user
    // picks a province. The flag must now survive a province selection.
    // Broadening back to "all municipalities" (setMunicipalityId(null)) and
    // resetRange() still clear it — see the sibling tests — because those
    // really do leave the toggle without a target.
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setIncludeChildren(true);
    });
    expect(result.current.includeChildren).toBe(true);

    act(() => {
      result.current.setProvince("Palawan");
    });
    expect(result.current.includeChildren).toBe(true);
    expect(result.current.province).toBe("Palawan");
  });

  it("setMunicipalityId(null) clears includeChildren", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setMunicipalityId("muni-1");
      result.current.setIncludeChildren(true);
    });
    expect(result.current.includeChildren).toBe(true);

    act(() => {
      result.current.setMunicipalityId(null);
    });
    expect(result.current.includeChildren).toBe(false);
  });

  // includeTraversingFull — the zone-scoped, default-OFF opt-in exception to
  // the count-at-origin rule (2026-07-20). Its clearing rules are asserted
  // HERE at the context level, not only through the bar: in the bar the
  // zone-reset effect fires on a municipality change and would mask a missing
  // clear in setMunicipalityId, so a bar-only test is not a real signal for it.
  it("defaults includeTraversingFull to false", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });
    expect(result.current.includeTraversingFull).toBe(false);
  });

  it("setIncludeTraversingFull toggles the flag", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setIncludeTraversingFull(true);
    });
    expect(result.current.includeTraversingFull).toBe(true);

    act(() => {
      result.current.setIncludeTraversingFull(false);
    });
    expect(result.current.includeTraversingFull).toBe(false);
  });

  it("setProtectedZoneId(null) clears includeTraversingFull", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setProtectedZoneId("zone-1");
      result.current.setIncludeTraversingFull(true);
    });
    expect(result.current.includeTraversingFull).toBe(true);

    act(() => {
      result.current.setProtectedZoneId(null);
    });
    expect(result.current.includeTraversingFull).toBe(false);
  });

  it("setProtectedZoneId (to another zone) PRESERVES includeTraversingFull", () => {
    // Switching zones keeps a valid target for the toggle, so it must survive
    // — same reasoning as setProvince preserving includeChildren above.
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setProtectedZoneId("zone-1");
      result.current.setIncludeTraversingFull(true);
    });

    act(() => {
      result.current.setProtectedZoneId("zone-2");
    });
    expect(result.current.includeTraversingFull).toBe(true);
    expect(result.current.protectedZoneId).toBe("zone-2");
  });

  it("setMunicipalityId(null) clears includeTraversingFull", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setMunicipalityId("muni-1");
      result.current.setProtectedZoneId("zone-1");
      result.current.setIncludeTraversingFull(true);
    });
    expect(result.current.includeTraversingFull).toBe(true);

    act(() => {
      result.current.setMunicipalityId(null);
    });
    expect(result.current.includeTraversingFull).toBe(false);
  });

  it("resetRange also clears includeTraversingFull", () => {
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setProtectedZoneId("zone-1");
      result.current.setIncludeTraversingFull(true);
    });
    expect(result.current.includeTraversingFull).toBe(true);

    act(() => {
      result.current.resetRange();
    });
    expect(result.current.includeTraversingFull).toBe(false);
  });

  it("does NOT clear includeTraversing / includeChildren when toggled", () => {
    // The two crediting modes are independent controls: the server resolves
    // which one wins. Flipping full mode must never mutate the clipped flag.
    const { result } = renderHook(() => useReportFilter(), { wrapper });

    act(() => {
      result.current.setMunicipalityId("muni-1");
      result.current.setIncludeChildren(true);
      result.current.setIncludeTraversing(true);
      result.current.setIncludeTraversingFull(true);
    });

    expect(result.current.includeChildren).toBe(true);
    expect(result.current.includeTraversing).toBe(true);
    expect(result.current.includeTraversingFull).toBe(true);
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useReportFilter())).toThrow(
      /must be used within a ReportFilterProvider/,
    );
  });
});
