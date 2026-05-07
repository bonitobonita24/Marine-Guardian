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
  reported_by?: { name: string } | null;
  time?: string;
  event_type?: string;
  event_details?: Record<string, unknown>;
  notes?: unknown[];
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
}

interface ErObservation {
  id: string;
  location?: { latitude: number; longitude: number } | null;
  recorded_at?: string;
  source?: string;
  additional?: Record<string, unknown>;
}

export class EarthRangerClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}/api/v1.0${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new Error(`EarthRanger API error: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { data?: T } | T;
    if (typeof body === "object" && body !== null && "data" in body) {
      return body.data as T;
    }
    return body as T;
  }

  async getEventTypes(): Promise<ErEventType[]> {
    return this.request<ErEventType[]>("/activity/eventtypes");
  }

  async getSubjects(): Promise<ErSubject[]> {
    return this.request<ErSubject[]>("/subjects");
  }

  async getEvents(since?: string): Promise<ErEvent[]> {
    const qs = since ? `?updated_since=${encodeURIComponent(since)}` : "";
    return this.request<ErEvent[]>(`/activity/events${qs}`);
  }

  async getPatrols(since?: string): Promise<ErPatrol[]> {
    const qs = since ? `?updated_since=${encodeURIComponent(since)}` : "";
    return this.request<ErPatrol[]>(`/activity/patrols${qs}`);
  }

  async getObservations(since?: string): Promise<ErObservation[]> {
    const qs = since ? `?updated_since=${encodeURIComponent(since)}` : "";
    return this.request<ErObservation[]>("/observations" + qs);
  }
}
