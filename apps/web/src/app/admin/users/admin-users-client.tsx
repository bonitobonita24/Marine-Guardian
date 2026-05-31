"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SignOutButton } from "../sign-out-button";
import { CreateUserDialog } from "./create-user-dialog";
import { EditUserRoleDialog } from "./edit-user-role-dialog";
import { DeactivateUserDialog } from "./deactivate-user-dialog";

type UserRow = {
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
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function roleBadgeVariant(role: UserRow["role"]): BadgeVariant {
  switch (role) {
    case "super_admin":
      return "destructive";
    case "site_admin":
      return "default";
    case "field_coordinator":
      return "secondary";
    case "operator":
      return "outline";
  }
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface Props {
  email: string;
  roles: string[];
}

export function AdminUsersClient({ email, roles }: Props) {
  const list = trpc.platformUser.list.useQuery({});

  const [editRoleUser, setEditRoleUser] = useState<UserRow | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<UserRow | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage users across all tenants
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{email}</span>
          {roles.map((r) => (
            <Badge key={r} variant="secondary">
              {r}
            </Badge>
          ))}
          <SignOutButton />
        </div>
      </div>

      {/* Users table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">All Users</CardTitle>
          <CreateUserDialog />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Loading users…
                  </TableCell>
                </TableRow>
              ) : list.data && list.data.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No users yet.
                  </TableCell>
                </TableRow>
              ) : (
                list.data?.items.map((user) => {
                  const tenantDisplay =
                    user.role === "super_admin"
                      ? "Platform"
                      : (user.tenant?.name ?? "—");

                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.fullName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(user.role)}>
                          {formatRole(user.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tenantDisplay}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "default" : "secondary"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setEditRoleUser(user); }}
                          >
                            Edit Role
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!user.isActive}
                            onClick={() => { setDeactivateUser(user); }}
                          >
                            Deactivate
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editRoleUser !== null && (
        <EditUserRoleDialog
          user={editRoleUser}
          open={true}
          onOpenChange={(v) => {
            if (!v) setEditRoleUser(null);
          }}
        />
      )}
      {deactivateUser !== null && (
        <DeactivateUserDialog
          user={deactivateUser}
          open={true}
          onOpenChange={(v) => {
            if (!v) setDeactivateUser(null);
          }}
        />
      )}
    </div>
  );
}
