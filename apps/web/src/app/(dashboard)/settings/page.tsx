import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { ErConnectionCard } from "./_components/er-connection-card";
import { ErSyncCard } from "./_components/er-sync-card";
import { DataPrivacyCard } from "./_components/data-privacy-card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ErConnectionCard />
      <ErSyncCard />
      <DataPrivacyCard />
      <Link
        href="/settings/breach"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        Breach Register (administrators)
      </Link>
    </div>
  );
}
