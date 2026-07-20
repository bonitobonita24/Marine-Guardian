// @vitest-environment jsdom

// RBAC-focused regression test (2026-07-06): the "Generate Printable"
// button used to hide itself for viewer sessions (client-side mirror of the
// server's now-relaxed reportExport.create gate). Viewers are now allowed to
// generate printable reports from the Interactive Report Map, so the button
// must render for a viewer session exactly as it does for coordinator+.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";

type Role =
  | "tenant_manager"
  | "tenant_superadmin"
  | "field_coordinator"
  | "operator"
  | "viewer"
  | "tenant_admin";

// `scope` drives the mocked report-filter-context so the template-default
// tests (2026-07-20) can move the report's scope between renders. `templates`
// is mutable for the same reason.
const { stubs } = vi.hoisted(() => {
  const s: {
    roles: Role[];
    scope: {
      municipalityId: string | null;
      protectedZoneId: string | null;
      province: string | null;
      includeTraversingFull: boolean;
    };
    templates: { id: string; name: string; isDefault: boolean }[];
    /** exportId → polled status, driving the dialog's live region. */
    rowStatuses: Record<string, string>;
  } = {
    rowStatuses: {},
    roles: ["field_coordinator"],
    scope: {
      municipalityId: null,
      protectedZoneId: null,
      province: null,
      includeTraversingFull: false,
    },
    templates: [
      { id: "tpl-1", name: "Calapan Municipal", isDefault: true },
      { id: "tpl-2", name: "Baco Municipal", isDefault: false },
    ],
  };
  return { stubs: s };
});

// Region-mode tests (2026-07-13) need to observe exactly what paramsJson was
// passed to reportExport.create.mutate — captured here so both the mock and
// the assertions can share it without re-wiring vi.mock per test.
// mutateSpy backs create.mutateAsync (the component now uses mutateAsync so the
// split path's two concurrent creates resolve reliably). It returns a resolved
// promise with an {id} so the single-file await path can read data.id.
// Each create must resolve a DISTINCT id — S7 renders one keyed row per
// created export, so a shared id would collapse three rows into one and mask
// a real bug. `failNext` lets a test force a partial-failure path.
const { mutateSpy, purgeSpy, createState } = vi.hoisted(() => {
  const state = { seq: 0, failNext: 0 };
  return {
    createState: state,
    purgeSpy: vi.fn(),
    mutateSpy: vi.fn().mockImplementation(() => {
      state.seq += 1;
      if (state.failNext > 0) {
        state.failNext -= 1;
        return Promise.reject(new Error("queue full"));
      }
      return Promise.resolve({ id: `export-${String(state.seq)}` });
    }),
  };
});

// S7 renders ExportProgressRow per created export. That component is unit
// tested on its own (export-progress-row.test.tsx); stubbing it here keeps
// these tests focused on the DIALOG's own contract — which rows it creates,
// that it stays open, and that it purges on close.
vi.mock("../export-progress-row", () => ({
  ExportProgressRow: ({
    exportId,
    label,
    canGeneratePptx,
  }: {
    exportId: string;
    label: string;
    canGeneratePptx: boolean;
  }) => (
    <div
      data-testid={`stub-row-${exportId}`}
      data-label={label}
      // Surfaced so the dialog's role→PPTX-visibility wiring is assertable
      // here; the rendering of the button itself is covered in
      // export-progress-row.test.tsx.
      data-can-generate-pptx={canGeneratePptx ? "true" : "false"}
    >
      {label}
    </div>
  ),
}));

// Path-based tenancy: the /exports link reads the tenant slug via useParams.
vi.mock("next/navigation", () => ({
  useParams: () => ({ tenant: "demo-site" }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "u1",
        email: "u1@example.com",
        name: "Test",
        tenantId: "t1",
        roles: stubs.roles,
      },
      expires: "9999-01-01",
    },
    status: "authenticated" as const,
  }),
}));

