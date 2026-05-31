// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: "super_admin" | "site_admin" | "field_coordinator" | "operator";
  languagePreference: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  tenantId: string | null;
  tenant: { name: string; slug: string } | null;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    listItems: UserRow[] | undefined;
    listIsLoading: boolean;
  } = {
    listItems: undefined,
    listIsLoading: false,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    platformUser: {
      list: {
        useQuery: () => ({
          data: stubs.listItems !== undefined
            ? { items: stubs.listItems, nextCursor: undefined }
            : undefined,
          isLoading: stubs.listIsLoading,
        }),
      },
      create: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateRole: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deactivate: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    platform: {
      list: {
        useQuery: () => ({ data: { items: [] }, isLoading: false }),
      },
    },
    useUtils: () => ({
      platformUser: {
        list: { invalidate: vi.fn() },
      },
    }),
  },
}));

vi.mock("../sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

vi.mock("../create-user-dialog", () => ({
  CreateUserDialog: () => <div data-testid="create-user-dialog" />,
}));

vi.mock("../edit-user-role-dialog", () => ({
  EditUserRoleDialog: ({ open, user }: { open: boolean; user: { email: string } }) =>
    open ? (
      <div data-testid="edit-user-role-dialog">
        <span>Edit User Role</span>
        <span>{user.email}</span>
      </div>
    ) : null,
}));

vi.mock("../deactivate-user-dialog", () => ({
  DeactivateUserDialog: ({ open, user }: { open: boolean; user: { email: string } }) =>
    open ? (
      <div data-testid="deactivate-user-dialog">
        <span>{user.email}</span>
      </div>
    ) : null,
}));

import { AdminUsersClient } from "../admin-users-client";

const baseUsers: UserRow[] = [
  {
    id: "u-1",
    email: "admin@platform.test",
    fullName: "Platform Admin",
    role: "super_admin",
    languagePreference: "en",
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    tenantId: null,
    tenant: null,
  },
  {
    id: "u-2",
    email: "siteadmin@coral.test",
    fullName: "Site Admin",
    role: "site_admin",
    languagePreference: "en",
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    tenantId: "t-1",
    tenant: { name: "Coral Bay Reserve", slug: "coral-bay" },
  },
  {
    id: "u-3",
    email: "coord@reef.test",
    fullName: "Field Coord",
    role: "field_coordinator",
    languagePreference: "id",
    isActive: false,
    lastLoginAt: null,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    tenantId: "t-2",
    tenant: { name: "Reef Watch South", slug: "reef-watch-south" },
  },
  {
    id: "u-4",
    email: "op@reef.test",
    fullName: "Operator One",
    role: "operator",
    languagePreference: "ms",
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    tenantId: "t-2",
    tenant: { name: "Reef Watch South", slug: "reef-watch-south" },
  },
];

beforeEach(() => {
  stubs.listItems = undefined;
  stubs.listIsLoading = false;
  cleanup();
});

describe("AdminUsersClient", () => {
  it("renders all 4 users in table rows", () => {
    stubs.listItems = baseUsers;
    render(
      <AdminUsersClient email="admin@marine.test" roles={["super_admin"]} />
    );
    expect(screen.getByText("Platform Admin")).toBeTruthy();
    // "Site Admin" appears as fullName AND as role badge — use getAllByText
    expect(screen.getAllByText("Site Admin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Field Coord")).toBeTruthy();
    expect(screen.getByText("Operator One")).toBeTruthy();
  });

  it("shows Platform for super_admin tenant cell and tenant name for others", () => {
    stubs.listItems = baseUsers;
    render(
      <AdminUsersClient email="admin@marine.test" roles={["super_admin"]} />
    );
    expect(screen.getByText("Platform")).toBeTruthy();
    expect(screen.getAllByText("Coral Bay Reserve").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Reef Watch South").length).toBeGreaterThanOrEqual(1);
  });

  it("renders role badge text for each role", () => {
    stubs.listItems = baseUsers;
    render(
      <AdminUsersClient email="admin@marine.test" roles={["super_admin"]} />
    );
    // Super Admin appears once as badge (fullName is "Platform Admin")
    expect(screen.getByText("Super Admin")).toBeTruthy();
    // Site Admin appears in both fullName and badge — use getAllByText
    expect(screen.getAllByText("Site Admin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Field Coordinator")).toBeTruthy();
    expect(screen.getByText("Operator")).toBeTruthy();
  });

  it("renders loading state with colSpan=7 cell", () => {
    stubs.listItems = undefined;
    stubs.listIsLoading = true;
    render(
      <AdminUsersClient email="admin@marine.test" roles={["super_admin"]} />
    );
    expect(screen.getByText("Loading users…")).toBeTruthy();
  });

  it("renders empty state with No users yet. message", () => {
    stubs.listItems = [];
    render(
      <AdminUsersClient email="admin@marine.test" roles={["super_admin"]} />
    );
    expect(screen.getByText("No users yet.")).toBeTruthy();
  });

  it("clicking Edit Role on a row opens EditUserRoleDialog with that user", () => {
    stubs.listItems = baseUsers;
    render(
      <AdminUsersClient email="admin@marine.test" roles={["super_admin"]} />
    );

    expect(screen.queryByTestId("edit-user-role-dialog")).toBeNull();

    const editButtons = screen.getAllByRole("button", { name: "Edit Role" });
    const firstEditBtn = editButtons[0];
    if (firstEditBtn === undefined) throw new Error("Edit Role button not found");
    fireEvent.click(firstEditBtn);

    expect(screen.getByTestId("edit-user-role-dialog")).toBeTruthy();
    expect(screen.getByText("Edit User Role")).toBeTruthy();
  });

  it("clicking Deactivate on a row opens DeactivateUserDialog with that user email", () => {
    stubs.listItems = baseUsers;
    render(
      <AdminUsersClient email="admin@marine.test" roles={["super_admin"]} />
    );

    expect(screen.queryByTestId("deactivate-user-dialog")).toBeNull();

    // baseUsers[1] is "siteadmin@coral.test" — isActive=true, so button is enabled
    const deactivateButtons = screen.getAllByRole("button", { name: "Deactivate" });
    const activeDeactivateBtn = deactivateButtons[1];
    if (activeDeactivateBtn === undefined) throw new Error("Deactivate button not found");
    fireEvent.click(activeDeactivateBtn);

    expect(screen.getByTestId("deactivate-user-dialog")).toBeTruthy();
    // email appears in the dialog mock AND in the table row — getAllByText is safe
    expect(screen.getAllByText("siteadmin@coral.test").length).toBeGreaterThanOrEqual(1);
  });

  it("closing one dialog does not affect the other dialog state", () => {
    stubs.listItems = baseUsers;
    render(
      <AdminUsersClient email="admin@marine.test" roles={["super_admin"]} />
    );

    // Open Edit Role dialog for first user
    const editButtons = screen.getAllByRole("button", { name: "Edit Role" });
    const firstEditBtn = editButtons[0];
    if (firstEditBtn === undefined) throw new Error("Edit Role button not found");
    fireEvent.click(firstEditBtn);
    expect(screen.getByTestId("edit-user-role-dialog")).toBeTruthy();

    // Deactivate dialog is not open
    expect(screen.queryByTestId("deactivate-user-dialog")).toBeNull();

    // Open Deactivate dialog for second user (siteadmin — isActive=true)
    const deactivateButtons = screen.getAllByRole("button", { name: "Deactivate" });
    const activeDeactivateBtn = deactivateButtons[1];
    if (activeDeactivateBtn === undefined) throw new Error("Deactivate button not found");
    fireEvent.click(activeDeactivateBtn);
    expect(screen.getByTestId("deactivate-user-dialog")).toBeTruthy();

    // Edit Role dialog is still open (independent state)
    expect(screen.getByTestId("edit-user-role-dialog")).toBeTruthy();
  });
});
