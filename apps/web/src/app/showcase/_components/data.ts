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
    image: "/showcase/warroom.png",
    imageAlt: "Marine Guardian Command Center War Room with live map, event feed and alert panel",
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
    image: "/showcase/map.png",
    imageAlt: "Live map showing patrol coverage zones across a marine protected area",
    accent: "var(--info)",
    icon: MapIcon,
  },
  {
    id: "operations",
    eyebrow: "Event & Patrol Management",
    title: "Turn raw field reports into finished operations",
    body: "A Kanban board moves events New → Active → Resolved with drag-and-drop, and operators fill in the offender, vessel, and action-taken details field patrollers leave blank. Monitor active patrols live and plan assignments on a Gantt timeline.",
    bullets: [
      "Kanban incident board with last-write-wins conflict handling",
      "Patrol monitor: elapsed time, distance covered, and current position",
      "Gantt patrol-area scheduling with drag-and-resize assignment blocks",
    ],
    image: "/showcase/operations.png",
    imageAlt: "Operations dashboard with event feed, KPI cards and active patrols",
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
    image: "/showcase/reports.png",
    imageAlt: "Per-area coverage report with data table",
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
    image: "/showcase/alerts.png",
    imageAlt: "Alert history showing a fired alert rule",
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
    image: "/showcase/municipality.png",
    imageAlt: "Municipality coverage view populated from EarthRanger data",
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
    body: "Acknowledge and escalate alerts, then move events across the Kanban board and complete missing details.",
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
    image: "/showcase/reports.png",
  },
  {
    name: "Patrol-area planning",
    description: "Draw polygon zones on the map to define estimated patrol areas and coverage.",
    icon: Route,
    className: "col-span-3 lg:col-span-1",
  },
  {
    name: "Fuel logging & analytics",
    description: "Any authenticated user logs fuel entries with receipt photos; consumption trends chart over time.",
    icon: Fuel,
    className: "col-span-3 lg:col-span-1",
  },
  {
    name: "Multi-tenant, currency-aware",
    description: "Each MPA site is its own tenant with locale-aware currency formatting (IDR, PHP, MYR) and English/Bahasa.",
    icon: Languages,
    className: "col-span-3 lg:col-span-2",
    image: "/showcase/alert-rule.png",
  },
];

export const MARQUEE_CHIPS = [
  "War Room",
  "Live Map",
  "Patrol Tracks",
  "Event Kanban",
  "Gantt Scheduling",
  "Ranger Performance",
  "PDF & CSV Reports",
  "Alert Rules",
  "EarthRanger Sync",
  "Fuel Analytics",
  "Coverage Heatmaps",
  "Multi-tenant RBAC",
];
