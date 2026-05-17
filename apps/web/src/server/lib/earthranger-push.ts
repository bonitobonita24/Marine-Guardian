/**
 * Fire-and-forget EarthRanger event update.
 *
 * The local database is the source of truth. ER push is best-effort:
 * if it fails, the local update still succeeded. Callers MUST NOT throw on
 * a non-ok result — log and proceed.
 *
 * Lives in apps/web (not packages/jobs) so the web bundle does not need to
 * pull in BullMQ / Valkey publisher code that the workers depend on.
 */

export type ErPushFields = {
  title?: string;
  priority?: number;
  eventDetails?: Record<string, unknown>;
};

export type ErPushResult =
  | { ok: true }
  | { ok: false; status?: number; error: string };

export type ErPushConfig = {
  baseUrl: string;
  token: string;
  erEventId: string;
  fields: ErPushFields;
};

function toErPayload(fields: ErPushFields): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (fields.title !== undefined) payload.title = fields.title;
  if (fields.priority !== undefined) payload.priority = fields.priority;
  if (fields.eventDetails !== undefined) {
    payload.event_details = fields.eventDetails;
  }
  return payload;
}

export async function pushEventUpdateToEarthRanger(
  config: ErPushConfig,
): Promise<ErPushResult> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1.0/activity/event/${encodeURIComponent(config.erEventId)}`;
  const payload = toErPayload(config.fields);

  if (Object.keys(payload).length === 0) {
    return { ok: true };
  }

  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `EarthRanger PATCH failed: ${String(res.status)} ${res.statusText}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
