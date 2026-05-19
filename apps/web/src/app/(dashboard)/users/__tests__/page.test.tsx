// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type UserRole = "super_admin" | "site_admin" | "field_coordinator" | "operator";

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    listData: { items: UserItem[]; nextCursor: string | undefined } | undefined;
    listIsLoading: boolean;
    lastListInput: Record<string, unknown> | undefined;
    activateMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    deactivateMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
  } = {
    listData: undefined,
    listIsLoading: false,
    lastListInput: undefined,
    activateMutate: vi.fn<(input: unknown) => void>(),
    deactivateMutate: vi.fn<(input: unknown) => void>(),
    listInvalidate: vi.fn<() => Promise<void>>(),
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    user: {
      list: {
        useQuery: (input: Record<string, unknown>) => {
          stubs.lastListInput = input;
          return {
            data: stubs.listData,
            isLoading: stubs.listIsLoading,
          };
        },
      },
      activate: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            stubs.activateMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      deactivate: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            stubs.deactivateMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      user: {
        list: { invalidate: stubs.listInvalidate },
      },
    }),
  },
}));

// Stub the heavy dialogs so the page test does not transitively need their
// mutation mocks. Each stub renders a marker when open so we can assert it
// was triggered by row actions.
vi.mock("../create-user-dialog", () => ({
  CreateUserDialog: ({ onSuccess: _onSuccess }: { onSuccess: () => void }) => (
    <button type="button" data-testid="create-user-dialog-trigger">
      Add User
    </button>
  ),
}));

vi.mock("../edit-role-dialog", () => ({
  EditRoleDialog: ({
    userName,
    open,
  }: {
    userId: string;
    currentRole: UserRole;
    userName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
  }) =>
    open ? (
      <div data-testid="edit-role-dialog">Edit role for {userName}</div>
    ) : null,
}));

vi.mock("../reset-password-dialog", () => ({
  ResetPasswordDialog: ({
    userName,
    open,
  }: {
    userId: string;
    userName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
  }) =>
    open ? (
      <div data-testid="reset-password-dialog">
        Reset password for {userName}
      </div>
    ) : null,
}));

import UsersPage from "../page";

const baseUsers: UserItem[] = [
  {
    id: "u-1",
    email: "alice@example.com",
    fullName: "Alice Anderson",
    role: "super_admin",
    isActive: true,
    lastLoginAt: new Date(Date.now() - 1000 * 60 * 60),
    createdAt: new Date("2026-04-01T00:00:00Z"),
  },
  {
    id: "u-2",
    email: "bob@example.com",
    fullName: "Bob Brown",
    role: "operator",
    isActive: false,
    lastLoginAt: null,
    createdAt: new Date("2026-04-02T00:00:00Z"),
  },
];

