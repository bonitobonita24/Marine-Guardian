"use client";

/**
 * RevisionTimeline — edit-history timeline component (q-ops-04).
 *
 * Renders a NEWEST-FIRST list of field-level edits, with the
 * erOriginalSnapshot as the synthetic baseline "first" entry at the bottom.
 *
 * Shared by EventDetailModal (History tab) and PatrolDetailPage (History tab).
 *
 * WCAG 2.2 AA: all interactive elements ≥44×44px; accessible timeline with
 * role="list" + role="listitem"; contrast >= 4.5:1 on all text.
 */

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Editor = {
  id: string;
  fullName: string | null;
  email: string | null;
};

type RevisionEntry = {
  id: string;
  fieldName: string;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: Date | string;
  editor: Editor;
};

type RevisionTimelineProps = {
  revisions: RevisionEntry[];
  erOriginalSnapshot: unknown;
  erSyncedAt: Date | string | null | undefined;
  isLoading?: boolean;
};

function fmt(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString();
}

/** Format a JSON value for display in the before→after diff. */
function formatJsonValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string") return value === "" ? "(cleared)" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // JSON blobs (notes, eventDetails) — show compact JSON, capped at 120 chars
  const str = JSON.stringify(value);
  return str.length > 120 ? str.slice(0, 117) + "…" : str;
}

function editorName(editor: Editor): string {
  return editor.fullName ?? editor.email ?? editor.id.slice(0, 8);
}

function FieldLabel({ name }: { name: string }) {
  // Convert camelCase → readable label
  const readable = name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/Json$/, " (JSON)")
    .trim();
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-foreground">
      {readable}
    </code>
  );
}

export function RevisionTimeline({
  revisions,
  erOriginalSnapshot,
  erSyncedAt,
  isLoading = false,
}: RevisionTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading revision history">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const hasRevisions = revisions.length > 0;
  const hasSnapshot = erOriginalSnapshot !== null && erOriginalSnapshot !== undefined;

  if (!hasRevisions && !hasSnapshot) {
    return (
      <p className="text-sm text-muted-foreground">
        No edits recorded yet. Fields edited in-app will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Showing {revisions.length} edit{revisions.length !== 1 ? "s" : ""} (newest first).
        EarthRanger baseline shown at the bottom.
      </p>

      <ol
        role="list"
        aria-label="Edit history timeline"
        className="space-y-2 border-l-2 border-border pl-4"
      >
        {revisions.map((rev) => (
          <li
            key={rev.id}
            role="listitem"
            className="rounded-md border border-border bg-card p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{editorName(rev.editor)}</span>
                <span className="text-muted-foreground">edited</span>
                <FieldLabel name={rev.fieldName} />
              </div>
              <time
                dateTime={
                  typeof rev.createdAt === "string"
                    ? rev.createdAt
                    : rev.createdAt.toISOString()
                }
                className="shrink-0 text-xs text-muted-foreground"
              >
                {fmt(rev.createdAt)}
              </time>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                  Before
                </p>
                <p className="rounded bg-muted/50 px-2 py-1 font-mono text-foreground break-all">
                  {formatJsonValue(rev.beforeJson)}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                  After
                </p>
                <p className="rounded bg-muted/50 px-2 py-1 font-mono text-foreground break-all">
                  {formatJsonValue(rev.afterJson)}
                </p>
              </div>
            </div>
          </li>
        ))}

        {/* Synthetic baseline — EarthRanger original snapshot */}
        {hasSnapshot && (
          <li
            role="listitem"
            className="rounded-md border border-dashed border-border bg-card/50 p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  EarthRanger baseline
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Original snapshot (immutable)
                </span>
              </div>
              {erSyncedAt !== null && erSyncedAt !== undefined && (
                <time
                  dateTime={
                    typeof erSyncedAt === "string" ? erSyncedAt : erSyncedAt.toISOString()
                  }
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  Synced {fmt(erSyncedAt)}
                </time>
              )}
            </div>
            <div className="mt-2 rounded bg-muted/30 px-2 py-2 font-mono text-[10px] text-muted-foreground break-all max-h-32 overflow-auto">
              {JSON.stringify(erOriginalSnapshot, null, 2)}
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}
