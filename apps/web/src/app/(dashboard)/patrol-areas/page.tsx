import { RebuildAreaBoundariesButton } from "./rebuild-button";

export default function PatrolAreasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Patrol Areas</h1>
        <RebuildAreaBoundariesButton />
      </div>
      <p className="text-muted-foreground">Area management — map + list pending</p>
    </div>
  );
}
