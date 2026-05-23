"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import {
  PLATFORM_ADMIN_EMPTY_TENANT_MESSAGE,
  useIsPlatformAdminWithoutTenant,
} from "@/lib/auth/use-platform-admin-empty-context";

type PatrolSelectorProps = {
  value: string | null;
  onChange: (patrolId: string | null) => void;
  className?: string;
};

const NONE = "__none__";

export function PatrolSelector({
  value,
  onChange,
  className,
}: PatrolSelectorProps) {
  // Query open patrols only (most relevant for live ops); limit 200 covers all reasonable tenants
  const { data, isLoading } = trpc.patrol.list.useQuery({
    limit: 200,
    state: "open",
  });
  const items = data?.items ?? [];
  // Task 4 — surface platform-admin empty-tenant hint when the patrol list
  // is empty for a super_admin without a tenant context (tenant_id NULL).
  const isPlatformAdminWithoutTenant = useIsPlatformAdminWithoutTenant();
  const showPlatformAdminHint =
    !isLoading && items.length === 0 && isPlatformAdminWithoutTenant;

  return (
    <div className="space-y-1">
      <Select
        value={value ?? NONE}
        onValueChange={(v) => { onChange(v === NONE ? null : v); }}
      >
        <SelectTrigger className={className} aria-label="Select patrol">
          <SelectValue
            placeholder={
              isLoading ? "Loading patrols…" : "Show patrol track…"
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No patrol selected</SelectItem>
          {items.map((p) => {
            const label =
              p.title !== null && p.title.trim() !== ""
                ? p.title
                : `Patrol ${p.id.slice(0, 8)}`;
            const dateSuffix = p.startTime
              ? ` · ${new Date(p.startTime).toLocaleDateString()}`
              : "";
            return (
              <SelectItem key={p.id} value={p.id}>
                {label}
                {dateSuffix}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {showPlatformAdminHint && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="patrol-selector-platform-admin-hint"
        >
          {PLATFORM_ADMIN_EMPTY_TENANT_MESSAGE}
        </p>
      )}
    </div>
  );
}