vi.mock("@/components/reporting/report-filter-context", () => ({
  useReportFilter: () => ({
    from: new Date("2026-05-01T00:00:00Z"),
    to: new Date("2026-05-31T00:00:00Z"),
    municipalityId: stubs.scope.municipalityId,
    protectedZoneId: stubs.scope.protectedZoneId,
    province: stubs.scope.province,
    includeChildren: false,
    includeTraversing: false,
    includeTraversingFull: stubs.scope.includeTraversingFull,
  }),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    municipality: {
      list: {
        useQuery: () => ({
          // Deliberately out of canonical order to prove the component
          // derives province order from first-appearance in the query data
          // (which municipality.list already returns canonically), not from
          // re-sorting alphabetically.
          data: [
            { id: "m1", name: "Calapan", province: "Oriental Mindoro" },
            { id: "m2", name: "Baco", province: "Oriental Mindoro" },
            { id: "m3", name: "Mamburao", province: "Occidental Mindoro" },
            { id: "m4", name: "Coron", province: "Palawan" },
          ],
          isLoading: false,
        }),
      },
      // Zones are queried for the scope-aware template default only — they are
      // not rendered as dropdown options.
      protectedZones: {
        useQuery: () => ({
          data: [
            {
              id: "z1",
              name: "Apo Reef Natural Park",
              parentMunicipalityId: "m3",
            },
          ],
          isLoading: false,
        }),
      },
    },
    reportTemplate: {
      list: {
        useQuery: () => ({
          data: { items: stubs.templates },
          isLoading: false,
        }),
      },
    },
    reportExport: {
      create: {
        useMutation: (opts?: {
          onSuccess?: (data: { id: string }) => void;
          onError?: (err: { message: string }) => void;
        }) => ({
          mutate: mutateSpy,
          mutateAsync: mutateSpy,
          isPending: false,
          reset: vi.fn(),
          onSuccessCb: opts?.onSuccess,
        }),
      },
      purge: {
        useMutation: () => ({ mutate: purgeSpy, isPending: false }),
      },
    },
    // The dialog's live region reads the SAME pollStatus query keys the rows
    // poll with, via trpc.useQueries. Mocked as a plain callback over a stub
    // proxy so a test can drive each export's status through
    // `stubs.rowStatuses` and assert what gets announced.
    useQueries: (
      cb: (t: {
        reportExport: {
          pollStatus: (input: { id: string }) => {
            data: { status: string } | undefined;
          };
        };
      }) => unknown[],
    ) =>
      cb({
        reportExport: {
          pollStatus: ({ id }: { id: string }) => ({
            data: { status: stubs.rowStatuses[id] ?? "queued" },
          }),
        },
      }),
  },
}));

import {
  GeneratePrintableButton,
  describeExportProgress,
} from "../generate-printable-button";

// Scope + templates are mutable stubs shared by every describe below; reset
// them globally so a scope-specific test cannot leak into an unrelated one.
beforeEach(() => {
  stubs.rowStatuses = {};
  stubs.scope = {
    municipalityId: null,
    protectedZoneId: null,
    province: null,
    includeTraversingFull: false,
  };
  stubs.templates = [
    { id: "tpl-1", name: "Calapan Municipal", isDefault: true },
    { id: "tpl-2", name: "Baco Municipal", isDefault: false },
  ];
});

describe("GeneratePrintableButton — role visibility (2026-07-06)", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the button for a viewer session (viewer can now generate printable reports)", () => {
    stubs.roles = ["viewer"];
    const { getByTestId } = render(<GeneratePrintableButton />);
    expect(getByTestId("generate-printable-report-button")).toBeTruthy();
  });

  it.each<Role>(["tenant_manager", "tenant_superadmin", "field_coordinator", "operator"])(
    "still renders the button for %s (no regression)",
    (role) => {
      stubs.roles = [role];
      const { getByTestId } = render(<GeneratePrintableButton />);
      expect(getByTestId("generate-printable-report-button")).toBeTruthy();
    },
  );
});

