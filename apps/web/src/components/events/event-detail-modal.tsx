"use client";

import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { AccompanyingRangersInput } from "./accompanying-rangers-input";
import { EventTimeline } from "./event-timeline";

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
  return value;
}

export function EventDetailModal({ eventId, onClose }: EventDetailModalProps) {
  const open = eventId !== null;
  const utils = trpc.useUtils();
  const eventQuery = trpc.event.getById.useQuery(
    { id: eventId ?? "" },
    { enabled: open }
  );

  const updateEvent = trpc.event.update.useMutation({
    onSuccess: () => {
      void utils.event.list.invalidate();
      void utils.event.getById.invalidate({ id: eventId ?? "" });
      onClose();
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

  const handleSave = () => {
    if (eventId === null) return;
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
            Edit fields, manage accompanying rangers, and review timeline.
          </DialogDescription>
        </DialogHeader>

        {eventQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading event...</p>
        )}

        {eventQuery.data && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); }}
                />
              </div>
              <div>
                <Label htmlFor="event-priority">Priority (0–3)</Label>
                <Input
                  id="event-priority"
                  type="number"
                  min={0}
                  max={3}
                  value={priority}
                  onChange={(e) =>
                    { setPriority(Number.parseInt(e.target.value, 10) || 0); }
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Operator Fill</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ed-offender" className="text-xs text-muted-foreground">Offender name</Label>
                  <Input id="ed-offender" value={offenderName} onChange={(e) => { setOffenderName(e.target.value); }} />
                </div>
                <div>
                  <Label htmlFor="ed-vessel" className="text-xs text-muted-foreground">Vessel name</Label>
                  <Input id="ed-vessel" value={vesselName} onChange={(e) => { setVesselName(e.target.value); }} />
                </div>
                <div>
                  <Label htmlFor="ed-reg" className="text-xs text-muted-foreground">Vessel registration</Label>
                  <Input id="ed-reg" value={vesselRegistration} onChange={(e) => { setVesselRegistration(e.target.value); }} />
                </div>
                <div>
                  <Label htmlFor="ed-address" className="text-xs text-muted-foreground">Address</Label>
                  <Input id="ed-address" value={address} onChange={(e) => { setAddress(e.target.value); }} />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="ed-action" className="text-xs text-muted-foreground">Action taken</Label>
                  <Textarea id="ed-action" value={actionTaken} onChange={(e) => { setActionTaken(e.target.value); }} rows={4} />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="event-notes">Notes</Label>
              <textarea
                id="event-notes"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); }}
                rows={5}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {(eventQuery.data.locationLat !== null ||
              eventQuery.data.locationLon !== null) && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Location:</span>{" "}
                {eventQuery.data.locationLat?.toFixed(5) ?? "—"}° N,{" "}
                {eventQuery.data.locationLon?.toFixed(5) ?? "—"}° E
                <span className="ml-2 italic">(mini-map: deferred to Phase 7)</span>
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
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateEvent.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateEvent.isPending || !eventQuery.data}>
            {updateEvent.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
