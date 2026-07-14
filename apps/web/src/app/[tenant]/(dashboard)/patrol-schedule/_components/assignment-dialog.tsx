"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ChevronDown, X } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import {
  PlannedTrackDraw,
  type PlannedTrackGeoJSON,
} from "./planned-track-draw";

type ConflictItem = {
  id: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  rangerName: string;
  patrolArea: { id: string; name: string } | null;
};

function formatRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Formats a Date as a `datetime-local` input value using LOCAL time
 *  components (not UTC) so `new Date(inputValue)` round-trips back to the
 *  same instant — `datetime-local` strings are parsed as local time. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

type AccompanyingRanger = { userId?: string; name: string };

interface InitialValues {
  id: string;
  patrolAreaId: string | null;
  rangerUserId: string | null;
  rangerName: string;
  accompanyingRangers?: AccompanyingRanger[] | null;
  scheduledStart: Date;
  plannedHours?: number | null;
  plannedTrackGeojson?: PlannedTrackGeoJSON | null;
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
  const [accompanyingRangers, setAccompanyingRangers] = useState<
    AccompanyingRanger[]
  >([]);
  const [plannedTrackGeojson, setPlannedTrackGeojson] =
    useState<PlannedTrackGeoJSON | null>(null);
  const [scheduledStartRaw, setScheduledStartRaw] = useState<string>("");
  const [plannedHoursRaw, setPlannedHoursRaw] = useState<string>("");
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
      setAccompanyingRangers(initial.accompanyingRangers ?? []);
      setPlannedTrackGeojson(initial.plannedTrackGeojson ?? null);
      setScheduledStartRaw(toDatetimeLocalValue(initial.scheduledStart));
      setPlannedHoursRaw(
        initial.plannedHours !== null && initial.plannedHours !== undefined
          ? String(initial.plannedHours)
          : "",
      );
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

  // Accompanying-ranger candidates exclude whoever is currently the lead.
  const accompanyingCandidates = useMemo(
    () => rangerOptions.filter((u) => u.id !== rangerUserId),
    [rangerOptions, rangerUserId],
  );

