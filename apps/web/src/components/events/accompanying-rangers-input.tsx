"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, UserPlus, Star, ChevronDown, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

export type AttachedRanger = {
  id: string;
  rangerType: string;
  registeredUserId: string | null;
  freetextName: string | null;
  knownRangerId?: string | null;
  registeredUser?: { id: string; fullName: string } | null;
  knownRanger?: { id: string; name: string; source: string } | null;
};

type Suggestion = {
  id: string | null;
  name: string;
  source: "known_ranger" | "recent_freetext" | "er_subject";
  erSubjectId?: string | null;
};

type AccompanyingRangersInputProps = {
  eventId: string;
  rangers: AttachedRanger[];
  onChange: () => void;
};

const SOURCE_LABELS: Record<Suggestion["source"], string> = {
  known_ranger: "Known Rangers",
  er_subject: "EarthRanger Subjects",
  recent_freetext: "Recent Names",
};

function displayName(ranger: AttachedRanger): string {
  if (ranger.knownRanger?.name != null && ranger.knownRanger.name !== "") return ranger.knownRanger.name;
  if (ranger.registeredUser?.fullName != null && ranger.registeredUser.fullName !== "") return ranger.registeredUser.fullName;
  if (ranger.freetextName != null && ranger.freetextName !== "") return ranger.freetextName;
  return "Unknown";
}

/** Debounce hook — returns the debounced value */
function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => { setDebounced(value); }, delayMs);
    return () => { clearTimeout(id); };
  }, [value, delayMs]);
  return debounced;
}

