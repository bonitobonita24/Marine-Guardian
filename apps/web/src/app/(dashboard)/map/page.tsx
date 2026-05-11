import { InteractiveMap } from "@/components/map/InteractiveMap";

export default function MapPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Live Map</h1>
      <div className="h-[calc(100vh-12rem)] overflow-hidden rounded-lg border">
        <InteractiveMap />
      </div>
    </div>
  );
}
