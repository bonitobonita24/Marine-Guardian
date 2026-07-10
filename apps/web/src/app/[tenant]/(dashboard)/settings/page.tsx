import Link from "next/link";
import { FileText, ShieldAlert, KeyRound } from "lucide-react";
import { ErConnectionCard } from "./_components/er-connection-card";
import { ErSyncCard } from "./_components/er-sync-card";
import { tenantHref } from "@/lib/routing/tenant-href";

// Data & Privacy self-service (name/email/DSR rights) moved to /profile
// (2026-07-06) — Settings is now purely tenant/admin configuration
// (super_admin + site_admin only), while every role needs its own
// Profile page for self-service account management.
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ErConnectionCard />
      <ErSyncCard />
      <Link
        href={tenantHref(tenant, "/settings/report-templates")}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        Report Templates
      </Link>
      <Link
        href={tenantHref(tenant, "/settings/breach")}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        Breach Register
      </Link>
      <Link
        href={tenantHref(tenant, "/settings/roles")}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        Custom Roles
      </Link>
    </div>
  );
}
