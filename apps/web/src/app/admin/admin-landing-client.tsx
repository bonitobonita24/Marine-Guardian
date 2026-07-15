"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, FileEdit, Users } from "lucide-react";
import { SignOutButton } from "./sign-out-button";

interface Props {
  email: string;
  roles: string[];
}

export function AdminLandingClient({ email, roles }: Props) {
  const metrics = trpc.platform.metrics.useQuery();
  const list = trpc.platform.list.useQuery();

  const totalTenants = metrics.data?.totalTenants ?? "—";
  const totalUsers = metrics.data?.totalUsers ?? "—";
  const totalEvents = metrics.data?.totalEvents ?? "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Platform Admin Console
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

      {/* Section nav */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/tenants" data-testid="admin-nav-tenants">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader className="flex flex-row items-center gap-3">
              <Building2 className="size-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-sm">Tenants</CardTitle>
                <CardDescription>Create, manage, and impersonate tenants</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/admin/users" data-testid="admin-nav-users">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader className="flex flex-row items-center gap-3">
              <Users className="size-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-sm">Users</CardTitle>
                <CardDescription>Platform user accounts</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/admin/content" data-testid="admin-nav-content">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader className="flex flex-row items-center gap-3">
              <FileEdit className="size-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-sm">Content</CardTitle>
                <CardDescription>Edit /docs and /showcase (CMS)</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Tenants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalTenants}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalUsers}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalEvents}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenant Overview</CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Loading tenants…
                  </TableCell>
                </TableRow>
              ) : list.data && list.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
