import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type UserRole = "super_admin" | "site_admin" | "field_coordinator" | "operator";

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  site_admin: "Site Admin",
  field_coordinator: "Field Coordinator",
  operator: "Operator",
};

// Color mapping per Sub-batch 3.1 spec:
//   super_admin       = red
//   site_admin        = purple
//   field_coordinator = blue
//   operator          = gray (muted/secondary)
const ROLE_CLASS: Record<UserRole, string> = {
  super_admin:
    "border-transparent bg-red-100 text-red-900 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-200",
  site_admin:
    "border-transparent bg-purple-100 text-purple-900 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-200",
  field_coordinator:
    "border-transparent bg-blue-100 text-blue-900 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200",
  operator: "",
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