  // Auto-fill rangerName when the lead rangerUserId changes
  function handleRangerSelect(value: string) {
    const nextId = value === UNASSIGNED_VALUE ? null : value;
    setRangerUserId(nextId);
    if (nextId !== null) {
      // The lead can't also be an accompanying ranger.
      setAccompanyingRangers((prev) => prev.filter((r) => r.userId !== nextId));
    }
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

  function toggleAccompanying(user: { id: string; fullName: string }, checked: boolean) {
    setAccompanyingRangers((prev) => {
      if (checked) {
        if (prev.some((r) => r.userId === user.id)) return prev;
        return [...prev, { userId: user.id, name: user.fullName }];
      }
      return prev.filter((r) => r.userId !== user.id);
    });
  }

  function removeAccompanying(target: AccompanyingRanger) {
    setAccompanyingRangers((prev) =>
      prev.filter((r) => (r.userId ?? r.name) !== (target.userId ?? target.name)),
    );
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
    setAccompanyingRangers([]);
    setPlannedTrackGeojson(null);
    lastAutoFillName.current = "";
    setNameOpen(false);
    setScheduledStartRaw("");
    setPlannedHoursRaw("");
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
        validPatrolAreaId: string | undefined;
        trimmedName: string;
        startDate: Date;
        plannedHoursValue: number;
        trimmedNotes: string;
        accompanying: AccompanyingRanger[];
      }
    | { ok: false } {
    const trimmedName = rangerName.trim();
    if (trimmedName.length < 1) {
      setValidationError("Lead ranger name is required.");
      return { ok: false };
    }
    if (trimmedName.length > 200) {
      setValidationError("Ranger name must be 200 characters or fewer.");
      return { ok: false };
    }
    if (scheduledStartRaw === "") {
      setValidationError("Scheduled start date & time is required.");
      return { ok: false };
    }
    const startDate = new Date(scheduledStartRaw);
    if (Number.isNaN(startDate.getTime())) {
      setValidationError("Scheduled start date & time is invalid.");
      return { ok: false };
    }
    if (plannedHoursRaw === "") {
      setValidationError("Planned hours is required.");
      return { ok: false };
    }
    const plannedHoursValue = Number(plannedHoursRaw);
    if (!Number.isFinite(plannedHoursValue) || plannedHoursValue <= 0) {
      setValidationError("Planned hours must be a positive number.");
      return { ok: false };
    }
    if (plannedHoursValue > 1000) {
      setValidationError("Planned hours must be 1000 or fewer.");
      return { ok: false };
    }
    if (notes.length > 2000) {
      setValidationError("Notes must be 2000 characters or fewer.");
      return { ok: false };
    }
    return {
      ok: true,
      validPatrolAreaId: patrolAreaId ?? undefined,
      trimmedName,
      startDate,
      plannedHoursValue,
      trimmedNotes: notes.trim(),
      accompanying: accompanyingRangers,
    };
  }

  async function handleSubmit() {
    setValidationError(null);
    setFeedback(null);

    const validated = buildValidatedPayload();
    if (!validated.ok) return;
    const {
      validPatrolAreaId,
      trimmedName,
      startDate,
      plannedHoursValue,
      trimmedNotes,
      accompanying,
    } = validated;
    const effectiveEnd = new Date(
      startDate.getTime() + plannedHoursValue * 3600 * 1000,
    );

    // Pre-flight conflict check (primary gate — server error is race-condition safety net)
    const conflictPayload: {
      rangerUserId?: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      excludeId?: string;
    } = {
      scheduledStart: startDate,
      scheduledEnd: effectiveEnd,
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
        ...(validPatrolAreaId !== undefined ? { patrolAreaId: validPatrolAreaId } : {}),
        ...(rangerUserId !== null ? { rangerUserId } : {}),
        rangerName: trimmedName,
        ...(accompanying.length > 0 ? { accompanyingRangers: accompanying } : {}),
        scheduledStart: startDate,
        plannedHours: plannedHoursValue,
        ...(plannedTrackGeojson !== null ? { plannedTrackGeojson } : {}),
        ...(trimmedNotes !== "" ? { notes: trimmedNotes } : {}),
        overrideConflicts: false,
      });
    } else {
      if (initial === undefined) return;

      // Build update payload — only send fields that differ.
      // Note: rangerUserId/patrolAreaId can only be CHANGED to a different
      // value via this dialog; resetting either back to null (Unassigned /
      // No area) is not supported by the backend update schema (it accepts
      // string|undefined, not nullable) — same for plannedTrackGeojson. A
      // dedicated "clear" mutation would be needed to close that gap.
      const payload: {
        id: string;
        patrolAreaId?: string;
        rangerUserId?: string;
        rangerName?: string;
        accompanyingRangers?: AccompanyingRanger[];
        scheduledStart?: Date;
        plannedHours?: number;
        plannedTrackGeojson?: PlannedTrackGeoJSON;
        notes?: string;
        overrideConflicts?: boolean;
      } = { id: initial.id, overrideConflicts: false };

      if (
        validPatrolAreaId !== undefined &&
        validPatrolAreaId !== (initial.patrolAreaId ?? undefined)
      ) {
        payload.patrolAreaId = validPatrolAreaId;
      }
      if (rangerUserId !== null && rangerUserId !== initial.rangerUserId) {
        payload.rangerUserId = rangerUserId;
      }
      if (trimmedName !== initial.rangerName) {
        payload.rangerName = trimmedName;
      }
      if (
        JSON.stringify(accompanying) !==
        JSON.stringify(initial.accompanyingRangers ?? [])
      ) {
        payload.accompanyingRangers = accompanying;
      }
      if (startDate.getTime() !== initial.scheduledStart.getTime()) {
        payload.scheduledStart = startDate;
      }
      const initialPlannedHours = initial.plannedHours ?? undefined;
      if (plannedHoursValue !== initialPlannedHours) {
        payload.plannedHours = plannedHoursValue;
      }
      if (
        JSON.stringify(plannedTrackGeojson) !==
        JSON.stringify(initial.plannedTrackGeojson ?? null)
      ) {
        if (plannedTrackGeojson !== null) {
          payload.plannedTrackGeojson = plannedTrackGeojson;
        }
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
    const {
      validPatrolAreaId,
      trimmedName,
      startDate,
      plannedHoursValue,
      trimmedNotes,
      accompanying,
    } = validated;

    setPendingConflicts(null);

    if (mode === "create") {
      create.mutate({
        ...(validPatrolAreaId !== undefined ? { patrolAreaId: validPatrolAreaId } : {}),
        ...(rangerUserId !== null ? { rangerUserId } : {}),
        rangerName: trimmedName,
        ...(accompanying.length > 0 ? { accompanyingRangers: accompanying } : {}),
        scheduledStart: startDate,
        plannedHours: plannedHoursValue,
        ...(plannedTrackGeojson !== null ? { plannedTrackGeojson } : {}),
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
        accompanyingRangers?: AccompanyingRanger[];
        scheduledStart?: Date;
        plannedHours?: number;
        plannedTrackGeojson?: PlannedTrackGeoJSON;
        notes?: string;
        overrideConflicts?: boolean;
      } = { id: initial.id, overrideConflicts: true };

      if (
        validPatrolAreaId !== undefined &&
        validPatrolAreaId !== (initial.patrolAreaId ?? undefined)
      ) {
        payload.patrolAreaId = validPatrolAreaId;
      }
      if (rangerUserId !== null && rangerUserId !== initial.rangerUserId) {
        payload.rangerUserId = rangerUserId;
      }
      if (trimmedName !== initial.rangerName) {
        payload.rangerName = trimmedName;
      }
      if (
        JSON.stringify(accompanying) !==
        JSON.stringify(initial.accompanyingRangers ?? [])
      ) {
        payload.accompanyingRangers = accompanying;
      }
      if (startDate.getTime() !== initial.scheduledStart.getTime()) {
        payload.scheduledStart = startDate;
      }
      const initialPlannedHours = initial.plannedHours ?? undefined;
      if (plannedHoursValue !== initialPlannedHours) {
        payload.plannedHours = plannedHoursValue;
      }
      if (
        JSON.stringify(plannedTrackGeojson) !==
        JSON.stringify(initial.plannedTrackGeojson ?? null)
      ) {
        if (plannedTrackGeojson !== null) {
          payload.plannedTrackGeojson = plannedTrackGeojson;
        }
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

  // Live "ends ~" hint from the current start + planned-hours inputs.
  const computedEndHint = useMemo(() => {
    if (scheduledStartRaw === "" || plannedHoursRaw === "") return null;
    const start = new Date(scheduledStartRaw);
    const hours = Number(plannedHoursRaw);
    if (Number.isNaN(start.getTime()) || !Number.isFinite(hours) || hours <= 0) {
      return null;
    }
    return formatDateTime(new Date(start.getTime() + hours * 3600 * 1000));
  }, [scheduledStartRaw, plannedHoursRaw]);

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
            Draw the planned patrol track, assign a lead ranger, and set a
            start time and planned duration. The patrol area is optional.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Planned track — map draw (primary spatial input) */}
          <div className="space-y-2">
            <Label>Planned track</Label>
            <PlannedTrackDraw
              value={plannedTrackGeojson}
              onChange={setPlannedTrackGeojson}
            />
          </div>

          {/* Patrol area (optional secondary) */}
          <div className="space-y-2">
            <Label htmlFor={`${testPrefix}-area`}>Patrol area (optional)</Label>
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

          {/* Lead ranger select */}
          <div className="space-y-2">
            <Label htmlFor={`${testPrefix}-ranger`}>Lead ranger</Label>
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

          {/* Lead ranger name — 3-source autocomplete combobox / manual fallback */}
          <div className="space-y-2">
            <Label htmlFor={`${testPrefix}-name`}>Lead ranger name</Label>
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

          {/* Accompanying rangers — multi-select */}
          <div className="space-y-2">
            <Label>Accompanying rangers (optional)</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                  data-testid={`${testPrefix}-accompanying-trigger`}
                >
                  {accompanyingRangers.length === 0
                    ? "Select accompanying rangers…"
                    : `${String(accompanyingRangers.length)} selected`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-[--radix-dropdown-menu-trigger-width]"
              >
                {accompanyingCandidates.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No other rangers available.
                  </p>
                )}
                {accompanyingCandidates.map((u) => {
                  const checked = accompanyingRangers.some((r) => r.userId === u.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={u.id}
                      checked={checked}
                      onSelect={(e) => { e.preventDefault(); }}
                      onCheckedChange={(next) => { toggleAccompanying(u, next); }}
                    >
                      {u.fullName}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            {accompanyingRangers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {accompanyingRangers.map((r) => (
                  <span
                    key={r.userId ?? r.name}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {r.name}
                    <button
                      type="button"
                      aria-label={`Remove ${r.name}`}
                      onClick={() => { removeAccompanying(r); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Start date/time + planned hours */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${testPrefix}-start`}>Start date &amp; time</Label>
              <Input
                id={`${testPrefix}-start`}
                data-testid={`${testPrefix}-start`}
                type="datetime-local"
                value={scheduledStartRaw}
                onChange={(e) => {
                  setScheduledStartRaw(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${testPrefix}-hours`}>Planned hours</Label>
              <Input
                id={`${testPrefix}-hours`}
                data-testid={`${testPrefix}-hours`}
                type="number"
                min="0.5"
                step="0.5"
                placeholder="e.g. 4"
                value={plannedHoursRaw}
                onChange={(e) => {
                  setPlannedHoursRaw(e.target.value);
                }}
              />
            </div>
          </div>
          {computedEndHint !== null && (
            <p
              data-testid={`${testPrefix}-end-hint`}
              className="text-xs text-muted-foreground"
            >
              Ends ~{computedEndHint}
            </p>
          )}

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
                  {c.patrolArea?.name ?? "No area"} —{" "}
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