// Region ("whole province") report template options (2026-07-13). Adds
// per-province options above the existing per-template options, so a user
// can generate a province-wide report without selecting a
// municipality/MPA template first.
describe("GeneratePrintableButton — region report options (2026-07-13)", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
    stubs.scope.protectedZoneId = null;
    stubs.scope.includeTraversingFull = false;
    mutateSpy.mockClear();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders a 'Regions' optgroup (canonical province order) above the existing 'Templates' optgroup", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));

    const select = getByTestId("report-template-select") as HTMLSelectElement;
    const groups = select.querySelectorAll("optgroup");
    expect(groups).toHaveLength(2);
    expect(groups[0]?.getAttribute("label")).toBe("Regions");
    expect(groups[1]?.getAttribute("label")).toBe("Templates");

    const regionLabels = Array.from(
      groups[0]?.querySelectorAll("option") ?? [],
    ).map((o) => o.textContent);
    expect(regionLabels).toEqual([
      "Oriental Mindoro",
      "Occidental Mindoro",
      "Palawan",
    ]);

    const templateLabels = Array.from(
      groups[1]?.querySelectorAll("option") ?? [],
    ).map((o) => o.textContent);
    expect(templateLabels).toEqual([
      "Calapan Municipal (default)",
      "Baco Municipal",
    ]);
  });

  it("selecting a region and clicking Generate sends a province-scoped paramsJson with no templateId/municipalityId", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));

    const select = getByTestId("report-template-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "region:Oriental Mindoro" } });

    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const [payload] = mutateSpy.mock.calls[0] as [
      { paramsJson: Record<string, unknown> },
    ];
    expect(payload.paramsJson.province).toBe("Oriental Mindoro");
    expect(payload.paramsJson).not.toHaveProperty("templateId");
    expect(payload.paramsJson).not.toHaveProperty("municipalityId");
  });

  it("selecting a normal template still sends templateId (existing behavior preserved)", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));

    const select = getByTestId("report-template-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "tpl-2" } });

    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const [payload] = mutateSpy.mock.calls[0] as [
      { paramsJson: Record<string, unknown> },
    ];
    expect(payload.paramsJson.templateId).toBe("tpl-2");
  });

  // includeTraversingFull (2026-07-20) — the zone-scoped full-traversing
  // crediting flag must reach the generated PDF's params, and ONLY when it is
  // actually on (guarded spread, same idiom as every other optional scope key).
  it("OMITS includeTraversingFull from paramsJson when the toggle is off", () => {
    stubs.scope.protectedZoneId = "zone-1";
    stubs.scope.includeTraversingFull = false;

    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("generate-printable-confirm"));

    const [payload] = mutateSpy.mock.calls[0] as [
      { paramsJson: Record<string, unknown> },
    ];
    expect(payload.paramsJson.protectedZoneId).toBe("zone-1");
    expect(payload.paramsJson).not.toHaveProperty("includeTraversingFull");
  });

  it("SENDS includeTraversingFull in paramsJson when the toggle is on", () => {
    stubs.scope.protectedZoneId = "zone-1";
    stubs.scope.includeTraversingFull = true;

    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("generate-printable-confirm"));

    const [payload] = mutateSpy.mock.calls[0] as [
      { paramsJson: Record<string, unknown> },
    ];
    expect(payload.paramsJson.includeTraversingFull).toBe(true);
  });

  it("does NOT send includeTraversingFull on a REGION report (no zone scope)", () => {
    // Region reports deliberately ignore the live map filter entirely.
    stubs.scope.protectedZoneId = "zone-1";
    stubs.scope.includeTraversingFull = true;

    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "region:Palawan" },
    });
    fireEvent.click(getByTestId("generate-printable-confirm"));

    const [payload] = mutateSpy.mock.calls[0] as [
      { paramsJson: Record<string, unknown> },
    ];
    expect(payload.paramsJson.province).toBe("Palawan");
    expect(payload.paramsJson).not.toHaveProperty("includeTraversingFull");
  });
});

