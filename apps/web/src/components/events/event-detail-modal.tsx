"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isImageAsset } from "@marine-guardian/shared/lib/asset-mime";
import { trpc } from "@/lib/trpc/client";
import { AccompanyingRangersInput } from "./accompanying-rangers-input";
import { EventTimeline } from "./event-timeline";
import { RevisionTimeline } from "@/components/revisions/revision-timeline";

type EventDetailModalProps = {
  eventId: string | null;
  onClose: () => void;
};

type NotesPayload = {
  text?: string;
};

function readNotes(value: unknown): NotesPayload {
  if (value === null || value === undefined || typeof value !== "object") {
    return {};
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return value as NotesPayload;
}

/**
 * Format an EarthRanger detail key into a human label:
 * "place_seen" → "Place Seen", "vessel_0_name" → "Vessel 0 Name".
 */
function formatErDetailLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // split camelCase
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type ErDetailRow = { key: string; label: string; text: string };

/**
 * Flatten the harvested ER event-detail JSON (`eventDetailsJson`) into
 * displayable rows. Excludes the noisy `updates` audit array and any empty
 * values; scalars render as text, nested arrays/objects as compact JSON. This
 * is the REAL per-event field data EarthRanger captured — it was being stored
 * but never shown (the modal only rendered the sparse operator-fill columns).
 */
function readErDetailRows(value: unknown): ErDetailRow[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const rows: ErDetailRow[] = [];
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === "updates") continue; // ER audit trail, not field data
    if (raw === null || raw === undefined || raw === "") continue;
    let text: string;
    if (typeof raw === "boolean") text = raw ? "Yes" : "No";
    else if (typeof raw === "number") text = String(raw);
    else if (typeof raw === "string") text = raw;
    else text = JSON.stringify(raw);
    if (text.trim().length === 0) continue;
    rows.push({ key, label: formatErDetailLabel(key), text });
  }
  return rows;
}

