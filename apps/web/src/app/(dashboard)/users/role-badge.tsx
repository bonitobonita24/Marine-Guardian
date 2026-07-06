import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type UserRole =
  | "super_admin"
  | "site_admin"
  | "field_coordinator"
  | "operator"
  | "viewer"
  | "administrator";

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  site_admin: "Site Admin",
  field_coordinator: "Field Coordinator",
  operator: "Operator",
  viewer: "Viewer",
  administrator: "Administrator",
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
  super_admin:
    "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/20",
  site_admin:
    "border-transparent bg-purple-500/15 text-purple-400 hover:bg-purple-500/20",
  field_coordinator:
    "border-transparent bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/20",
  operator: "",
  // viewer — distinct slate/blue-gray tone so it reads visually apart from
  // the other four roles (read-only marker, not a tier of the same ladder).
  viewer:
    "border-transparent bg-slate-500/15 text-slate-400 hover:bg-slate-500/20",
  // administrator (2026-07-06) — full-access role distinct from site_admin's
  // purple tier marker; teal reads as "high access, not a user-management
  // tier" (it is deliberately excluded from user management).
  administrator:
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
