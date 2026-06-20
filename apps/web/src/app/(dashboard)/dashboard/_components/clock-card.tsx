"use client";

import { useEffect, useState } from "react";

/**
 * WAR ROOM live clock + "synced Xs ago" indicator.
 * Conforms to docs/v2/mpa-command-center-v6.jsx top-right clock tile.
 *
 * `lastSyncedAt` is the freshness timestamp of the most recent successful data
 * fetch (passed down from the page, which derives it from query dataUpdatedAt).
 * When omitted, the indicator falls back to mount time.
 */
export function ClockCard({
  lastSyncedAt,
}: {
  lastSyncedAt?: number | undefined;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, []);

  // Render a stable placeholder before hydration to avoid SSR/CSR mismatch.
  const time =
    now === null
      ? "--:--:--"
      : now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
  const date =
    now === null
      ? ""
      : now.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });

  const syncedSecondsAgo =
    now !== null && lastSyncedAt !== undefined
      ? Math.max(0, Math.floor((now.getTime() - lastSyncedAt) / 1000))
      : null;

  return (
    <div className="flex min-w-[7rem] flex-col items-center justify-center rounded-lg border border-border bg-card px-3 py-2">
      <div className="font-semibold tabular-nums text-foreground" aria-label="Current time">
        {time}
      </div>
      {date !== "" && <div className="text-[10px] text-muted-foreground">{date}</div>}
      <div className="mt-1 flex items-center gap-1" role="status" aria-live="off">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]"
          aria-hidden="true"
        />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[hsl(var(--success))]">
          {syncedSecondsAgo === null
            ? "Live"
            : `Synced ${String(syncedSecondsAgo)}s ago`}
        </span>
      </div>
    </div>
  );
}
