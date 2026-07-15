import {
  Radar,
  Map as MapIcon,
  KanbanSquare,
  BarChart3,
  Bell,
  RefreshCw,
  Route,
  Gauge,
  Fuel,
  Languages,
  ShieldCheck,
  Printer,
  Brush,
  type LucideIcon,
} from "lucide-react";

export type Feature = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  image: string;
  imageAlt: string;
  accent: string; // hsl var token name
  icon: LucideIcon;
};

// Every claim below is grounded in docs/PRODUCT.md (Modules + Features / Core
// User Flows). No invented metrics, customer counts, or testimonials.
export const FEATURES: Feature[] = [
  {
    id: "war-room",
    eyebrow: "Command Center War Room",
    title: "Your entire operation on one live screen",
    body: "A 24/7 wall-display command center built for a 100-inch TV. The live map, real-time event feed, and alert panel stream continuously — no clicking required. KPI cards carry trend sparklines so operators read direction at a glance, not just a number.",
    bullets: [
      "Pick any FROM / TO date range — every KPI, map layer, and chart re-queries instantly",
      "Click any KPI, marker, alert, or chart bar to drill into the underlying records",
      "Full-screen tactical theme, live clock, and a sync-health indicator",
    ],
    image: "/showcase/real/command-center-fullscreen.png",
    imageAlt: "Marine Guardian Command Center War Room with a live map of the Mindoro/Palawan MPAs, KPI cards, event feed and alert panel",
    accent: "var(--info)",
    icon: Radar,
  },
  {
    id: "live-map",
    eyebrow: "Live Map",
    title: "Every subject and patrol track, layered in real time",
    body: "A MapLibre GL map renders the whole picture: patrol boats, rangers, and marine subjects as markers, foot and seaborne patrol tracks as polylines, planned patrol-area polygons, and event heatmaps — all toggleable.",
    bullets: [
      "Seaborne patrol tracks drawn in signature cyan; foot patrols in neutral white",
      "Coverage vs planned patrol-area polygons at a glance",
      "Staleness badges flag GPS gaps with a last-known position and timestamp",
    ],
    image: "/showcase/real/live-map.png",
    imageAlt: "Interactive Report Map showing Mindoro and Palawan with patrol tracks, event markers and layer toggles",
    accent: "var(--info)",
    icon: MapIcon,
  },
  {
    id: "doodles",
    eyebrow: "Doodle Annotations",
    title: "Sketch on the map when a marker isn't enough",
    body: "Some things are easier drawn than described. Switch on the Doodle tool right in the Command Center or Report Map controls and draw freehand — a patrol boundary, a suspect route, a stretch of reef. Strokes are pinned to real coordinates, so the sketch stays locked to the geography as you pan and zoom.",
    bullets: [
      "Six preset pen colors plus a custom picker and three thicknesses; undo or clear as you go",
      "Save a sketch with a name — it keeps its exact map framing to reopen the way you left it",
      "Saved doodles are shared across the site in a searchable list; teammates preview them read-only",
    ],
    image: "/showcase/real/doodles.png",
    imageAlt: "Doodle annotation tool active on the Report Map with a freehand patrol boundary sketched in red and the color and thickness toolbar",
    accent: "var(--warning)",
    icon: Brush,
  },
  {
    id: "operations",
    eyebrow: "Event & Patrol Management",
    title: "Turn raw field reports into finished operations",
    body: "An operations list moves events New → Active → Resolved, and operators fill in the offender, vessel, and action-taken details field patrollers leave blank. Filter and search across thousands of events, monitor active patrols live, and plan assignments on a Gantt timeline.",
    bullets: [
      "Filterable, infinite-scroll operations list with per-event state changes and last-write-wins conflict handling",
      "Patrol monitor: elapsed time, distance covered, and current position",
      "Gantt patrol-area scheduling with drag-and-resize assignment blocks",
    ],
    image: "/showcase/real/events-operations.png",
    imageAlt: "Events operations list with per-event state controls, category filters and PDF/CSV export",
    accent: "var(--warning)",
    icon: KanbanSquare,
  },
  {
    id: "reports",
    eyebrow: "Analytics & Reports",
    title: "The monthly report that took days — done in seconds",
    body: "Per-area event breakdowns, foot-vs-seaborne patrol KPIs, and a ranger performance matrix that credits every accompanying ranger, not just the reporter. Export any report to PDF or CSV in one click.",
    bullets: [
      "Law-enforcement and monitoring event categories as breakdown charts",
      "Ranger performance matrix — reported, accompanied, and total credit",
      "Printable report map plus one-click PDF and CSV export",
    ],
    image: "/showcase/real/reports.png",
    imageAlt: "Reports & exports screen listing generated per-area report maps ready to download as PDF, CSV or PowerPoint",
    accent: "var(--success)",
    icon: BarChart3,
  },
  {
    id: "alerts",
    eyebrow: "Alert System & Notifications",
    title: "Nothing critical slips past a shift change",
    body: "Configure alert rules on the event types that matter. Critical events pulse red in the War Room with one-click acknowledge, fire in-app and email escalations to coordinators, and collect in a Notification Center.",
    bullets: [
      "Rule-based alerting on the event types you choose",
      "One-click acknowledge with a full audit trail",
      "In-app + email escalation to Field Coordinators and Site Admins",
    ],
    image: "/showcase/real/alerts.png",
    imageAlt: "Alert Rules screen showing configured rules with triggers, in-app and email channels, and active toggles",
    accent: "var(--destructive)",
    icon: Bell,
  },
  {
    id: "earthranger",
    eyebrow: "EarthRanger Integration",
    title: "Connect once, stay in sync automatically",
    body: "Point Marine Guardian at your EarthRanger server with a URL and API token — stored AES-256-GCM encrypted and never returned to the browser. A scheduled sync pulls subjects, events, and patrols continuously.",
    bullets: [
      "Validated connection with a Connected / Error status badge",
      "Scheduled sync (default 30s) with a per-data-type sync table",
      "Sync-health indicator and a SYNC FAILED banner keep data freshness honest",
    ],
    image: "/showcase/real/earthranger-sync.png",
    imageAlt: "EarthRanger Sync Status screen with a Connected badge and a per-data-type sync table of successful runs",
    accent: "var(--info)",
    icon: RefreshCw,
  },
];