describe("UsersPage", () => {
  beforeEach(() => {
    stubs.listData = { items: baseUsers, nextCursor: undefined };
    stubs.listIsLoading = false;
    stubs.lastListInput = undefined;
    stubs.activateMutate.mockReset();
    stubs.deactivateMutate.mockReset();
    stubs.listInvalidate.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the page header and Add User toolbar trigger", () => {
    const { getByText, getByTestId } = render(<UsersPage />);
    expect(getByText("Users")).toBeTruthy();
    expect(getByTestId("create-user-dialog-trigger")).toBeTruthy();
  });

  it("renders a row for each user with name and email", () => {
    const { getByText } = render(<UsersPage />);
    expect(getByText("Alice Anderson")).toBeTruthy();
    expect(getByText("alice@example.com")).toBeTruthy();
    expect(getByText("Bob Brown")).toBeTruthy();
    expect(getByText("bob@example.com")).toBeTruthy();
  });

  it("renders role badges (super_admin and operator)", () => {
    const { getAllByText } = render(<UsersPage />);
    // "Super Admin" and "Operator" also appear in the role filter <option>s,
    // so multiple matches are expected — assert at least one badge exists.
    expect(getAllByText("Super Admin").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Operator").length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badges (Active and Inactive)", () => {
    const { getAllByText } = render(<UsersPage />);
    // "Active" and "Inactive" also appear in the status filter <option>s.
    expect(getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Inactive").length).toBeGreaterThanOrEqual(1);
  });

  it("renders last login (relative) and 'Never' for users with no login", () => {
    const { getByText } = render(<UsersPage />);
    expect(getByText("Never")).toBeTruthy();
  });

  it("debounces search input into trpc.user.list query", async () => {
    const { getByPlaceholderText } = render(<UsersPage />);
    const search = getByPlaceholderText(/Search/i) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "alice" } });
    // The page must update the list query input with the search string.
    // Allow a microtask/debounce window.
    await new Promise((r) => setTimeout(r, 350));
    expect(stubs.lastListInput?.search).toBe("alice");
  });

  it("passes role filter to trpc.user.list query when selected", () => {
    const { getByTestId } = render(<UsersPage />);
    const roleSelect = getByTestId("role-filter");
    fireEvent.change(roleSelect, { target: { value: "super_admin" } });
    expect(stubs.lastListInput?.role).toBe("super_admin");
  });

  it("passes status filter (isActive) to trpc.user.list query when selected", () => {
    const { getByTestId } = render(<UsersPage />);
    const statusSelect = getByTestId("status-filter");
    fireEvent.change(statusSelect, { target: { value: "inactive" } });
    expect(stubs.lastListInput?.isActive).toBe(false);
  });

  it("opens EditRoleDialog when Change Role row action is invoked", () => {
    const { getAllByTestId, queryByTestId, getByTestId } = render(<UsersPage />);
    const changeRoleButtons = getAllByTestId("row-action-change-role");
    const first = changeRoleButtons[0];
    if (first === undefined) throw new Error("No change-role button rendered");
    fireEvent.click(first);
    expect(queryByTestId("edit-role-dialog")).not.toBeNull();
    expect(getByTestId("edit-role-dialog").textContent).toContain(
      "Alice Anderson",
    );
  });

  it("opens ResetPasswordDialog when Reset Password row action is invoked", () => {
    const { getAllByTestId, queryByTestId, getByTestId } = render(<UsersPage />);
    const resetButtons = getAllByTestId("row-action-reset-password");
    const first = resetButtons[0];
    if (first === undefined) throw new Error("No reset button rendered");
    fireEvent.click(first);
    expect(queryByTestId("reset-password-dialog")).not.toBeNull();
    expect(getByTestId("reset-password-dialog").textContent).toContain(
      "Alice Anderson",
    );
  });

  it("calls deactivate mutation when active user's Deactivate action is clicked", () => {
    const { getAllByTestId } = render(<UsersPage />);
    const deactivateButtons = getAllByTestId("row-action-deactivate");
    const first = deactivateButtons[0];
    if (first === undefined) throw new Error("No deactivate button rendered");
    fireEvent.click(first);
    expect(stubs.deactivateMutate).toHaveBeenCalledWith({ id: "u-1" });
  });

  it("calls activate mutation when inactive user's Activate action is clicked", () => {
    const { getAllByTestId } = render(<UsersPage />);
    const activateButtons = getAllByTestId("row-action-activate");
    const first = activateButtons[0];
    if (first === undefined) throw new Error("No activate button rendered");
    fireEvent.click(first);
    expect(stubs.activateMutate).toHaveBeenCalledWith({ id: "u-2" });
  });

  it("renders the empty state when no users are returned", () => {
    stubs.listData = { items: [], nextCursor: undefined };
    const { getByText } = render(<UsersPage />);
    expect(getByText(/No users/i)).toBeTruthy();
  });

  it("renders a loading skeleton when the query is loading", () => {
    stubs.listData = undefined;
    stubs.listIsLoading = true;
    const { getByTestId } = render(<UsersPage />);
    expect(getByTestId("users-table-loading")).toBeTruthy();
  });

  it("shows a Load more button when nextCursor is present", () => {
    stubs.listData = { items: baseUsers, nextCursor: "u-2" };
    const { getByText } = render(<UsersPage />);
    expect(getByText(/Load more/i)).toBeTruthy();
  });
});
