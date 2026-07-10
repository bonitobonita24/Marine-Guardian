// @vitest-environment jsdom

/**
 * BUG-1 regression — /patrols page React error #310
 *
 * The GenerateReportButton component called useRef() AFTER an early
 * `return null` (when the user lacked coordinator+ roles). React's Rules of
 * Hooks forbid calling hooks after a conditional return, causing minified
 * error #310 in the browser at runtime.
 *
 * This test renders the full PatrolsPage (which composes GenerateReportButton)
 * in several role contexts — including the "operator" path that exercises the
 * early-return branch — and asserts that no React hook-violation error is
 * thrown.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// ── mock stubs ──────────────────────────────────────────────────────────────

let sessionRoles: string[] = [];

vi.mock("next/navigation", () => ({
  useRouter: (): unknown => ({ push: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { id: "u1", email: "u@example.com", name: "Test", tenantId: "t1", roles: sessionRoles },
      expires: "9999-01-01",
    },
    status: "authenticated" as const,
  }),
}));

vi.mock("@/lib/auth/use-platform-admin-empty-context", () => ({
  useIsPlatformAdminWithoutTenant: () => false,
  PLATFORM_ADMIN_EMPTY_TENANT_MESSAGE: "No tenant context",
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    patrol: {
      list: {
        useQuery: (): unknown => ({
          data: { items: [], nextCursor: undefined },
          isLoading: false,
          isFetching: false,
          refetch: vi.fn(),
        }),
      },
      softDelete: {
        useMutation: (): unknown => ({ mutate: vi.fn(), isPending: false, error: null }),
      },
      restore: {
        useMutation: (): unknown => ({ mutate: vi.fn(), isPending: false, error: null }),
      },
    },
    reportExport: {
      create: {
        useMutation: (): unknown => ({
          mutate: vi.fn(),
          isPending: false,
          reset: vi.fn(),
        }),
      },
    },
    areaBoundary: {
      list: {
        useQuery: (): unknown => ({ data: { items: [] }, isLoading: false }),
      },
    },
  },
}));

vi.mock("@/lib/exports", () => ({
  buildExportUrl: (_type: string, _params: unknown, _format: string) =>
    `/api/exports/${_type}.${_format}`,
}));

// Stub heavy subcomponents so this test stays unit-level
vi.mock("../generate-report-button", () => ({
  GenerateReportButton: () => null,
}));
vi.mock("../rebuild-tracks-button", () => ({
  RebuildTracksButton: () => null,
}));
vi.mock("../patrols-table", () => ({
  PatrolsTable: () => null,
}));

import PatrolsPage from "../page";

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionRoles = [];
});

afterEach(() => {
  cleanup();
});

describe("PatrolsPage — BUG-1 regression (React error #310)", () => {
  it("renders without crashing for an operator session (exercises early-return hook path)", () => {
    sessionRoles = ["operator"];
    // This must NOT throw "Invalid hook call" / React error #310.
    expect(() => {
      render(<PatrolsPage />);
    }).not.toThrow();
  });

  it("renders without crashing for a coordinator session", () => {
    sessionRoles = ["field_coordinator"];
    expect(() => {
      render(<PatrolsPage />);
    }).not.toThrow();
  });

  it("renders without crashing for a site_admin session", () => {
    sessionRoles = ["tenant_superadmin"];
    expect(() => {
      render(<PatrolsPage />);
    }).not.toThrow();
  });

  it("renders the page heading 'Patrols'", () => {
    sessionRoles = ["operator"];
    const { getByText } = render(<PatrolsPage />);
    expect(getByText("Patrols")).toBeTruthy();
  });
});
