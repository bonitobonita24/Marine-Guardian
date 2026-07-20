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
  | "viewer";

const { stubs } = vi.hoisted(() => {
  const s: { roles: Role[] } = { roles: ["field_coordinator"] };
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
  }: {
    exportId: string;
    label: string;
  }) => (
    <div data-testid={`stub-row-${exportId}`} data-label={label}>
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
    municipalityId: null,
    protectedZoneId: null,
    province: null,
    includeChildren: false,
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
    },
    reportTemplate: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              { id: "tpl-1", name: "Calapan Municipal", isDefault: true },
              { id: "tpl-2", name: "Baco Municipal", isDefault: false },
            ],
          },
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
  },
}));

import { GeneratePrintableButton } from "../generate-printable-button";

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
});

// "Split into two files" toggle (2026-07-13). Default OFF preserves the
// existing single-export behavior; ON fires two exports (exportMode:
// "charts" and "lists") sharing the same scope in one Generate click.
describe("GeneratePrintableButton — split into two files (2026-07-13)", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
    mutateSpy.mockClear();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the split checkbox, default unchecked", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));

    const checkbox = getByTestId("split-files-checkbox");
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute("data-state")).toBe("unchecked");
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
  });

  it("split OFF + Generate sends a single export with NO exportMode", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));

    const select = getByTestId("report-template-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "tpl-2" } });

    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const [payload] = mutateSpy.mock.calls[0] as [
      { paramsJson: Record<string, unknown> },
    ];
    expect(payload.paramsJson).not.toHaveProperty("exportMode");
  });

  it("split ON + Generate sends TWO exports: exportMode charts and lists, same scope (template case)", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));

    const select = getByTestId("report-template-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "tpl-2" } });
    fireEvent.click(getByTestId("split-files-checkbox"));

    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(2);
    const [firstPayload] = mutateSpy.mock.calls[0] as [
      { paramsJson: Record<string, unknown> },
    ];
    const [secondPayload] = mutateSpy.mock.calls[1] as [
      { paramsJson: Record<string, unknown> },
    ];
    const exportModes = [
      firstPayload.paramsJson.exportMode,
      secondPayload.paramsJson.exportMode,
    ];
    expect(exportModes.sort()).toEqual(["charts", "lists"]);
    expect(firstPayload.paramsJson.templateId).toBe("tpl-2");
    expect(secondPayload.paramsJson.templateId).toBe("tpl-2");
  });

  it("split ON + Generate sends TWO exports sharing the same scope (region case)", () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));

    const select = getByTestId("report-template-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "region:Palawan" } });
    fireEvent.click(getByTestId("split-files-checkbox"));

    fireEvent.click(getByTestId("generate-printable-confirm"));

    expect(mutateSpy).toHaveBeenCalledTimes(2);
    const [firstPayload] = mutateSpy.mock.calls[0] as [
      { paramsJson: Record<string, unknown> },
    ];
    const [secondPayload] = mutateSpy.mock.calls[1] as [
      { paramsJson: Record<string, unknown> },
    ];
    const exportModes = [
      firstPayload.paramsJson.exportMode,
      secondPayload.paramsJson.exportMode,
    ];
    expect(exportModes.sort()).toEqual(["charts", "lists"]);
    expect(firstPayload.paramsJson.province).toBe("Palawan");
    expect(secondPayload.paramsJson.province).toBe("Palawan");
    expect(firstPayload.paramsJson).not.toHaveProperty("templateId");
    expect(secondPayload.paramsJson).not.toHaveProperty("templateId");
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
      "Report",
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

  it("renders one distinctly-labelled row per created export (split + highlights = 3)", async () => {
    const { getByTestId } = render(<GeneratePrintableButton />);
    fireEvent.click(getByTestId("generate-printable-report-button"));
    fireEvent.change(getByTestId("report-template-select"), {
      target: { value: "tpl-2" },
    });
    fireEvent.click(getByTestId("split-files-checkbox"));
    fireEvent.click(getByTestId("event-highlights-checkbox"));
    fireEvent.click(getByTestId("generate-printable-confirm"));

    await waitFor(() => {
      expect(getByTestId("stub-row-export-3")).toBeTruthy();
    });
    const labels = [1, 2, 3].map((n) =>
      getByTestId(`stub-row-export-${String(n)}`).getAttribute("data-label"),
    );
    expect(labels).toEqual([
      "Report (charts)",
      "Report (detailed lists)",
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
    fireEvent.click(getByTestId("split-files-checkbox"));
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
    fireEvent.click(getByTestId("split-files-checkbox"));
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
