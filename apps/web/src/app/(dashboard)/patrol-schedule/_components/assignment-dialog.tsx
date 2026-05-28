"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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

const UNASSIGNED_VALUE = "__none__";

interface InitialValues {
  id: string;
  patrolAreaId: string;
  rangerUserId: string | null;
  rangerName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  mode: "create" | "edit";
  initial?: InitialValues;
}

export function AssignmentDialog({
  open,
  onOpenChange,
  onSuccess,
  mode,
  initial,
}: Props) {
  const utils = trpc.useUtils();

  const [patrolAreaId, setPatrolAreaId] = useState<string | null>(null);
  const [rangerUserId, setRangerUserId] = useState<string | null>(null);
  const [rangerName, setRangerName] = useState<string>("");
  const [scheduledStartRaw, setScheduledStartRaw] = useState<string>("");
  const [scheduledEndRaw, setScheduledEndRaw] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { kind: "success" } | { kind: "error"; message: string } | null
  >(null);

  // Track the last name auto-filled from a ranger selection so we know
  // whether the user has manually edited the rangerName field.
  const lastAutoFillName = useRef<string>("");

  // Prefill when editing
  useEffect(() => {
    if (mode === "edit" && initial !== undefined) {
      setPatrolAreaId(initial.patrolAreaId);
      setRangerUserId(initial.rangerUserId);
      setRangerName(initial.rangerName);
      lastAutoFillName.current = initial.rangerName;
      setScheduledStartRaw(initial.scheduledStart.toISOString().slice(0, 10));
      setScheduledEndRaw(initial.scheduledEnd.toISOString().slice(0, 10));
      setNotes(initial.notes ?? "");
    }
  }, [mode, initial]);

  const areasQuery = trpc.patrolArea.list.useQuery({ limit: 200, isActive: true });
  const areaOptions = useMemo(
    () => areasQuery.data?.items ?? [],
    [areasQuery.data],
  );

  const usersQuery = trpc.user.list.useQuery({ limit: 200 });
  const rangerOptions = useMemo(
    () => (usersQuery.data?.items ?? []).filter((u) => u.isActive),
    [usersQuery.data],
  );

  // Auto-fill rangerName when rangerUserId changes
  function handleRangerSelect(value: string) {
    const nextId = value === UNASSIGNED_VALUE ? null : value;
    setRangerUserId(nextId);
    if (nextId === null) {
      // Unassigned — clear auto-fill tracking but don't wipe a manual name
      lastAutoFillName.current = "";
      return;
    }
    const user = rangerOptions.find((u) => u.id === nextId);
    if (user === undefined) return;
    // Only auto-fill if rangerName is empty OR matches the previously auto-filled name
    const currentName = rangerName;
    if (currentName === "" || currentName === lastAutoFillName.current) {
      setRangerName(user.fullName);
      lastAutoFillName.current = user.fullName;
    }
  }

  const create = trpc.patrolSchedule.create.useMutation({
    onSuccess: () => {
      setFeedback({ kind: "success" });
      void utils.patrolSchedule.list.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  const update = trpc.patrolSchedule.update.useMutation({
    onSuccess: () => {
      setFeedback({ kind: "success" });
      void utils.patrolSchedule.list.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  const isPending = create.isPending || update.isPending;

  function resetForm() {
    setPatrolAreaId(null);
    setRangerUserId(null);
    setRangerName("");
    lastAutoFillName.current = "";
    setScheduledStartRaw("");
    setScheduledEndRaw("");
    setNotes("");
    setValidationError(null);
    setFeedback(null);
    create.reset();
    update.reset();
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  function handleSuccessClose() {
    resetForm();
    onSuccess();
  }

  function handleSubmit() {
    setValidationError(null);
    setFeedback(null);

    if (patrolAreaId === null || patrolAreaId === "") {
      setValidationError("Patrol area is required.");
      return;
    }
    const trimmedName = rangerName.trim();
    if (trimmedName.length < 1) {
      setValidationError("Ranger name is required.");
      return;
    }
    if (trimmedName.length > 200) {
      setValidationError("Ranger name must be 200 characters or fewer.");
      return;
    }
    if (scheduledStartRaw === "") {
      setValidationError("Scheduled start date is required.");
      return;
    }
    if (scheduledEndRaw === "") {
      setValidationError("Scheduled end date is required.");
      return;
    }
    const startDate = new Date(scheduledStartRaw);
    if (Number.isNaN(startDate.getTime())) {
      setValidationError("Scheduled start date is invalid.");
      return;
    }
    const endDate = new Date(scheduledEndRaw);
    if (Number.isNaN(endDate.getTime())) {
      setValidationError("Scheduled end date is invalid.");
      return;
    }
    if (endDate < startDate) {
      setValidationError("Scheduled end must be on or after the start date.");
      return;
    }
    if (notes.length > 2000) {
      setValidationError("Notes must be 2000 characters or fewer.");
      return;
    }

    if (mode === "create") {
      const trimmedNotes = notes.trim();
      create.mutate({
        patrolAreaId,
        ...(rangerUserId !== null ? { rangerUserId } : {}),
        rangerName: trimmedName,
        scheduledStart: startDate,
        scheduledEnd: endDate,
        ...(trimmedNotes !== "" ? { notes: trimmedNotes } : {}),
      });
    } else {
      if (initial === undefined) return;

      // Build update payload — only send fields that differ.
      // Note: rangerUserId can only be CHANGED to a different ranger via this dialog;
      // setting it back to "Unassigned" (null) is not supported by the backend update
      // schema (it accepts string|undefined, not nullable). Re-assigning to null is a
      // backend gap to address separately.
      const payload: {
        id: string;
        patrolAreaId?: string;
        rangerUserId?: string;
        rangerName?: string;
        scheduledStart?: Date;
        scheduledEnd?: Date;
        notes?: string;
      } = { id: initial.id };

      if (patrolAreaId !== initial.patrolAreaId) {
        payload.patrolAreaId = patrolAreaId;
      }
      if (rangerUserId !== null && rangerUserId !== initial.rangerUserId) {
        payload.rangerUserId = rangerUserId;
      }
      if (trimmedName !== initial.rangerName) {
        payload.rangerName = trimmedName;
      }
      if (startDate.getTime() !== initial.scheduledStart.getTime()) {
        payload.scheduledStart = startDate;
      }
      if (endDate.getTime() !== initial.scheduledEnd.getTime()) {
        payload.scheduledEnd = endDate;
      }
      const trimmedNotes = notes.trim();
      const initialNotes = initial.notes ?? "";
      if (trimmedNotes !== initialNotes && trimmedNotes !== "") {
        payload.notes = trimmedNotes;
      }

      update.mutate(payload);
    }
  }

  const testPrefix = `patrol-schedule-assignment-${mode}`;
  const title = mode === "create" ? "Schedule patrol assignment" : "Edit assignment";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Assign a ranger to a patrol area for a scheduled date range. Ranger
            selection is optional — enter a name manually if the ranger is not
            yet registered. Start and end dates are required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Patrol area */}
          <div className="space-y-2">
            <Label htmlFor={`${testPrefix}-area`}>Patrol area</Label>
            <Select
              value={patrolAreaId ?? ""}
              onValueChange={(v) => {
                setPatrolAreaId(v);
              }}
            >
              <SelectTrigger
                id={`${testPrefix}-area`}
                data-testid={`${testPrefix}-area`}
              >
                <SelectValue placeholder="Select area" />
              </SelectTrigger>
              <SelectContent>
                {areaOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ranger select (optional) */}
          <div className="space-y-2">
            <Label htmlFor={`${testPrefix}-ranger`}>Ranger (optional)</Label>
            <Select
              value={rangerUserId ?? UNASSIGNED_VALUE}
              onValueChange={handleRangerSelect}
            >
              <SelectTrigger
                id={`${testPrefix}-ranger`}
                data-testid={`${testPrefix}-ranger`}
              >
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                {rangerOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ranger name */}
          <div className="space-y-2">
            <Label htmlFor={`${testPrefix}-name`}>Ranger name</Label>
            <Input
              id={`${testPrefix}-name`}
              data-testid={`${testPrefix}-name`}
              placeholder="Enter ranger name"
              value={rangerName}
              onChange={(e) => {
                setRangerName(e.target.value);
                // If user manually edits, detach from auto-fill
                lastAutoFillName.current = "";
              }}
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${testPrefix}-start`}>Start date</Label>
              <Input
                id={`${testPrefix}-start`}
                data-testid={`${testPrefix}-start`}
                type="date"
                value={scheduledStartRaw}
                onChange={(e) => {
                  setScheduledStartRaw(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${testPrefix}-end`}>End date</Label>
              <Input
                id={`${testPrefix}-end`}
                data-testid={`${testPrefix}-end`}
                type="date"
                value={scheduledEndRaw}
                onChange={(e) => {
                  setScheduledEndRaw(e.target.value);
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor={`${testPrefix}-notes`}>Notes (optional)</Label>
            <textarea
              id={`${testPrefix}-notes`}
              data-testid={`${testPrefix}-notes`}
              rows={3}
              placeholder="Additional instructions or context…"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        {validationError !== null && (
          <p
            data-testid={`${testPrefix}-validation-error`}
            className="text-sm text-destructive"
          >
            {validationError}
          </p>
        )}
        {feedback?.kind === "success" && (
          <p
            data-testid={`${testPrefix}-success`}
            className="text-sm text-emerald-600 dark:text-emerald-400"
          >
            {mode === "create"
              ? "Assignment scheduled."
              : "Assignment updated."}
          </p>
        )}
        {feedback?.kind === "error" && (
          <p
            data-testid={`${testPrefix}-error`}
            className="text-sm text-destructive"
          >
            {feedback.message}
          </p>
        )}

        <DialogFooter>
          {feedback?.kind === "success" ? (
            <Button
              data-testid={`${testPrefix}-success-close`}
              onClick={handleSuccessClose}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                data-testid={`${testPrefix}-submit`}
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