// Report-type CHECKLIST (2026-07-20) — replaces the "Split into two files"
// toggle and the "Also generate Event Highlights" toggle. One export is queued
// per ticked box; the default is Summary only; Generate is disabled while
// nothing is ticked.
describe("GeneratePrintableButton — report-type checklist (2026-07-20)", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
    mutateSpy.mockClear();
  });
  afterEach(() => {
    cleanup();
  });

  function openWithTemplate() {
    const utils = render(<GeneratePrintableButton />);
    fireEvent.click(utils.getByTestId("generate-printable-report-button"));
    fireEvent.change(utils.getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    return utils;
  }

  it("renders all three report-type checkboxes with the owner's labels", () => {
    const { getByTestId } = openWithTemplate();

    expect(getByTestId("report-type-summary-checkbox")).toBeTruthy();
    expect(getByTestId("report-type-detailed-checkbox")).toBeTruthy();
    expect(getByTestId("report-type-event_highlights-checkbox")).toBeTruthy();

    const labels = Array.from(
      getByTestId("report-type-checklist").querySelectorAll("label"),
    ).map((l) => l.textContent);
    expect(labels).toEqual([
      "Summary of Events/Activities",
      "Detailed Report",
      "Event Highlights",
    ]);
  });

  it("no longer renders the old split / also-generate toggles", () => {
    const { queryByTestId } = openWithTemplate();
    expect(queryByTestId("split-files-checkbox")).toBeNull();
    expect(queryByTestId("event-highlights-checkbox")).toBeNull();
  });

  it("defaults to Summary ONLY — not everything (the fast common case)", () => {
    const { getByTestId } = openWithTemplate();

    expect(
      getByTestId("report-type-summary-checkbox").getAttribute("data-state"),
    ).toBe("checked");
    expect(
      getByTestId("report-type-detailed-checkbox").getAttribute("data-state"),
    ).toBe("unchecked");
    expect(
      getByTestId("report-type-event_highlights-checkbox").getAttribute(
        "data-state",
      ),
    ).toBe("unchecked");
  });

  it("keeps every checkbox keyboard-operable with a bound label and hint", () => {
    const { getByTestId } = openWithTemplate();
    const box = getByTestId("report-type-detailed-checkbox");

    // Radix renders a real checkbox role, focusable and Space-toggleable.
    expect(box.getAttribute("role")).toBe("checkbox");
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(box.getAttribute("aria-describedby")).toBe(
      "report-type-detailed-hint",
    );
    expect(box.id).toBe("report-type-detailed");
    const label = getByTestId("report-type-checklist").querySelector(
      'label[for="report-type-detailed"]',
    );
    expect(label?.textContent).toBe("Detailed Report");
  });

  it("Summary only (default) queues ONE export with exportMode 'charts'", () => {
    const { getByTestId } = openWithTemplate();
    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const [payload] = mutateSpy.mock.calls[0] as [
      { reportType: string; paramsJson: Record<string, unknown> },
    ];
    expect(payload.reportType).toBe("report_map");
    // ALWAYS explicit — never the old "combined" default that rendered the
    // detailed sections too.
    expect(payload.paramsJson.exportMode).toBe("charts");
  });

  it("Detailed only queues ONE export with exportMode 'lists' — no charts render", () => {
    const { getByTestId } = openWithTemplate();
    fireEvent.click(getByTestId("report-type-summary-checkbox"));
    fireEvent.click(getByTestId("report-type-detailed-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const [payload] = mutateSpy.mock.calls[0] as [
      { reportType: string; paramsJson: Record<string, unknown> },
    ];
    expect(payload.reportType).toBe("report_map");
    expect(payload.paramsJson.exportMode).toBe("lists");
  });

  it("Event Highlights only queues ONE event_highlights export and no report_map", () => {
    const { getByTestId } = openWithTemplate();
    fireEvent.click(getByTestId("report-type-summary-checkbox"));
    fireEvent.click(getByTestId("report-type-event_highlights-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const [payload] = mutateSpy.mock.calls[0] as [
      { reportType: string; paramsJson: Record<string, unknown> },
    ];
    expect(payload.reportType).toBe("event_highlights");
    // event_highlights has no section split, so no exportMode is sent.
    expect(payload.paramsJson).not.toHaveProperty("exportMode");
  });

  it("Summary + Detailed queues TWO exports (charts and lists) sharing one scope", () => {
    const { getByTestId } = openWithTemplate();
    fireEvent.click(getByTestId("report-type-detailed-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(2);
    const calls = mutateSpy.mock.calls as [
      { reportType: string; paramsJson: Record<string, unknown> },
    ][];
    expect(calls.map((c) => c[0].paramsJson.exportMode)).toEqual([
      "charts",
      "lists",
    ]);
    expect(calls.every((c) => c[0].paramsJson.templateId === "tpl-2")).toBe(
      true,
    );
  });

  it("all three ticked queues THREE exports in checklist order", () => {
    const { getByTestId } = openWithTemplate();
    fireEvent.click(getByTestId("report-type-detailed-checkbox"));
    fireEvent.click(getByTestId("report-type-event_highlights-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(3);
    const calls = mutateSpy.mock.calls as [
      { reportType: string; paramsJson: Record<string, unknown> },
    ][];
    expect(
      calls.map((c) => [c[0].reportType, c[0].paramsJson.exportMode ?? null]),
    ).toEqual([
      ["report_map", "charts"],
      ["report_map", "lists"],
      ["event_highlights", null],
    ]);
  });

  it("region scope still applies to every ticked report type", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "region:Palawan" },
    });
    fireEvent.click(getByTestId("report-type-detailed-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(2);
    const calls = mutateSpy.mock.calls as [
      { paramsJson: Record<string, unknown> },
    ][];
    for (const [payload] of calls) {
      expect(payload.paramsJson.province).toBe("Palawan");
      expect(payload.paramsJson).not.toHaveProperty("templateId");
    }
  });

  it("disables Generate with an ANNOUNCED reason when nothing is ticked", () => {
    const { getByTestId } = openWithTemplate();
    fireEvent.click(getByTestId("report-type-summary-checkbox")); // now none

    const confirm = getByTestId(
      "generate-printable-confirm",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // The disabled reason is visible AND wired to the button, so it is
    // announced rather than being a silent grey button.
    const hint = getByTestId("report-type-empty-hint");
    expect(hint.textContent).toContain("at least one");
    expect(hint.getAttribute("role")).toBe("status");
    expect(confirm.getAttribute("aria-describedby")).toBe(
      "report-type-empty-hint",
    );

    fireEvent.click(confirm);
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it("re-enables Generate as soon as a box is ticked again", () => {
    const { getByTestId, queryByTestId } = openWithTemplate();
    fireEvent.click(getByTestId("report-type-summary-checkbox"));
    expect(
      (getByTestId("generate-printable-confirm") as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(getByTestId("report-type-event_highlights-checkbox"));
    expect(
      (getByTestId("generate-printable-confirm") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(queryByTestId("report-type-empty-hint")).toBeNull();
  });
});

// Phase 4 S7 (2026-07-20) — in-dialog delivery. Generating no longer links to
// an /exports page (S8 deletes it): the dialog stays open, renders one row per
// created export, and purges those exports when closed.
describe("GeneratePrintableButton — in-dialog progress rows (S7)", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
    mutateSpy.mockClear();
    purgeSpy.mockClear();
    createState.seq = 0;
    createState.failNext = 0;
  });
  afterEach(() => {
    cleanup();
  });

  function openAndGenerate(getByTestId: (id: string) => HTMLElement) {
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("generate-printable-confirm"));
  }

  it("stays OPEN after Generate and renders one row for a single export", async () => {
    const { getByTestId, queryByTestId } = render(<GeneratePrintableButton />);
    openAndGenerate(getByTestId);

    await waitFor(() => {
      expect(getByTestId("export-progress-rows")).toBeTruthy();
    });
    // Dialog content is still mounted — no navigation, no close.
    expect(getByTestId("stub-row-export-1")).toBeTruthy();
    expect(queryByTestId("stub-row-export-2")).toBeNull();
    expect(getByTestId("stub-row-export-1").getAttribute("data-label")).toBe(
      "Summary of Events/Activities",
    );
  });

  it("no longer offers a 'View in Exports' link", async () => {
    const { getByTestId, queryByTestId } = render(<GeneratePrintableButton />);
    openAndGenerate(getByTestId);

    await waitFor(() => {
      expect(getByTestId("export-progress-rows")).toBeTruthy();
    });
    expect(queryByTestId("generate-printable-go-to-exports")).toBeNull();
  });

  it("renders one distinctly-labelled row per created export (all three ticked)", async () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("report-type-detailed-checkbox"));
    fireEvent.click(getByTestId("report-type-event_highlights-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    await waitFor(() => {
      expect(getByTestId("stub-row-export-3")).toBeTruthy();
    });
    const labels = [1, 2, 3].map((n) =>
      getByTestId(`stub-row-export-${String(n)}`).getAttribute("data-label"),
    );
    expect(labels).toEqual([
      "Summary of Events/Activities",
      "Detailed Report",
      "Event Highlights",
    ]);
  });

  it("hides the Generate button and relabels Cancel to Close once rows exist", async () => {
    const { getByTestId, queryByTestId } = render(<GeneratePrintableButton />);
    openAndGenerate(getByTestId);

    await waitFor(() => {
      expect(getByTestId("export-progress-rows")).toBeTruthy();
    });
    expect(queryByTestId("generate-printable-confirm")).toBeNull();
    expect(getByTestId("generate-printable-close").textContent).toBe("Close");
  });

  it("keeps surviving rows AND shows a generic error when one create rejects", async () => {
    createState.failNext = 1; // first of the two split creates fails
    const { getByTestId, queryByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("report-type-detailed-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    await waitFor(() => {
      expect(getByTestId("generate-printable-error")).toBeTruthy();
    });
    // The successful sibling is NOT discarded.
    expect(getByTestId("stub-row-export-2")).toBeTruthy();
    expect(queryByTestId("stub-row-export-1")).toBeNull();
    // Generic text only — the rejection's own message must not be rendered.
    const errorText = getByTestId("generate-printable-error").textContent;
    expect(errorText).not.toContain("queue full");
    expect(errorText).toContain("could not be queued");
  });

  it("closing the dialog purges exactly the created export ids", async () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("report-type-detailed-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    await waitFor(() => {
      expect(getByTestId("stub-row-export-2")).toBeTruthy();
    });

    fireEvent.click(getByTestId("generate-printable-close"));

    expect(purgeSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy).toHaveBeenCalledWith({
      ids: ["export-1", "export-2"],
    });
  });

  it("closing with ZERO rows does not call purge", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.click(getByTestId("generate-printable-close"));

    expect(purgeSpy).not.toHaveBeenCalled();
  });

  it("closes the dialog even though purge is fire-and-forget", async () => {
    purgeSpy.mockImplementationOnce(() => {
      throw new Error("purge exploded");
    });
    const { getByTestId, queryByTestId } = render(<GeneratePrintableButton />);
    openAndGenerate(getByTestId);
    await waitFor(() => {
      expect(getByTestId("export-progress-rows")).toBeTruthy();
    });

    // purge is specified non-throwing server-side, but the call site does not
    // RELY on that: closing must succeed even if cleanup blows up.
    fireEvent.click(getByTestId("generate-printable-close"));

    expect(purgeSpy).toHaveBeenCalledTimes(1);
    expect(queryByTestId("export-progress-rows")).toBeNull();
  });
});

// PPTX visibility (2026-07-20) — reportExport.renderPptx was reverted from
// reportGenerateProcedure back to adminProcedure. Generating the PDF stays
// open to viewer+; the PowerPoint affordance is admin-only, so the dialog must
// pass canGeneratePptx=false for every non-admin role and true for the three
// roles adminProcedure admits. The server procedure is the real boundary —
// these only assert that a non-admin is never shown a button that would 403.
describe("GeneratePrintableButton — PPTX is admin-only (2026-07-20)", () => {
  beforeEach(() => {
    mutateSpy.mockClear();
    purgeSpy.mockClear();
    createState.seq = 0;
    createState.failNext = 0;
  });
  afterEach(() => {
    cleanup();
  });

  async function generateAndReadFlag(): Promise<string | null> {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("generate-printable-confirm"));
    await waitFor(() => {
      expect(getByTestId("stub-row-export-1")).toBeTruthy();
    });
    return getByTestId("stub-row-export-1").getAttribute(
      "data-can-generate-pptx",
    );
  }

  const adminRoles: Role[] = [
    "tenant_manager",
    "tenant_superadmin",
    "tenant_admin",
  ];
  for (const role of adminRoles) {
    it(`passes canGeneratePptx=true for ${role}`, async () => {
      stubs.roles = [role];
      expect(await generateAndReadFlag()).toBe("true");
    });
  }

  const nonAdminRoles: Role[] = ["field_coordinator", "operator", "viewer"];
  for (const role of nonAdminRoles) {
    it(`passes canGeneratePptx=false for ${role}`, async () => {
      stubs.roles = [role];
      expect(await generateAndReadFlag()).toBe("false");
    });
  }

  it("still lets a viewer generate the PDF itself (create is unchanged)", async () => {
    stubs.roles = ["viewer"];
    await generateAndReadFlag();
    expect(mutateSpy).toHaveBeenCalled();
  });
});

