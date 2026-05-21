import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// 5.3d — colored status chip per ReportExport.status.
// queued = grey | rendering = blue + animated dot | ready = green | failed = red.

export type ExportStatus = "queued" | "rendering" | "ready" | "failed";

interface StatusBadgeProps {
  status: ExportStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === "queued") {
    return (
      <Badge
        className={cn(
          "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200",
        )}
        data-testid="export-status-queued"
      >
        Queued
      </Badge>
    );
  }
  if (status === "rendering") {
    return (
      <Badge
        className={cn(
          "border-transparent bg-blue-100 text-blue-900 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200",
        )}
        data-testid="export-status-rendering"
      >
        <span
          aria-hidden="true"
          className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-300"
        />
        Rendering
      </Badge>
    );
  }
  if (status === "ready") {
    return (
      <Badge
        className={cn(
          "border-transparent bg-green-100 text-green-900 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-200",
        )}
        data-testid="export-status-ready"
      >
        Ready
      </Badge>
    );
  }
  return (
    <Badge
      className={cn(
        "border-transparent bg-red-100 text-red-900 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-200",
      )}
      data-testid="export-status-failed"
    >
      Failed
    </Badge>
  );
}