export type Role = {
  name: string;
  can: string;
  icon: LucideIcon;
};

export const ROLES: Role[] = [
  {
    name: "Command Center Operator",
    can: "Monitors the War Room and live map, updates event states, acknowledges and escalates alerts, and logs fuel entries.",
    icon: Radar,
  },
  {
    name: "Field Coordinator",
    can: "Plans patrol areas, schedules rangers on the Gantt, reviews completed patrols, edits event details, and exports reports.",
    icon: Route,
  },
  {
    name: "Site Admin",
    can: "Connects EarthRanger, manages tenant users and alert rules, and performs every Operator and Coordinator action within the site.",
    icon: ShieldCheck,
  },
  {
    name: "Super Admin",
    can: "Creates and manages tenants, assigns Site Admins, monitors platform health, and provides cross-tenant support.",
    icon: Gauge,
  },
];

export type Step = {
  n: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

export const STEPS: Step[] = [
  {
    n: "01",
    title: "Connect EarthRanger",
    body: "Enter your server URL and API token in tenant settings, validate the connection, and enable scheduled sync.",
    icon: RefreshCw,
  },
  {
    n: "02",
    title: "Monitor in the War Room",
    body: "The live map, event feed, and alert panel stream in real time on the command-center display.",
    icon: Radar,
  },
  {
    n: "03",
    title: "Manage incidents",
    body: "Acknowledge and escalate alerts, then move events through the operations list and complete missing details.",
    icon: KanbanSquare,
  },
  {
    n: "04",
    title: "Generate reports",
    body: "Filter by date range and area, review the analytics, and export to PDF or CSV in one click.",
    icon: Printer,
  },
];

export type BentoItem = {
  name: string;
  description: string;
  icon: LucideIcon;
  className: string;
  image?: string;
};

export const BENTO: BentoItem[] = [
  {
    name: "Ranger performance matrix",
    description: "Reported, accompanied, and total-credit columns — every ranger on an event gets equal credit.",
    icon: BarChart3,
    className: "col-span-3 lg:col-span-2",
    image: "/showcase/real/ranger-performance.png",
  },
  {
    name: "Patrol-area planning",
    description: "Draw polygon zones on the map to define estimated patrol areas and coverage.",
    icon: Route,
    className: "col-span-3 lg:col-span-1",
    image: "/showcase/real/patrol-areas.png",
  },
  {
    name: "Fuel logging & analytics",
    description: "Any authenticated user logs fuel entries with receipt photos; consumption trends chart over time.",
    icon: Fuel,
    className: "col-span-3 lg:col-span-1",
    image: "/showcase/real/fuel.png",
  },
  {
    name: "Multi-tenant, currency-aware",
    description: "Each MPA site is its own tenant with locale-aware currency formatting (IDR, PHP, MYR) and English/Bahasa.",
    icon: Languages,
    className: "col-span-3 lg:col-span-2",
    image: "/showcase/real/multi-tenant.png",
  },
];

export const MARQUEE_CHIPS = [
  "War Room",
  "Live Map",
  "Map Doodles",
  "Patrol Tracks",
  "Operations List",
  "Gantt Scheduling",
  "Ranger Performance",
  "PDF & CSV Reports",
  "Alert Rules",
  "EarthRanger Sync",
  "Fuel Analytics",
  "Coverage Heatmaps",
  "Multi-tenant RBAC",
];
