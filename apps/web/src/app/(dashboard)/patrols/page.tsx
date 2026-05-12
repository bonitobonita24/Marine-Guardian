import { Button } from "@/components/ui/button";
import { buildExportUrl } from "@/lib/exports";

export default function PatrolsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Patrols</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={buildExportUrl("patrols", {}, "csv")} download>
              Export CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={buildExportUrl("patrols", {}, "pdf")} download>
              Export PDF
            </a>
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground">Patrol management — data table pending</p>
    </div>
  );
}
