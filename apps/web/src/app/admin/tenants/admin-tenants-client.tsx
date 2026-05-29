"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { CreateTenantDialog } from "./create-tenant-dialog";
import { EditTenantDialog } from "./edit-tenant-dialog";
import { DeactivateTenantDialog } from "./deactivate-tenant-dialog";

type TenantRow = {
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
};

interface Props {
  email: string;
  roles: string[];
}

export function AdminTenantsClient({ email, roles }: Props) {
  const router = useRouter();
  const list = trpc.platform.list.useQuery();

  const [editTenant, setEditTenant] = useState<TenantRow | null>(null);
  const [deactivateTenant, setDeactivateTenant] = useState<TenantRow | null>(null);

  const enter = trpc.platformImpersonation.enter.useMutation({
    onSuccess: () => {
      router.push("/dashboard");
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Tenant Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Marine Guardian — Super Admin
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

      {/* Tenant table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">All Tenants</CardTitle>
          <CreateTenantDialog />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Events (30d)</TableHead>
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
                    Loading tenants…
                  </TableCell>
                </TableRow>
              ) : list.data && list.data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No tenants yet.
                  </TableCell>
                </TableRow>
              ) : (
                list.data?.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {tenant.slug}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={tenant.isActive ? "default" : "secondary"}
                      >
                        {tenant.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{tenant.userCount}</TableCell>
                    <TableCell>{tenant.eventCount30d}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => { enter.mutate({ tenantId: tenant.id }); }}
                          disabled={!tenant.isActive || enter.isPending}
                          data-testid={`manage-tenant-${tenant.slug}`}
                        >
                          Manage
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setEditTenant(tenant); }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => { setDeactivateTenant(tenant); }}
                          disabled={!tenant.isActive}
                        >
                          Deactivate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editTenant !== null && (
        <EditTenantDialog
          tenant={editTenant}
          open
          onClose={() => { setEditTenant(null); }}
        />
      )}
      {deactivateTenant !== null && (
        <DeactivateTenantDialog
          tenant={deactivateTenant}
          open
          onClose={() => { setDeactivateTenant(null); }}
        />
      )}
    </div>
  );
}
