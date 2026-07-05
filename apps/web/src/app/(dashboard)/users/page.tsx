"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc/client";
import { CreateUserDialog } from "./create-user-dialog";
import { EditRoleDialog } from "./edit-role-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { RoleBadge, type UserRole } from "./role-badge";
import { StatusBadge } from "./status-badge";

type StatusFilter = "all" | "active" | "inactive";
type RoleFilter = "all" | UserRole;

const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All Roles" },
  { value: "super_admin", label: "Super Admin" },
  { value: "site_admin", label: "Site Admin" },
  { value: "field_coordinator", label: "Field Coordinator" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
];

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// Compact relative-time helper. No external dep — repo has no existing util.
function formatRelativeTime(date: Date | null): string {
  if (date === null) return "Never";
  const now = Date.now();
  const ms = now - new Date(date).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${String(min)}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${String(hr)}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${String(day)}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${String(mo)}mo ago`;
  const yr = Math.round(day / 365);
  return `${String(yr)}y ago`;
}

interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

interface EditRoleTarget {
  id: string;
  role: UserRole;
  name: string;
}

interface ResetPasswordTarget {
  id: string;
  name: string;
}

export default function UsersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<UserListItem[]>([]);
  const [editRoleTarget, setEditRoleTarget] = useState<EditRoleTarget | null>(
    null,
  );
  const [resetTarget, setResetTarget] = useState<ResetPasswordTarget | null>(
    null,
  );

  // Debounce search input -> debouncedSearch (300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => { clearTimeout(t); };
  }, [searchInput]);

  // Reset pagination on filter change
  useEffect(() => {
    setCursor(undefined);
    setAccumulated([]);
  }, [debouncedSearch, roleFilter, statusFilter]);

  const queryInput = useMemo(() => {
    const base: {
      limit: number;
      cursor?: string;
      search?: string;
      role?: UserRole;
      isActive?: boolean;
    } = { limit: 50 };
    if (cursor !== undefined) base.cursor = cursor;
    if (debouncedSearch !== "") base.search = debouncedSearch;
    if (roleFilter !== "all") base.role = roleFilter;
    if (statusFilter !== "all") base.isActive = statusFilter === "active";
    return base;
  }, [cursor, debouncedSearch, roleFilter, statusFilter]);

  const listQuery = trpc.user.list.useQuery(queryInput);
  const utils = trpc.useUtils();

  const activate = trpc.user.activate.useMutation({
    onSuccess: () => {
      void utils.user.list.invalidate();
    },
  });

  const deactivate = trpc.user.deactivate.useMutation({
    onSuccess: () => {
      void utils.user.list.invalidate();
    },
  });

  // Merge paginated pages: when cursor is undefined the page is the first page
  // and we replace accumulated; otherwise we append.
  useEffect(() => {
    const data = listQuery.data;
    if (data === undefined) return;
    if (cursor === undefined) {
      setAccumulated(data.items);
    } else {
      setAccumulated((prev) => {
        const existing = new Set(prev.map((u) => u.id));
        const next = data.items.filter((u) => !existing.has(u.id));
        return [...prev, ...next];
      });
    }
  }, [listQuery.data, cursor]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchInput(e.target.value);
  }

  function handleRoleFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setRoleFilter(e.target.value as RoleFilter);
  }

  function handleStatusFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(e.target.value as StatusFilter);
  }

  function handleLoadMore() {
    if (listQuery.data?.nextCursor !== undefined) {
      setCursor(listQuery.data.nextCursor);
    }
  }

  function handleCreateSuccess() {
    void utils.user.list.invalidate();
    setCursor(undefined);
  }

  const rows = accumulated;
  const isInitialLoading = listQuery.isLoading && rows.length === 0;
  const hasNextPage = listQuery.data?.nextCursor !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Users</h1>
        <CreateUserDialog onSuccess={handleCreateSuccess} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name or email"
          value={searchInput}
          onChange={handleSearchChange}
          className="max-w-xs"
          aria-label="Search users"
        />
        <select
          data-testid="role-filter"
          aria-label="Filter by role"
          value={roleFilter}
          onChange={handleRoleFilterChange}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {ROLE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          data-testid="status-filter"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={handleStatusFilterChange}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isInitialLoading ? (
        <div
          data-testid="users-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No users match the current filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.fullName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge isActive={user.isActive} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeTime(user.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          data-testid="row-action-change-role"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditRoleTarget({
                              id: user.id,
                              role: user.role,
                              name: user.fullName,
                            });
                          }}
                        >
                          Change Role
                        </Button>
                        <Button
                          data-testid="row-action-reset-password"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setResetTarget({
                              id: user.id,
                              name: user.fullName,
                            });
                          }}
                        >
                          Reset Password
                        </Button>
                        {user.isActive ? (
                          <Button
                            data-testid="row-action-deactivate"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              deactivate.mutate({ id: user.id });
                            }}
                            disabled={deactivate.isPending}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            data-testid="row-action-activate"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              activate.mutate({ id: user.id });
                            }}
                            disabled={activate.isPending}
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={listQuery.isFetching}
              >
                {listQuery.isFetching ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      {editRoleTarget !== null && (
        <EditRoleDialog
          userId={editRoleTarget.id}
          currentRole={editRoleTarget.role}
          userName={editRoleTarget.name}
          open={true}
          onOpenChange={(v) => {
            if (!v) setEditRoleTarget(null);
          }}
          onSuccess={() => {
            setEditRoleTarget(null);
          }}
        />
      )}

      {resetTarget !== null && (
        <ResetPasswordDialog
          userId={resetTarget.id}
          userName={resetTarget.name}
          open={true}
          onOpenChange={(v) => {
            if (!v) setResetTarget(null);
          }}
          onSuccess={() => {
            setResetTarget(null);
          }}
        />
      )}
    </div>
  );
}
