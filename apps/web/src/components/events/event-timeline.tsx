"use client";

type TimelineEvent = {
  label: string;
  timestamp: Date | string | null | undefined;
};

type EventTimelineProps = {
  createdAt: Date | string;
  syncedAt: Date | string | null | undefined;
  updatedAt: Date | string;
  reportedAt: Date | string | null | undefined;
};

function fmt(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString();
}

export function EventTimeline({
  createdAt,
  syncedAt,
  updatedAt,
  reportedAt,
}: EventTimelineProps) {
  const entries: TimelineEvent[] = [
    { label: "Reported", timestamp: reportedAt },
    { label: "Synced from EarthRanger", timestamp: syncedAt },
    { label: "Created in Marine Guardian", timestamp: createdAt },
    { label: "Last edited", timestamp: updatedAt },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">Timeline</h3>
      <ol className="space-y-1.5 border-l-2 border-border pl-4">
        {entries.map((entry) => (
          <li key={entry.label} className="text-xs">
            <span className="font-medium text-foreground">{entry.label}: </span>
            <span className="text-muted-foreground">{fmt(entry.timestamp)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
