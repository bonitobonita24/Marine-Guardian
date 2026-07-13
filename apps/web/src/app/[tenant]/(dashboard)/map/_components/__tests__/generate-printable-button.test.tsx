// @vitest-environment jsdom

// RBAC-focused regression test (2026-07-06): the "Generate Printable"
// button used to hide itself for viewer sessions (client-side mirror of the
// server's now-relaxed reportExport.create gate). Viewers are now allowed to
// generate printable reports from the Interactive Report Map, so the button
// must render for a viewer session exactly as it does for coordinator+.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

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
const { mutateSpy } = vi.hoisted(() => ({ mutateSpy: vi.fn() }));

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
          isPending: false,
          reset: vi.fn(),
          onSuccessCb: opts?.onSuccess,
        }),
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