export function EventDetailModal({ eventId, onClose }: EventDetailModalProps) {
  const open = eventId !== null;
  const utils = trpc.useUtils();

  const eventQuery = trpc.event.getById.useQuery(
    { id: eventId ?? "" },
    { enabled: open },
  );

  // Revision history — lazy: only fetched when the History tab is active.
  const [historyActive, setHistoryActive] = useState(false);
  const revisionsQuery = trpc.event.getRevisions.useQuery(
    { eventId: eventId ?? "" },
    { enabled: open && historyActive },
  );

  // BUG-2b FIX: track save errors so they surface to the user instead of
  // failing silently (the modal was staying open with no feedback on 400).
  const [saveError, setSaveError] = useState<string | null>(null);

  // Photo lightbox: index into the image-only asset list (null = closed).
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Image-only assets, shared by the thumbnail grid (index lookup) + lightbox.
  const imageAssets = (eventQuery.data?.assets ?? []).filter((a) =>
    isImageAsset(a.mimeType, a.filename),
  );

  const updateEvent = trpc.event.update.useMutation({
    onSuccess: () => {
      setSaveError(null);
      void utils.event.list.invalidate();
      void utils.event.getById.invalidate({ id: eventId ?? "" });
      // Invalidate revision cache so the History tab reflects the new edit.
      void utils.event.getRevisions.invalidate({ eventId: eventId ?? "" });
      onClose();
    },
    onError: (err) => {
      setSaveError(err.message);
    },
  });

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [notes, setNotes] = useState("");
  const [offenderName, setOffenderName] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [vesselRegistration, setVesselRegistration] = useState("");
  const [address, setAddress] = useState("");
  const [actionTaken, setActionTaken] = useState("");

  useEffect(() => {
    if (!eventQuery.data) return;
    const ev = eventQuery.data;
    setTitle(ev.title ?? "");
    setPriority(ev.priority);
    setNotes(readNotes(ev.notesJson).text ?? "");
    setOffenderName(ev.offenderName ?? "");
    setVesselName(ev.vesselName ?? "");
    setVesselRegistration(ev.vesselRegistration ?? "");
    setAddress(ev.address ?? "");
    setActionTaken(ev.actionTaken ?? "");
  }, [eventQuery.data]);

  // Reset tab state when the modal closes / different event opens.
  useEffect(() => {
    if (!open) setHistoryActive(false);
  }, [open]);

  const handleSave = () => {
    if (eventId === null) return;
    // BUG-2b: client-side guard — surface validation errors immediately
    // without a round-trip.  Keep the modal open so the user can fix the field.
    if (title.trim().length === 0) {
      setSaveError("Title is required.");
      return;
    }
    setSaveError(null);
    updateEvent.mutate({
      id: eventId,
      title,
      priority,
      notesJson: { text: notes },
      offenderName,
      vesselName,
      vesselRegistration,
      address,
      actionTaken,
    });
  };

  const handleRangersChange = () => {
    void utils.event.getById.invalidate({ id: eventId ?? "" });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {eventQuery.data?.title ?? "Event Detail"}
            {eventQuery.data?.serialNumber !== null &&
              eventQuery.data?.serialNumber !== undefined && (
                <span className="ml-2 font-mono text-sm text-muted-foreground">
                  #{eventQuery.data.serialNumber}
                </span>
              )}
          </DialogTitle>
          <DialogDescription>
            Edit fields, manage accompanying rangers, and review edit history.
          </DialogDescription>
        </DialogHeader>

        {eventQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading event...</p>
        )}

        {eventQuery.data && (
          <Tabs
            defaultValue="edit"
            onValueChange={(v) => {
              if (v === "history") setHistoryActive(true);
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="edit" className="flex-1">
                Edit
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                Edit History
              </TabsTrigger>
            </TabsList>

            {/* ── Edit tab ──────────────────────────────────────────────── */}
            <TabsContent value="edit" className="space-y-5 pt-4">
              {/* Photos first: when an event has imagery, surface it above the
                  fill form so the operator sees it immediately (all event types). */}
              {eventQuery.data.assets.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Photos ({eventQuery.data.assets.length})
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {eventQuery.data.assets.map((asset) => {
                      const href = `/api/assets/${asset.id}`;
                      const isImage = isImageAsset(asset.mimeType, asset.filename);
                      // Images open the in-app lightbox (enlarged + prev/next);
                      // non-images keep a download/new-tab link.
                      if (isImage) {
                        const imgIdx = imageAssets.findIndex(
                          (a) => a.id === asset.id,
                        );
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => {
                              setLightboxIndex(imgIdx);
                            }}
                            className="block cursor-pointer overflow-hidden rounded border"
                            data-testid="event-asset"
                          >
                            <img
                              src={href}
                              alt={asset.filename}
                              loading="lazy"
                              className="h-28 w-full object-cover"
                            />
                          </button>
                        );
                      }
                      return (
                        <a
                          key={asset.id}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded border"
                          data-testid="event-asset"
                        >
                          <span className="flex h-28 items-center justify-center px-2 text-center text-xs text-muted-foreground">
                            {asset.filename}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="event-title">Title</Label>
                  <Input
                    id="event-title"
                    value={title}
                    aria-invalid={saveError !== null && title.trim().length === 0}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      // Clear client-side title error as soon as the user types.
                      if (saveError !== null && e.target.value.trim().length > 0) {
                        setSaveError(null);
                      }
                    }}
                  />
                  {/* BUG-2b: field-level error when title is blank */}
                  {saveError !== null && title.trim().length === 0 && (
                    <p className="mt-1 text-xs text-destructive" role="alert" data-testid="event-title-error">
                      {saveError}
                    </p>
                  )}
                </div>
                <div>
                  {/* BUG-2 FIX: label updated — ER events store raw priority
                      values (0, 100, 200, 300); the old "0–3" cap was wrong. */}
                  <Label htmlFor="event-priority">Priority</Label>
                  <Input
                    id="event-priority"
                    type="number"
                    min={0}
                    value={priority}
                    onChange={(e) => {
                      setPriority(Number.parseInt(e.target.value, 10) || 0);
                    }}
                  />
                </div>
              </div>

              {/* EarthRanger Field Data — read-only. The actual per-event fields
                  harvested from ER (species, vessel info, counts, etc.) live in
                  eventDetailsJson; surface them so the modal isn't blank for the
                  bulk of synced events whose operator-fill columns are empty. */}
              {(() => {
                const rows = readErDetailRows(
                  eventQuery.data.eventDetailsJson,
                );
                if (rows.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">
                      EarthRanger Field Data
                    </h3>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/20 p-3">
                      {rows.map((r) => (
                        <div key={r.key} className="min-w-0 space-y-0.5">
                          <dt className="text-xs text-muted-foreground">
                            {r.label}
                          </dt>
                          <dd className="break-words text-sm">{r.text}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })()}

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Operator Fill</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label
                      htmlFor="ed-offender"
                      className="text-xs text-muted-foreground"
                    >
                      Offender name
                    </Label>
                    <Input
                      id="ed-offender"
                      value={offenderName}
                      onChange={(e) => {
                        setOffenderName(e.target.value);
                      }}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="ed-vessel"
                      className="text-xs text-muted-foreground"
                    >
                      Vessel name
                    </Label>
                    <Input
                      id="ed-vessel"
                      value={vesselName}
                      onChange={(e) => {
                        setVesselName(e.target.value);
                      }}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="ed-reg"
                      className="text-xs text-muted-foreground"
                    >
                      Vessel registration
                    </Label>
                    <Input
                      id="ed-reg"
                      value={vesselRegistration}
                      onChange={(e) => {
                        setVesselRegistration(e.target.value);
                      }}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="ed-address"
                      className="text-xs text-muted-foreground"
                    >
                      Address
                    </Label>
                    <Input
                      id="ed-address"
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label
                      htmlFor="ed-action"
                      className="text-xs text-muted-foreground"
                    >
                      Action taken
                    </Label>
                    <Textarea
                      id="ed-action"
                      value={actionTaken}
                      onChange={(e) => {
                        setActionTaken(e.target.value);
                      }}
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="event-notes">Notes</Label>
                <Textarea
                  id="event-notes"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                  }}
                  rows={5}
                />
              </div>

              {(eventQuery.data.locationLat !== null ||
                eventQuery.data.locationLon !== null) && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Location:</span>{" "}
                  {eventQuery.data.locationLat?.toFixed(5) ?? "—"}° N,{" "}
                  {eventQuery.data.locationLon?.toFixed(5) ?? "—"}° E
                  <span className="ml-2 italic">
                    (mini-map: deferred to Phase 7)
                  </span>
                </div>
              )}

              <AccompanyingRangersInput
                eventId={eventQuery.data.id}
                rangers={eventQuery.data.accompanyingRangers}
                onChange={handleRangersChange}
              />

              <EventTimeline
                createdAt={eventQuery.data.createdAt}
                syncedAt={eventQuery.data.syncedAt}
                updatedAt={eventQuery.data.updatedAt}
                reportedAt={eventQuery.data.reportedAt}
              />

              {/* BUG-2b: surface save errors so users see what went wrong */}
              {saveError !== null && (
                <p
                  className="text-sm text-destructive"
                  role="alert"
                  data-testid="event-save-error"
                >
                  {saveError}
                </p>
              )}

              <DialogFooter className="pt-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={updateEvent.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                  disabled={updateEvent.isPending || eventQuery.data === undefined}
                >
                  {updateEvent.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* ── History tab ───────────────────────────────────────────── */}
            <TabsContent value="history" className="pt-4">
              <RevisionTimeline
                revisions={revisionsQuery.data?.revisions ?? []}
                erOriginalSnapshot={
                  revisionsQuery.data?.erOriginalSnapshot ?? null
                }
                erSyncedAt={revisionsQuery.data?.erSyncedAt}
                isLoading={revisionsQuery.isLoading}
              />
            </TabsContent>
          </Tabs>
        )}

        <PhotoLightbox
          images={imageAssets}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * In-app photo lightbox — opens an enlarged image in a popup (nested Dialog, so
 * Escape closes the lightbox first and leaves the event modal open) with prev/
 * next navigation via on-screen buttons and the ← / → arrow keys. Replaces the
 * old "open in a new tab" behaviour for image assets.
 */
function PhotoLightbox({
  images,
  index,
  onIndexChange,
}: {
  images: { id: string; filename: string }[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
}) {
  useEffect(() => {
    if (index === null || images.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        onIndexChange((index + 1) % images.length);
      } else if (e.key === "ArrowLeft") {
        onIndexChange((index - 1 + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [index, images.length, onIndexChange]);

  if (index === null) return null;
  const current = images[index];
  if (current === undefined) return null;
  const multi = images.length > 1;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onIndexChange(null);
      }}
    >
      <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">
          {`Photo ${String(index + 1)} of ${String(images.length)}`}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {current.filename}
        </DialogDescription>
        <div className="relative flex items-center justify-center">
          <img
            src={`/api/assets/${current.id}`}
            alt={current.filename}
            className="max-h-[85vh] w-auto max-w-full rounded object-contain"
          />
          {multi && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => {
                  onIndexChange((index - 1 + images.length) % images.length);
                }}
                className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => {
                  onIndexChange((index + 1) % images.length);
                }}
                className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <span className="absolute bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums">
                {`${String(index + 1)} / ${String(images.length)}`}
              </span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
