// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  earthrangerUrl: string | null;
  currency: string;
  timezone: string;
  createdAt: Date;
  userCount: number;
  eventCount30d: number;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    listData: TenantRow[] | undefined;
    listIsLoading: boolean;
  } = {
    listData: undefined,
    listIsLoading: false,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    platform: {
      list: {
        useQuery: () => ({
          data: stubs.listData,
          isLoading: stubs.listIsLoading,
        }),
      },
      metrics: {
        useQuery: () => ({
          data: undefined,
          isLoading: false,
        }),
      },
      create: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deactivate: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    useUtils: () => ({
      platform: {
        list: { invalidate: vi.fn() },
        metrics: { invalidate: vi.fn() },
      },
    }),
  },
}));

vi.mock("../sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

vi.mock("../create-tenant-dialog", () => ({
  CreateTenantDialog: () => (
    <div data-testid="create-tenant-dialog" />
  ),
}));

vi.mock("../edit-tenant-dialog", () => ({
  EditTenantDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-tenant-dialog" /> : null,
}));

vi.mock("../deactivate-tenant-dialog", () => ({
  DeactivateTenantDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="deactivate-tenant-dialog" /> : null,
}));

import { AdminTenantsClient } from "../admin-tenants-client";

const baseTenants: TenantRow[] = [
  {
    id: "t-1",
    name: "Coral Bay Reserve",
    slug: "coral-bay",
    isActive: true,
    earthrangerUrl: null,
    currency: "IDR",
    timezone: "Asia/Jakarta",
    createdAt: new Date("2026-01-15T00:00:00Z"),
    userCount: 8,
    eventCount30d: 42,
  },
  {
    id: "t-2",
    name: "Reef Watch South",
    slug: "reef-watch-south",
    isActive: false,
    earthrangerUrl: null,
    currency: "IDR",
    timezone: "Asia/Makassar",
    createdAt: new Date("2026-02-20T00:00:00Z"),
    userCount: 3,
    eventCount30d: 5,
  },
];

beforeEach(() => {
  stubs.listData = undefined;
  stubs.listIsLoading = false;
  cleanup();
});

describe("AdminTenantsClient", () => {
  it("renders header, email, and role badges", () => {
    stubs.listData = [];
    render(
      <AdminTenantsClient
        email="admin@marine.test"
        roles={["super_admin", "platform_admin"]}
      />
    );
    expect(screen.getByText("Tenant Management")).toBeTruthy();
    expect(screen.getByText("admin@marine.test")).toBeTruthy();
    expect(screen.getByText("super_admin")).toBeTruthy();
    expect(screen.getByText("platform_admin")).toBeTruthy();
  });

  it("shows loading state when list is loading", () => {
    stubs.listData = undefined;
    stubs.listIsLoading = true;
    render(
      <AdminTenantsClient email="admin@marine.test" roles={["super_admin"]} />
    );
    expect(screen.getByText("Loading tenants…")).toBeTruthy();
  });

  it("shows empty state when list is empty", () => {
    stubs.listData = [];
    render(
      <AdminTenantsClient email="admin@marine.test" roles={["super_admin"]} />
    );
    expect(screen.getByText("No tenants yet.")).toBeTruthy();
  });

  it("renders tenant rows with names, status badges, and action buttons", () => {
    stubs.listData = baseTenants;
    render(
      <AdminTenantsClient email="admin@marine.test" roles={["super_admin"]} />
    );

    expect(screen.getByText("Coral Bay Reserve")).toBeTruthy();
    expect(screen.getByText("Reef Watch South")).toBeTruthy();

    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    expect(editButtons).toHaveLength(2);

    const deactivateButtons = screen.getAllByRole("button", {
      name: "Deactivate",
    });
    expect(deactivateButtons).toHaveLength(2);

    // Inactive row's Deactivate button should be disabled
    const inactiveBtn = deactivateButtons[1];
    const activeBtn = deactivateButtons[0];
    expect(inactiveBtn?.hasAttribute("disabled")).toBe(true);
    // Active row's Deactivate button should NOT be disabled
    expect(activeBtn?.hasAttribute("disabled")).toBe(false);
  });

  it("mounts edit dialog when Edit button is clicked", () => {
    stubs.listData = baseTenants;
    render(
      <AdminTenantsClient email="admin@marine.test" roles={["super_admin"]} />
    );

    expect(screen.queryByTestId("edit-tenant-dialog")).toBeNull();

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    const firstEdit = editButtons[0];
    if (firstEdit === undefined) throw new Error("Edit button not found");
    fireEvent.click(firstEdit);

    expect(screen.getByTestId("edit-tenant-dialog")).toBeTruthy();
  });
});
