import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type UserRole =
  | "tenant_manager"
  | "tenant_superadmin"
  | "field_coordinator"
  | "operator"
  | "viewer"
  | "tenant_admin";

const ROLE_LABELS: Record<UserRole, string> = {
  tenant_manager: "Tenant Manager",
  tenant_superadmin: "Tenant Superadmin",
  field_coordinator: "Field Coordinator",
  operator: "Operator",
  viewer: "Viewer",
  tenant_admin: "Tenant Admin",
};

// Color mapping — reconciled against mockup (mpa-command-center-v4.jsx UserMgmt)
// and docs/DESIGN.md semantic color tokens (2026-06-15 reskin baseline):
//   super_admin       = danger/red  (mockup: red)
//   site_admin        = purple      (mockup: red for "Site Admin"; purple kept as
//                                    a distinct tier marker — OWNER DECISION NEEDED
//                                    if strict mockup parity is required)
//   field_coordinator = warning/orange (mockup: orange for "Coordinator")
//   operator          = muted/secondary (mockup: blue pre-reskin → neutral post-reskin)
const ROLE_CLASS: Record<UserRole, string> = {
  tenant_manager:
    "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/20",
  tenant_superadmin:
    "border-transparent bg-purple-500/15 text-purple-400 hover:bg-purple-500/20",
  field_coordinator:
    "border-transparent bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/20",
  operator: "",
  // viewer — distinct slate/blue-gray tone so it reads visually apart from
  // the other four roles (read-only marker, not a tier of the same ladder).
  viewer:
    "border-transparent bg-slate-500/15 text-slate-400 hover:bg-slate-500/20",
  // tenant_admin (2026-07-06) — full-access role distinct from
  // tenant_superadmin's purple tier marker; teal reads as "high access, not a
  // user-management tier" (it is deliberately excluded from user management).
  tenant_admin:
    "border-transparent bg-teal-500/15 text-teal-400 hover:bg-teal-500/20",
};

interface RoleBadgeProps {
  role: UserRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const className = ROLE_CLASS[role];
  if (role === "operator") {
    return <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>;
  }
  return <Badge className={cn(className)}>{ROLE_LABELS[role]}</Badge>;
}

export { ROLE_LABELS };
export type { UserRole };
