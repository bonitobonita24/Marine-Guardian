"use client";

import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AreaBoundaryRow } from "./area-boundary-table";

// Lazy-load the Leaflet island so Leaflet (~50KB) stays out of the dashboard
// initial bundle. SSR is disabled because Leaflet touches `window`.
const AreaBoundaryMap = dynamic(
  () => import("./area-boundary-map").then((m) => m.AreaBoundaryMap),
  { ssr: false },
);

interface Props {
  boundary: AreaBoundaryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreviewAreaBoundaryDialog({
  boundary,
  open,
  onOpenChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>{boundary.name}</span>
            <span className="flex gap-2 text-sm font-normal">
              <Badge variant="secondary">{boundary.region}</Badge>
              <Badge variant="secondary">{boundary.source}</Badge>
              <Badge variant="secondary">{boundary.geometryType}</Badge>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Read-only map preview of {boundary.name}
          </DialogDescription>
        </DialogHeader>
        <AreaBoundaryMap
          geometryGeojson={boundary.geometryGeojson}
          geometryType={boundary.geometryType}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            data-testid="preview-close"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