// ── Scope-aware template default (2026-07-20) ────────────────────────────────
// Confirmed browser defect: an all-municipalities report rendered as "LGU All
// Municipalities" while carrying the Apo Reef Park logo, because the dropdown
// stayed defaulted to the tenant's isDefault ("Apo Reef Park") template. The
// dropdown is BRANDING ONLY — it never scopes the report — so its default must
// follow the scope the map filters have already set.
describe("GeneratePrintableButton — template default follows the scope (2026-07-20)", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
  });
  afterEach(() => {
    cleanup();
  });

  function openDialog() {
    const utils = render(<GeneratePrintableButton />);
    fireEvent.click(utils.getByTestId("generate-printable-report-button"));
    return utils;
  }

  it("defaults to the matching template when a municipality is scoped", async () => {
    stubs.scope.municipalityId = "m2"; // Baco
    const { getByTestId } = openDialog();
    await waitFor(() => {
      expect(
        (getByTestId("report-template-select") as HTMLSelectElement).value,
      ).toBe("tpl-2");
    });
  });

  it("defaults to the zone's template when a protected zone is scoped", async () => {
    stubs.templates = [
      { id: "tpl-lgu", name: "LGU All Municipalities", isDefault: true },
      { id: "tpl-apo", name: "Apo Reef Park", isDefault: false },
    ];
    stubs.scope.protectedZoneId = "z1"; // Apo Reef Natural Park
    const { getByTestId } = openDialog();
    await waitFor(() => {
      expect(
        (getByTestId("report-template-select") as HTMLSelectElement).value,
      ).toBe("tpl-apo");
    });
  });

  it("does NOT default to a place-specific template for an all-municipalities report", async () => {
    // The exact reported configuration: the tenant default is scope-specific.
    stubs.templates = [
      { id: "tpl-apo", name: "Apo Reef Park", isDefault: true },
      { id: "tpl-lgu", name: "LGU All Municipalities", isDefault: false },
    ];
    const { getByTestId } = openDialog();
    await waitFor(() => {
      expect(
        (getByTestId("report-template-select") as HTMLSelectElement).value,
      ).toBe("tpl-lgu");
    });
  });

  it("keeps a manual override even though a scope default exists", async () => {
    stubs.scope.municipalityId = "m2"; // would default to tpl-2
    const { getByTestId } = openDialog();
    const select = getByTestId("report-template-select") as HTMLSelectElement;
    await waitFor(() => {
      expect(select.value).toBe("tpl-2");
    });

    fireEvent.change(select, { target: { value: "tpl-1" } });
    expect(select.value).toBe("tpl-1");

    // The default-selection effect must not re-fire and clobber the choice.
    await waitFor(() => {
      expect(select.value).toBe("tpl-1");
    });
  });

  it("states that the template is branding only, not a scope control", () => {
    const { getByTestId } = openDialog();
    const hint = getByTestId("report-template-hint");
    expect(hint.textContent).toContain("Branding only");
    expect(hint.textContent).toContain("map filters");
    // Wired to the select for assistive tech (WCAG 3.3.2).
    expect(
      getByTestId("report-template-select").getAttribute("aria-describedby"),
    ).toBe("report-template-hint");
  });
});

