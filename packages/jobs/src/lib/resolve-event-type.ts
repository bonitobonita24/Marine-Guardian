import type { PrismaClient } from "@marine-guardian/db";

export interface ResolvedEventType {
  eventTypeId: string | null;
  /**
   * True when the resolved EventType is a Skylight/analyzer-derived type —
   * `display` contains "skylight" (case-insensitive, same marker used by
   * dashboard.ts / map.ts / reportMap.ts / event.ts) OR `category` is
   * "analyzer_event" (the ER category for automated detections like
   * `entry_alert_rep`). False (and eventTypeId null) when no catalog match
   * exists for this tenant.
   */
  isSkylight: boolean;
}

/**
 * Resolves an ER event's `event_type` value (e.g. "entry_alert_rep") to this
 * tenant's EventType catalog row.
 *
 * Root cause (T2, 2026-07-06): `syncEvents()` in er-sync.processor.ts never
 * looked up an EventType at all — no `eventTypeId` field existed anywhere in
 * its `liveFields`/create payload. Every event synced through the live
 * BullMQ er-sync path therefore landed with `event_type_id = NULL`, and every
 * UI surface fell back to the raw ER `title` for display (e.g. "Marine
 * Entry" for Skylight AOI entry-alert events) even though the `event_types`
 * sync job had already upserted the correct catalog row (value=
 * "entry_alert_rep", display="Skylight Entry Alert", category=
 * "analyzer_event"). The one-off `scripts/ingest-earthranger.mjs` backfill
 * tool DOES resolve event types (see its `ensureEventType`), which is why
 * most historical events already carry a type — only events synced purely
 * through the live processor were affected.
 *
 * This resolver is intentionally generic (matches by tenantId + the ER
 * `event_type` value) so it fixes event-type resolution for every ER event
 * type, not just `entry_alert_rep`.
 */
export async function resolveEventType(
  prisma: PrismaClient,
  tenantId: string,
  erEventType: string | null | undefined,
): Promise<ResolvedEventType> {
  const empty: ResolvedEventType = { eventTypeId: null, isSkylight: false };

  const value = erEventType?.trim();
  if (value == null || value.length === 0) return empty;

  const eventType = await prisma.eventType.findFirst({
    where: { tenantId, value },
    select: { id: true, display: true, category: true },
  });
  if (eventType === null) return empty;

  const isSkylight =
    /skylight/i.test(eventType.display) || eventType.category === "analyzer_event";

  return { eventTypeId: eventType.id, isSkylight };
}
