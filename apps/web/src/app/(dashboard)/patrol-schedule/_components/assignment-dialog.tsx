"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ChevronDown } from "lucide-react";
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

type ConflictItem = {
  id: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  rangerName: string;
  patrolArea: { id: string; name: string };
};

function formatRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

/** Debounce hook — returns the debounced value after delayMs */
function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => { setDebounced(value); }, delayMs);
    return () => { clearTimeout(id); };
  }, [value, delayMs]);
  return debounced;
}

type NameSuggestion = {
  id: string | null;
  name: string;
  source: "known_ranger" | "recent_freetext" | "er_subject";
  erSubjectId?: string | null;
};

const NAME_SOURCE_LABELS: Record<NameSuggestion["source"], string> = {
  known_ranger: "Known Rangers",
  er_subject: "EarthRanger Subjects",
  recent_freetext: "Recent Names",
};

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
  const [pendingConflicts, setPendingConflicts] = useState<ConflictItem[] | null>(null);

  // Track the last name auto-filled from a ranger selection so we know
  // whether the user has manually edited the rangerName field.
  const lastAutoFillName = useRef<string>("");

  // ── ranger-name combobox state ─────────────────────────────────────────────
  const [nameOpen, setNameOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameDropdownRef = useRef<HTMLDivElement>(null);
  const debouncedNameQuery = useDebounce(rangerName, 250);

  const nameSuggestQuery = trpc.event.suggestAccompanyingRangers.useQuery(
    { query: debouncedNameQuery },
    { enabled: nameOpen },
  );

  // Close the name-combobox dropdown on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (
        nameDropdownRef.current &&
        !nameDropdownRef.current.contains(e.target as Node) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(e.target as Node)
      ) {
        setNameOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => { document.removeEventListener("mousedown", handleOutsideClick); };
  }, []);

  const nameSuggestions: NameSuggestion[] = nameSuggestQuery.data?.suggestions ?? [];

  // Group suggestions by source (known_ranger → er_subject → recent_freetext)
  const nameGrouped = useMemo(
    () =>
      nameSuggestions.reduce<Map<NameSuggestion["source"], NameSuggestion[]>>(
        (acc, s) => {
          const arr = acc.get(s.source) ?? [];
          arr.push(s);
          acc.set(s.source, arr);
          return acc;
        },
        new Map(),
      ),
    [nameSuggestions],
  );

  const handleSelectNameSuggestion = useCallback((s: NameSuggestion) => {
    setRangerName(s.name);
    lastAutoFillName.current = s.name;
    setNameOpen(false);
  }, []);

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

  // listActiveNames (2026-07-06) — id+fullName-only picker source. user.list
  // is now super_admin/site_admin only (full directory incl. email/role), so
  // this coordinator-facing assignment dropdown reads the minimal-exposure
  // endpoint instead; it already filters to isActive users server-side.
  const usersQuery = trpc.user.listActiveNames.useQuery();
  const rangerOptions = useMemo(
    () => usersQuery.data?.items ?? [],
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
      setNameOpen(false);
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

  async function checkSchedulingConflicts(payload: {
    rangerUserId?: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    excludeId?: string;
  }): Promise<ConflictItem[]> {
    if (payload.rangerUserId === undefined || payload.rangerUserId === "") return [];
    const result = await utils.patrolSchedule.checkConflicts.fetch({
      rangerUserId: payload.rangerUserId,
      scheduledStart: payload.scheduledStart,
      scheduledEnd: payload.scheduledEnd,
      ...(payload.excludeId !== undefined ? { excludeId: payload.excludeId } : {}),
    });
    // result.conflicts is typed by the tRPC router's return shape
    return result.conflicts;
  }

  function resetForm() {
    setPatrolAreaId(null);
    setRangerUserId(null);
    setRangerName("");
    lastAutoFillName.current = "";
    setNameOpen(false);
    setScheduledStartRaw("");
    setScheduledEndRaw("");
    setNotes("");
    setValidationError(null);
    setFeedback(null);
    setPendingConflicts(null);
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

  function buildValidatedPayload():
    | {
        ok: true;
        validPatrolAreaId: string;
        trimmedName: string;
        startDate: Date;
        endDate: Date;
        trimmedNotes: string;
      }
    | { ok: false } {
    if (patrolAreaId === null || patrolAreaId === "") {
      setValidationError("Patrol area is required.");
      return { ok: false };
    }
    const trimmedName = rangerName.trim();
    if (trimmedName.length < 1) {
      setValidationError("Ranger name is required.");
      return { ok: false };
    }
    if (trimmedName.length > 200) {
      setValidationError("Ranger name must be 200 characters or fewer.");
      return { ok: false };
    }
    if (scheduledStartRaw === "") {
      setValidationError("Scheduled start date is required.");
      return { ok: false };
    }
    if (scheduledEndRaw === "") {
      setValidationError("Scheduled end date is required.");
      return { ok: false };
    }
    const startDate = new Date(scheduledStartRaw);
    if (Number.isNaN(startDate.getTime())) {
      setValidationError("Scheduled start date is invalid.");
      return { ok: false };
    }
    const endDate = new Date(scheduledEndRaw);
    if (Number.isNaN(endDate.getTime())) {
      setValidationError("Scheduled end date is invalid.");
      return { ok: false };
    }
    if (endDate < startDate) {
      setValidationError("Scheduled end must be on or after the start date.");
      return { ok: false };
    }
    if (notes.length > 2000) {
      setValidationError("Notes must be 2000 characters or fewer.");
      return { ok: false };
    }
    // patrolAreaId narrowed to string by the null/empty guard above
    return { ok: true, validPatrolAreaId: patrolAreaId, trimmedName, startDate, endDate, trimmedNotes: notes.trim() };
  }

  async function handleSubmit() {
    setValidationError(null);
    setFeedback(null);

    const validated = buildValidatedPayload();
    if (!validated.ok) return;
    const { validPatrolAreaId, trimmedName, startDate, endDate, trimmedNotes } = validated;

    // Pre-flight conflict check (primary gate — server error is race-condition safety net)
    const conflictPayload: {
      rangerUserId?: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      excludeId?: string;
    } = {
      scheduledStart: startDate,
      scheduledEnd: endDate,
    };
    if (rangerUserId !== null) conflictPayload.rangerUserId = rangerUserId;
    if (mode === "edit" && initial !== undefined) conflictPayload.excludeId = initial.id;
    const conflicts = await checkSchedulingConflicts(conflictPayload);
    if (conflicts.length > 0) {
      setPendingConflicts(conflicts);
      return;
    }

    if (mode === "create") {
      create.mutate({
        patrolAreaId: validPatrolAreaId,
        ...(rangerUserId !== null ? { rangerUserId } : {}),
        rangerName: trimmedName,
        scheduledStart: startDate,
        scheduledEnd: endDate,
        ...(trimmedNotes !== "" ? { notes: trimmedNotes } : {}),
        overrideConflicts: false,
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
        overrideConflicts?: boolean;
      } = { id: initial.id, overrideConflicts: false };

      if (validPatrolAreaId !== initial.patrolAreaId) {
        payload.patrolAreaId = validPatrolAreaId;
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
      const initialNotes = initial.notes ?? "";
      if (trimmedNotes !== initialNotes && trimmedNotes !== "") {
        payload.notes = trimmedNotes;
      }

      update.mutate(payload);
    }
  }

  function handleConfirmOverride() {
    // Re-derive from current state — do not use stale cached payload
    const validated = buildValidatedPayload();
    if (!validated.ok) return;
    const { validPatrolAreaId, trimmedName, startDate, endDate, trimmedNotes } = validated;

    setPendingConflicts(null);

    if (mode === "create") {
      create.mutate({
        patrolAreaId: validPatrolAreaId,
        ...(rangerUserId !== null ? { rangerUserId } : {}),
        rangerName: trimmedName,
        scheduledStart: startDate,
        scheduledEnd: endDate,
        ...(trimmedNotes !== "" ? { notes: trimmedNotes } : {}),
        overrideConflicts: true,
      });
    } else {
      if (initial === undefined) return;

      const payload: {
        id: string;
        patrolAreaId?: string;
        rangerUserId?: string;
        rangerName?: string;
        scheduledStart?: Date;
        scheduledEnd?: Date;
        notes?: string;
        overrideConflicts?: boolean;
      } = { id: initial.id, overrideConflicts: true };

      if (validPatrolAreaId !== initial.patrolAreaId) {
        payload.patrolAreaId = validPatrolAreaId;
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

          {/* Ranger name — 3-source autocomplete combobox */}
          <div className="space-y-2">
            <Label htmlFor={`${testPrefix}-name`}>Ranger name</Label>
            <div className="relative">
              <Input
                id={`${testPrefix}-name`}
                ref={nameInputRef}
                data-testid={`${testPrefix}-name`}
                placeholder="Type or search known rangers…"
                value={rangerName}
                autoComplete="off"
                onChange={(e) => {
                  setRangerName(e.target.value);
                  // Detach from auto-fill when user types manually
                  lastAutoFillName.current = "";
                  setNameOpen(true);
                }}
                onFocus={() => { setNameOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setNameOpen(false); }
                }}
              />
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />

              {/* Name suggestion dropdown */}
              {nameOpen && (
                <div
                  ref={nameDropdownRef}
                  className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md"
                  data-testid="ranger-name-suggestions"
                >
                  {nameSuggestQuery.isLoading && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                  )}

                  {!nameSuggestQuery.isLoading && nameSuggestions.length === 0 && rangerName.trim() !== "" && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      No matches — name will be saved as typed.
                    </p>
                  )}

                  {!nameSuggestQuery.isLoading && nameSuggestions.length === 0 && rangerName.trim() === "" && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Start typing to search known rangers, EarthRanger subjects, and recent names.
                    </p>
                  )}

                  {!nameSuggestQuery.isLoading && nameGrouped.size > 0 && (
                    <div className="py-1">
                      {(["known_ranger", "er_subject", "recent_freetext"] as NameSuggestion["source"][]).map(
                        (source) => {
                          const items = nameGrouped.get(source);
                          if (!items || items.length === 0) return null;
                          return (
                            <div key={source}>
                              <p className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {NAME_SOURCE_LABELS[source]}
                              </p>
                              {items.map((s) => (
                                <button
                                  key={`${s.source}-${s.id ?? s.name}`}
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent"
                                  onMouseDown={(e) => {
                                    // Prevent the input blur from firing before onClick
                                    e.preventDefault();
                                    handleSelectNameSuggestion(s);
                                  }}
                                >
                                  {s.name}
                                </button>
                              ))}
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
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

        {pendingConflicts !== null && (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-900/10"
            data-testid="conflict-confirm-view"
          >
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Ranger has {pendingConflicts.length} overlapping{" "}
              {pendingConflicts.length === 1 ? "assignment" : "assignments"}:
            </p>
            <ul className="mt-2 space-y-1 text-amber-900 dark:text-amber-200">
              {pendingConflicts.map((c) => (
                <li key={c.id}>
                  {c.patrolArea.name} —{" "}
                  {formatRange(c.scheduledStart, c.scheduledEnd)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
              Save anyway?
            </p>
          </div>
        )}

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
          ) : pendingConflicts !== null ? (
            <>
              <Button variant="ghost" onClick={handleClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => { setPendingConflicts(null); }}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                data-testid={`${testPrefix}-confirm-override`}
                onClick={handleConfirmOverride}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save anyway"}
              </Button>
            </>
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
                onClick={() => void handleSubmit()}
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