export function AccompanyingRangersInput({
  eventId,
  rangers,
  onChange,
}: AccompanyingRangersInputProps) {
  // ── combobox state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 250);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestQuery = trpc.event.suggestAccompanyingRangers.useQuery(
    { query: debouncedQuery },
    { enabled: open }
  );

  const addRanger = trpc.event.addAccompanyingRanger.useMutation({
    onSuccess: () => {
      setQuery("");
      setOpen(false);
      onChange();
    },
  });

  const removeRanger = trpc.event.removeAccompanyingRanger.useMutation({
    onSuccess: onChange,
  });

  const promoteMutation = trpc.event.promoteToKnownRanger.useMutation({
    onSuccess: () => { onChange(); },
  });

  // ── close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => { document.removeEventListener("mousedown", handleClick); };
  }, []);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const suggestions: Suggestion[] = suggestQuery.data?.suggestions ?? [];

  // Group suggestions by source (preserve order: known_ranger → er_subject → recent_freetext)
  const grouped = suggestions.reduce<Map<Suggestion["source"], Suggestion[]>>(
    (acc, s) => {
      const arr = acc.get(s.source) ?? [];
      arr.push(s);
      acc.set(s.source, arr);
      return acc;
    },
    new Map()
  );

  const handleSelectSuggestion = useCallback(
    (s: Suggestion) => {
      if (s.source === "known_ranger" && s.id !== null) {
        // Known ranger — link knownRangerId + pass name as freetextName for display fallback
        addRanger.mutate({
          eventId,
          freetextName: s.name,
          knownRangerId: s.id,
        });
      } else {
        // Ad-hoc: freetext path (recent_freetext or er_subject not yet promoted)
        addRanger.mutate({
          eventId,
          freetextName: s.name,
        });
      }
    },
    [addRanger, eventId]
  );

  const handleCommitTyped = () => {
    const trimmed = query.trim();
    if (trimmed === "") return;
    addRanger.mutate({ eventId, freetextName: trimmed });
  };

  // Rangers that were added as freetext (no known link) — eligible for promotion
  const promotableRangers = rangers.filter(
    (r) =>
      r.rangerType === "freetext" &&
      (r.knownRangerId === null || r.knownRangerId === undefined || r.knownRangerId === "") &&
      r.freetextName !== null &&
      r.freetextName !== ""
  );

  const handlePromote = (name: string) => {
    promoteMutation.mutate({ name });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Accompanying Rangers</Label>

      {/* ── attached chips ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 min-h-[2rem]" data-testid="ranger-chips">
        {rangers.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No accompanying rangers added.
          </span>
        )}
        {rangers.map((ranger) => (
          <Badge
            key={ranger.id}
            variant="secondary"
            className="gap-1.5 pr-1"
            data-testid={`ranger-chip-${ranger.id}`}
          >
            <span>{displayName(ranger)}</span>
            <button
              type="button"
              aria-label={`Remove ${displayName(ranger)}`}
              className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
              onClick={() => { removeRanger.mutate({ id: ranger.id }); }}
              disabled={removeRanger.isPending}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* ── combobox picker ────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <Label htmlFor="ranger-combobox" className="text-xs text-muted-foreground">
          Search or type a name to add
        </Label>
        <div className="relative">
          <Input
            id="ranger-combobox"
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => { setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // If there's an exact match in suggestions, select it; otherwise commit typed
                const exact = suggestions.find(
                  (s) => s.name.toLowerCase() === query.trim().toLowerCase()
                );
                if (exact) {
                  handleSelectSuggestion(exact);
                } else {
                  handleCommitTyped();
                }
              }
              if (e.key === "Escape") { setOpen(false); }
            }}
            placeholder="Type a name or search known rangers…"
            autoComplete="off"
            data-testid="ranger-combobox-input"
          />
          <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />

          {/* ── dropdown ─────────────────────────────────────────────────── */}
          {open && (
            <div
              ref={dropdownRef}
              className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md"
              data-testid="ranger-suggestions"
            >
              {suggestQuery.isLoading && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
              )}

              {!suggestQuery.isLoading && suggestions.length === 0 && query.trim() !== "" && (
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-1.5">
                    No matches found for &quot;{query}&quot;
                  </p>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm text-foreground hover:bg-accent rounded px-2 py-1 w-full text-left"
                    onClick={handleCommitTyped}
                    disabled={addRanger.isPending}
                    data-testid="ranger-add-adhoc"
                  >
                    <UserPlus className="h-3.5 w-3.5 shrink-0" />
                    Add &quot;{query.trim()}&quot; as ad-hoc name
                  </button>
                </div>
              )}

              {!suggestQuery.isLoading && suggestions.length === 0 && query.trim() === "" && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Start typing to search known rangers, EarthRanger subjects, and recent names.
                </p>
              )}

              {Array.from(grouped.entries()).map(([source, items]) => (
                <div key={source}>
                  <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {SOURCE_LABELS[source]}
                  </p>
                  {items.map((s) => (
                    <button
                      key={`${s.source}-${s.id ?? s.name}`}
                      type="button"
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-accent"
                      onClick={() => { handleSelectSuggestion(s); }}
                      disabled={addRanger.isPending}
                      data-testid={`ranger-suggestion-${s.source}-${s.id ?? s.name}`}
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 opacity-0" />
                      <span className="flex-1">{s.name}</span>
                      {s.source === "known_ranger" && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {s.erSubjectId != null && s.erSubjectId !== "" ? "ER" : "manual"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}

              {/* Typed value not in suggestions → show quick-add at bottom */}
              {suggestions.length > 0 && query.trim() !== "" &&
                !suggestions.some(
                  (s) => s.name.toLowerCase() === query.trim().toLowerCase()
                ) && (
                  <div className="border-t">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                      onClick={handleCommitTyped}
                      disabled={addRanger.isPending}
                      data-testid="ranger-add-adhoc"
                    >
                      <UserPlus className="h-3.5 w-3.5 shrink-0" />
                      Add &quot;{query.trim()}&quot; as ad-hoc name
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* ── promote-to-known affordance ────────────────────────────────────── */}
      {promotableRangers.length > 0 && (
        <div
          className="rounded-md border border-dashed px-3 py-2 space-y-1.5"
          data-testid="promote-section"
        >
          <p className="text-xs text-muted-foreground font-medium">
            Promote ad-hoc name(s) to the known rangers registry:
          </p>
          {promotableRangers.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">{r.freetextName}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => { handlePromote(r.freetextName ?? ""); }}
                disabled={promoteMutation.isPending}
                data-testid={`promote-btn-${r.id}`}
              >
                <Star className="h-3 w-3 mr-1" />
                Promote
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
