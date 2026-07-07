// @vitest-environment jsdom

// RBAC-focused regression test (2026-07-06): the "Generate Printable"
// button used to hide itself for viewer sessions (client-side mirror of the
// server's now-relaxed reportExport.create gate). Viewers are now allowed to
// generate printable reports from the Interactive Report Map, so the button
// must render for a viewer session exactly as it does for coordinator+.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

type Role =
  | "super_admin"
  | "site_admin"
  | "field_coordinator"
  | "operator"
  | "viewer";

const { stubs } = vi.hoisted(() => {
  const s: { roles: Role[] } = { roles: ["field_coordinator"] };
  return { stubs: s };
});

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
  }),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    reportTemplate: {
      list: {
        useQuery: () => ({
          data: { items: [] },
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
          mutate: vi.fn(),
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

  it.each<Role>(["super_admin", "site_admin", "field_coordinator", "operator"])(
    "still renders the button for %s (no regression)",
    (role) => {
      stubs.roles = [role];
      const { getByTestId } = render(<GeneratePrintableButton />);
      expect(getByTestId("generate-printable-report-button")).toBeTruthy();
    },
  );
});
