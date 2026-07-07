import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  isActive: boolean;
}

export function StatusBadge({ isActive }: StatusBadgeProps) {
  if (isActive) {
    return (
      <Badge
        className={cn(
          "border-transparent bg-green-100 text-green-900 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-200",
        )}
      >
        Active
      </Badge>
    );
  }
  return <Badge variant="secondary">Inactive</Badge>;
}