// 2026-07-20 browser-QA defect: the dialog's sr-only live region hard-coded
// "N report files are generating." for as long as any row existed, so screen
// readers kept saying "generating" after the Download buttons had appeared.
describe("describeExportProgress (dialog live region wording)", () => {
  it("announces nothing when there are no rows", () => {
    expect(describeExportProgress([])).toBe("");
  });

  it("announces generating while rows are queued/rendering", () => {
    expect(describeExportProgress(["queued"])).toBe(
      "1 report file is generating.",
    );
    expect(describeExportProgress(["queued", "rendering"])).toBe(
      "2 report files are generating.",
    );
  });

  it("announces READY once the renders finish — the reported defect", () => {
    expect(describeExportProgress(["ready"])).toBe(
      "1 report file is ready to download.",
    );
    expect(describeExportProgress(["ready", "ready"])).toBe(
      "2 report files are ready to download.",
    );
  });

  it("announces failures", () => {
    expect(describeExportProgress(["failed"])).toBe("1 report file has failed.");
    expect(describeExportProgress(["failed", "failed"])).toBe(
      "2 report files have failed.",
    );
  });

  it("describes a mixed batch without claiming everything is still generating", () => {
    expect(describeExportProgress(["ready", "rendering", "failed"])).toBe(
      "1 report file is generating. 1 report file is ready to download. 1 report file has failed.",
    );
  });
});

describe("GeneratePrintableButton — live region tracks real row state", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
    mutateSpy.mockClear();
    createState.seq = 0;
    createState.failNext = 0;
  });
  afterEach(() => {
    cleanup();
  });

  it("says 'ready to download' — not 'generating' — once the exports are ready", async () => {
    // Both exports created by the split path report ready.
    stubs.rowStatuses = { "export-1": "ready", "export-2": "ready" };

    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("report-type-detailed-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    await waitFor(() => {
      expect(getByTestId("export-progress-rows")).toBeTruthy();
    });

    const region = getByTestId("export-progress-live-region");
    expect(region.textContent).toBe("2 report files are ready to download.");
    expect(region.textContent).not.toContain("generating");
  });

  it("still says generating while the exports are in flight", async () => {
    stubs.rowStatuses = { "export-1": "rendering" };

    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("generate-printable-confirm"));

    await waitFor(() => {
      expect(getByTestId("export-progress-rows")).toBeTruthy();
    });

    expect(getByTestId("export-progress-live-region").textContent).toBe(
      "1 report file is generating.",
    );
  });
});
