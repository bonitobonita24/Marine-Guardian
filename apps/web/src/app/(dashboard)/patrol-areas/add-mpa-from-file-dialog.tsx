"use client";

// Owner-facing "Import Boundary from KML/KMZ" upload. The admin picks a .kml/.kmz
// file, a boundary category (Marine Protected Area or Special area), a parent
// municipality, and a name. The file is parsed to GeoJSON in the browser and
// sent to municipality.createBoundaryFromUpload, which creates a ProtectedZone
// (a filterable coverage sub-area under that municipality), regenerates the
// official overlay so it draws on both maps + joins the zone filter, and
// backfills historical event/patrol coverage. On success it invalidates the
// boundary list, the map overlay, and the zone (MPA filter) list.

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import {
  parseKmlFile,
  countPolygonFeatures,
  KmlParseError,
} from "./lib/parse-kml-file";

type Category = "mpa" | "special_area";

const CATEGORY_LABELS: Record<Category, string> = {
  mpa: "Marine Protected Area (MPA)",
  special_area: "Special area",
};

type Feedback =
  | { kind: "success"; name: string; category: Category; eventCount: number; patrolCount: number }
  | { kind: "error"; message: string }
  | null;

export function AddMpaFromFileDialog() {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("mpa");
  const [parentMunicipalityId, setParentMunicipalityId] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<unknown>(null);
  const [polygonCount, setPolygonCount] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const roles = session?.user.roles ?? [];
  const canCreate = roles.includes("super_admin") || roles.includes("site_admin");

  const municipalitiesQuery = trpc.municipality.list.useQuery(undefined, {
    enabled: open && canCreate,
  });

  const createBoundary = trpc.municipality.createBoundaryFromUpload.useMutation({
    onSuccess: (data) => {
      setFeedback({
        kind: "success",
        name: data.name,
        category: data.category,
        eventCount: data.eventCount,
        patrolCount: data.patrolCount,
      });
      void utils.areaBoundary.list.invalidate();
      void utils.map.officialBoundaries.list.invalidate();
      void utils.municipality.protectedZones.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  function resetState() {
    setName("");
    setCategory("mpa");
    setParentMunicipalityId("");
    setFileName(null);
    setGeojson(null);
    setPolygonCount(0);
    setParsing(false);
    setFeedback(null);
    createBoundary.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    setOpen(false);
    resetState();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFeedback(null);
    setGeojson(null);
    setPolygonCount(0);
    if (!file) {
      setFileName(null);
      return;
    }
    setFileName(file.name);
    setParsing(true);
    try {
      const parsed = await parseKmlFile(file);
      const count = countPolygonFeatures(parsed);
      if (count === 0) {
        setFeedback({
          kind: "error",
          message:
            "No area (polygon) found in that file. A boundary must contain at least one polygon.",
        });
        setGeojson(null);
      } else {
        setGeojson(parsed);
        setPolygonCount(count);
        if (name.trim().length === 0) {
          setName(file.name.replace(/\.(kml|kmz)$/i, "").replace(/[_-]+/g, " ").trim());
        }
      }
    } catch (err) {
      setFeedback({
        kind: "error",
        message: err instanceof KmlParseError ? err.message : "The file could not be read.",
      });
    } finally {
      setParsing(false);
    }
  }

  function handleSubmit() {
    if (geojson == null || name.trim().length < 2 || parentMunicipalityId === "") return;
    setFeedback(null);
    createBoundary.mutate({ name: name.trim(), geojson, category, parentMunicipalityId });
  }

  if (!canCreate) return null;

  const canSubmit =
    geojson != null &&
    name.trim().length >= 2 &&
    parentMunicipalityId !== "" &&
    !parsing &&
    !createBoundary.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setOpen(true);
        else handleClose();
      }}
    >
      <Button
        variant="outline"
        data-testid="add-mpa-from-file-button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Import Boundary from KML/KMZ
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Boundary from KML/KMZ</DialogTitle>
          <DialogDescription>
            Upload a KML or KMZ file to create a named sub-area under a municipality.
            It is drawn on both maps and added to the zone filter, so you can see only
            the events/patrols inside it — separate from the whole municipality.
            Existing events/patrols inside it are counted automatically.
          </DialogDescription>
        </DialogHeader>

        {feedback?.kind === "success" ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Created “{feedback.name}” ({CATEGORY_LABELS[feedback.category]}). {feedback.eventCount}{" "}
            event{feedback.eventCount === 1 ? "" : "s"} and {feedback.patrolCount} patrol
            {feedback.patrolCount === 1 ? "" : "s"} fall inside it.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mpa-name">Name</Label>
              <Input
                id="mpa-name"
                data-testid="mpa-name-input"
                value={name}
                maxLength={120}
                placeholder="e.g. Sablayan Marine Sanctuary"
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpa-category">Boundary type</Label>
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v as Category);
                }}
              >
                <SelectTrigger id="mpa-category" data-testid="mpa-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mpa">Marine Protected Area (MPA)</SelectItem>
                  <SelectItem value="special_area">Special area</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpa-municipality">Under municipality</Label>
              <Select
                value={parentMunicipalityId}
                onValueChange={setParentMunicipalityId}
              >
                <SelectTrigger id="mpa-municipality" data-testid="mpa-municipality-select">
                  <SelectValue placeholder="Select a municipality…" />
                </SelectTrigger>
                <SelectContent>
                  {(municipalitiesQuery.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.province})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpa-file">Boundary file (.kml or .kmz)</Label>
              <Input
                id="mpa-file"
                ref={fileInputRef}
                data-testid="mpa-file-input"
                type="file"
                accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                onChange={(e) => void handleFileChange(e)}
              />
              {parsing && <p className="text-xs text-muted-foreground">Reading file…</p>}
              {!parsing && fileName != null && polygonCount > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {fileName}: {polygonCount} area{polygonCount === 1 ? "" : "s"} detected.
                </p>
              )}
            </div>

            {feedback?.kind === "error" && (
              <p className="text-sm text-destructive">{feedback.message}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={createBoundary.isPending}>
            {feedback?.kind === "success" ? "Close" : "Cancel"}
          </Button>
          {feedback?.kind !== "success" && (
            <Button data-testid="mpa-submit-button" onClick={handleSubmit} disabled={!canSubmit}>
              {createBoundary.isPending ? "Creating…" : "Create boundary"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
