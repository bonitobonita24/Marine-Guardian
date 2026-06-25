interface ErEventType {
  id: string;
  value: string;
  display: string;
  category?: { value: string };
  default_priority?: number;
  icon_id?: string;
  schema?: Record<string, unknown>;
}

interface ErSubject {
  id: string;
  name: string;
  subject_type?: string;
  subject_subtype?: string;
  last_position?: { latitude: number; longitude: number } | null;
  last_position_date?: string | null;
  additional?: Record<string, unknown>;
  subject_group?: string | null;
}

interface ErEvent {
  id: string;
  serial_number?: number | string;
  title?: string;
  priority?: number;
  state?: string;
  location?: { latitude: number; longitude: number } | null;
  reported_by?: { name?: string; email?: string } | null;
  time?: string;
  event_type?: string;
  event_details?: Record<string, unknown>;
  notes?: unknown[];
  end_time?: string | null;
  photos?: unknown[];
}

interface ErPatrol {
  id: string;
  serial_number?: number | string;
  title?: string;
  patrol_type?: string;
  state?: string;
  start_time?: string | null;
  end_time?: string | null;
  patrol_segments?: ErPatrolSegment[];
}

interface ErPatrolSegment {
  id: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  time_range?: { start_time?: string; end_time?: string } | null;
  leader?: { name?: string; id?: string } | null;
  // v2 additive — ER returns GeoJSON Point: { type: "Point", coordinates: [lon, lat] }
  start_location?: { type?: string; coordinates?: [number, number] } | null;
  end_location?: { type?: string; coordinates?: [number, number] } | null;
}

interface ErObservation {
  id: string;
  location?: { latitude: number; longitude: number } | null;
  recorded_at?: string;
  source?: string;
  additional?: Record<string, unknown>;
}

/**
 * EarthRanger track response shape (per /subject/{id}/tracks/).
 * Standard GeoJSON FeatureCollection with LineString features carrying
 * coordinate timestamps in `properties.coordinateProperties.times`.
 *
 * Exported because Phase 8 Batch 5 Sub-batch 5.2a (PatrolTrack materialization)
 * narrows ER's response into the PatrolTrack.trackGeojson Json column and
 * derives pointCount, hasTimestamps, lastTrackTime from feature properties.
 */
export interface ErTrackCoordinate3 {
  0: number;
  1: number;
  2?: number;
  length: 2 | 3;
}

export interface ErTrackFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number] | [number, number, number]>;
  };
  properties: {
    title?: string;
    subject_id?: string;
    coordinateProperties?: {
      times?: string[];
    };
    [key: string]: unknown;
  };
}

export interface ErTrackResponse {
  type: "FeatureCollection";
  features: ErTrackFeature[];
}

export class EarthRangerClient {
  private baseUrl: string;
  private token: string;
  private trackToken: string;

  /**
   * @param baseUrl     EarthRanger site base URL (e.g. https://example.pamdas.org)
   * @param token       DAS API bearer token (events, patrols, subjects, observations)
   * @param trackToken  Optional separate token for the tracks endpoint. Some ER
   *                    deployments issue a dedicated higher-rate-limit token for
   *                    track fetching. Defaults to `token` when omitted —
   *                    backward compatible with all pre-5.2a callers.
   */
  constructor(baseUrl: string, token: string, trackToken?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.trackToken = trackToken ?? token;
  }

  // Per-request network timeout. ER track fetches over wide windows can be
  // slow, but a stalled connection must not hang the caller indefinitely — a
  // single hung patrol would otherwise stall an entire backfill or recurring-
  // sync pass. On timeout, fetch aborts with a TimeoutError, surfaced here as a
  // clear ER error so the caller can count it and move on.
  private static readonly REQUEST_TIMEOUT_MS = 45_000;

  private async request<T>(path: string, bearer?: string): Promise<T> {
    const url = `${this.baseUrl}/api/v1.0${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer ?? this.token}` },
      signal: AbortSignal.timeout(EarthRangerClient.REQUEST_TIMEOUT_MS),
    }).catch((err: unknown) => {
      if (
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err.name === "TimeoutError" || err.name === "AbortError")
      ) {
        throw new Error(
          `EarthRanger API request timed out after ${String(
            EarthRangerClient.REQUEST_TIMEOUT_MS,
          )}ms: ${path}`,
        );
      }
      throw err;
    });
    if (!res.ok) {
      throw new Error(`EarthRanger API error: ${String(res.status)} ${res.statusText}`);
    }
    const raw = (await res.json()) as unknown;
    // EarthRanger (DAS) wraps every response in a `data` envelope; list
    // endpoints wrap a paginated `{ results, count, next, previous }` inside it
    // (e.g. /activity/events, /activity/patrols, /observations). Unwrap `data`
    // first, then extract `results` when present so list callers always receive
    // an array. Mirrors the known-good scripts/ingest-earthranger.mjs
    // (`return j.data || j` then `env.results`).
    let body: unknown = raw;
    if (typeof body === "object" && body !== null && "data" in body) {
      body = body.data;
    }
    if (
      typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      "results" in body &&
      Array.isArray(body.results)
    ) {
      body = body.results;
    }
    return body as T;
  }

  async getEventTypes(): Promise<ErEventType[]> {
    return this.request<ErEventType[]>("/activity/events/eventtypes/");
  }

  async getSubjects(): Promise<ErSubject[]> {
    return this.request<ErSubject[]>("/subjects");
  }

  async getEvents(since?: string): Promise<ErEvent[]> {
    const qs = since !== undefined ? `?updated_since=${encodeURIComponent(since)}` : "";
    return this.request<ErEvent[]>(`/activity/events${qs}`);
  }

  async getPatrols(since?: string): Promise<ErPatrol[]> {
    const qs = since !== undefined ? `?updated_since=${encodeURIComponent(since)}` : "";
    return this.request<ErPatrol[]>(`/activity/patrols${qs}`);
  }

  async getObservations(since?: string): Promise<ErObservation[]> {
    const qs = since !== undefined ? `?updated_since=${encodeURIComponent(since)}` : "";
    return this.request<ErObservation[]>("/observations" + qs);
  }

  /**
   * Fetch the GPS track for a single ER subject between two timestamps.
   *
   * Endpoint: GET /api/v1.0/subject/{subjectId}/tracks/?since=&until=
   * Returns a GeoJSON FeatureCollection of LineString features.
   * Uses `trackToken` from the constructor (falls back to the main token if a
   * dedicated track token was not provided).
   *
   * Consumed by Phase 8 Batch 5 Sub-batch 5.2a — materializePatrolTrack
   * (packages/jobs/src/lib/patrol-track-materialization.ts) — to populate
   * the PatrolTrack.trackGeojson column.
   *
   * @param subjectId  ER subject id (typically from PatrolSegment.leaderErId)
   * @param since      ISO timestamp (inclusive lower bound)
   * @param until      ISO timestamp (inclusive upper bound)
   */
  async fetchSubjectTracks(
    subjectId: string,
    since: string,
    until: string,
  ): Promise<ErTrackResponse> {
    const qs = `?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`;
    return this.request<ErTrackResponse>(
      `/subject/${encodeURIComponent(subjectId)}/tracks/${qs}`,
      this.trackToken,
    );
  }
}
