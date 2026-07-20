import {
  Layers,
  ShieldCheck,
  RefreshCw,
  Radar,
  Map as MapIcon,
  KanbanSquare,
  Landmark,
  CalendarRange,
  Fuel,
  Printer,
  Images,
  BookOpen,
  UserCheck,
  Fish,
  ClipboardList,
  Gavel,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------------- */
/*  TIMELINE ANCHORING — the one-line flip                                    */
/* ------------------------------------------------------------------------- */

/**
 * How each milestone on /showcase/timeline is labelled.
 *
 *   "phases"     (DEFAULT) — labels each milestone with its development phase
 *                ("Foundation", "Core Operations", …). No calendar dates are
 *                claimed anywhere on the page.
 *
 *   "dates-feb"  — labels each milestone with a calendar month, anchored so the
 *                timeline opens at February 2026.
 *                NOTE: the repository's first commit is 2026-04-30. This option
 *                therefore presents a development start ~3 months EARLIER than
 *                the git history shows. Both modes render correctly; this is a
 *                presentation choice, not a data change.
 *
 * Flip this single value to switch the whole page between the two modes.
 */
export const TIMELINE_MODE: "phases" | "dates-feb" = "phases";

/** The five development phases, in order, used by TIMELINE_MODE === "phases". */
export const PHASES = [
  "Foundation",
  "Core Operations",
  "Intelligence & Reporting",
  "Field Deployment",
  "Continuous Hardening",
] as const;

export type Phase = (typeof PHASES)[number];

export type Milestone = {
  id: string;
  /** Phase label — shown when TIMELINE_MODE === "phases". */
  phase: Phase;
  /** Month label — shown when TIMELINE_MODE === "dates-feb". */
  monthLabel: string;
  title: string;
  body: string;
  highlights: string[];
  /** Optional real product screenshot. */
  image?: string;
  imageAlt?: string;
  icon: LucideIcon;
};

/**
 * Milestones are derived from the repository's own history — `git log`,
 * docs/CHANGELOG_AI.md and docs/DECISIONS_LOG.md. Every capability listed below
 * is shipped and running; nothing here is aspirational. Planned work lives in
 * NEXT_FEATURES and is labelled as such.
 */
export const MILESTONES: Milestone[] = [
  {
    id: "multi-tenant-foundation",
    phase: "Foundation",
    monthLabel: "February 2026",
    title: "Multi-tenant foundation",
    body: "The platform starts as a tenant-isolated monorepo: a shared-schema Postgres model with a tenant_id on every row, a typed tRPC API, and a Docker-first environment that runs the whole stack with one command.",
    highlights: [
      "Shared-schema multi-tenancy with row-level tenant scoping",
      "TypeScript strict end to end — web, jobs and shared packages",
      "Compose-first local environment, AWS-ready deployment path",
    ],
    image: "/showcase/real/multi-tenant.png",
    imageAlt:
      "Marine Guardian tenant administration screen listing isolated tenant organisations",
    icon: Layers,
  },
  {
    id: "rbac",
    phase: "Foundation",
    monthLabel: "February 2026",
    title: "Three-tier roles & permissions",
    body: "Access is scoped from the platform down to the individual seat. A tenant manager operates across organisations; each tenant has exactly one owner, enforced in the database itself; day-to-day admins sit below that, and field roles below them.",
    highlights: [
      "tenant_manager · tenant_superadmin · tenant_admin, plus field roles",
      "One owner per tenant, guaranteed by a partial unique index",
      "Permission matrix enforced at the API, the route and the navigation",
    ],
    image: "/showcase/timeline/rbac-users.png",
    imageAlt:
      "Marine Guardian user management table showing accounts with their assigned tenant roles",
    icon: ShieldCheck,
  },
  {
    id: "earthranger-sync",
    phase: "Core Operations",
    monthLabel: "March 2026",
    title: "EarthRanger harvest & sync",
    body: "Marine Guardian connects to an EarthRanger server and continuously harvests the field record — events, patrols, subjects, tracks and reported details — into its own schema, where it can be reported on, corrected and enriched.",
    highlights: [
      "Recurring incremental sync with per-tenant connection settings",
      "Events, patrols, subjects, patrol tracks and photo attachments",
      "A sync-health surface that shows exactly what last landed, and when",
    ],
    image: "/showcase/timeline/earthranger-sync.png",
    imageAlt:
      "Marine Guardian sync status page showing recent EarthRanger harvest runs and their outcomes",
    icon: RefreshCw,
  },
  {
    id: "command-center",
    phase: "Core Operations",
    monthLabel: "March 2026",
    title: "Command Center war room",
    body: "A continuously streaming operations screen built for a wall display: a live map, a real-time event feed, an alert panel, and KPI cards with trend sparklines that read direction at a glance rather than a bare number.",
    highlights: [
      "Any FROM/TO range re-queries every KPI, layer and chart instantly",
      "Click a KPI, marker, alert or bar to drill straight into the records",
      "Full-screen tactical theme with a live clock and sync indicator",
    ],
    image: "/showcase/timeline/command-center.png",
    imageAlt:
      "Marine Guardian Command Center war room with a live map, KPI cards, event feed and alert panel",
    icon: Radar,
  },
  {
    id: "report-map",
    phase: "Core Operations",
    monthLabel: "April 2026",
    title: "Interactive report map",
    body: "Every patrol track, event and boundary rendered on one map, with heatmaps, per-category breakdown tiles and layer toggles for seaborne versus foot patrols — the surface most of the reporting work is now driven from.",
    highlights: [
      "Patrol tracks as polylines, events as clustered geo-anchored markers",
      "Track heatmaps, photo thumbnails and per-zone traversal accounting",
      "Floating chart panels and a one-click Generate Printable hand-off",
    ],
    image: "/showcase/timeline/report-map.png",
    imageAlt:
      "Marine Guardian interactive report map showing patrol tracks and event markers across Mindoro and Palawan with map control and breakdown panels",
    icon: MapIcon,
  },
  {
    id: "events",
    phase: "Intelligence & Reporting",
    monthLabel: "April 2026",
    title: "Events management",
    body: "The incident record becomes workable: a filterable register with per-subcategory selection, a kanban board for state transitions, a detail modal with accompanying rangers and photo evidence, and write-back to EarthRanger.",
    highlights: [
      "Individually selectable subcategory filters, date and area sorting",
      "Drag-and-drop state transitions with optimistic updates",
      "Per-field editable EarthRanger detail with manual-edit protection",
    ],
    image: "/showcase/timeline/events.png",
    imageAlt:
      "Marine Guardian events register listing marine incidents with type, location and status filters",
    icon: KanbanSquare,
  },
  {
    id: "boundaries",
    phase: "Intelligence & Reporting",
    monthLabel: "May 2026",
    title: "Boundaries & municipal attribution",
    body: "Uploaded boundaries become the authoritative geography. Municipal waters are partitioned by an equidistance median line, and every patrol and event is attributed by pure geometric containment — never by a guess at the nearest place.",
    highlights: [
      "Draw or upload boundaries; a map editor replaces raw GeoJSON",
      "Generic boundary hierarchy — province, municipality, MPA zone",
      "Containment-only attribution; out-of-bounds stays honestly unattributed",
    ],
    image: "/showcase/timeline/boundaries.png",
    imageAlt:
      "Marine Guardian boundaries administration screen listing protected zones and municipal water boundaries",
    icon: Landmark,
  },
  {
    id: "patrol-schedule",
    phase: "Field Deployment",
    monthLabel: "May 2026",
    title: "Patrol scheduling",
    body: "Planning gets four views of the same assignments — calendar, kanban, map and gantt — so a coordinator can roster by date, by state, by geography or by duration without leaving the screen.",
    highlights: [
      "Calendar, Kanban, Map and Gantt views over one assignment model",
      "Bi-weekly and monthly ranges with ranger-name autocomplete",
      "Coordinator-scoped permissions on every assignment mutation",
    ],
    image: "/showcase/timeline/patrol-schedule.png",
    imageAlt:
      "Marine Guardian patrol schedule calendar showing ranger assignments across July with Calendar, Kanban, Map and Gantt view tabs",
    icon: CalendarRange,
  },
  {
    id: "fuel",
    phase: "Field Deployment",
    monthLabel: "June 2026",
    title: "Fuel logging",
    body: "Bulk fuel allocation is tracked end to end: a chronological ledger with area and date filters, role-scoped create, edit and delete, and a consumption analytics panel that trends usage across patrol areas.",
    highlights: [
      "Fuel entry CRUD scoped by role — operator, coordinator, site admin",
      "Consumption KPIs, trend chart and per-area breakdown",
      "Fuel consumption folded into the printable report suite",
    ],
    image: "/showcase/timeline/fuel.png",
    imageAlt:
      "Marine Guardian fuel logging page with consumption analytics and a chronological fuel entry table",
    icon: Fuel,
  },
  {
    id: "reports",
    phase: "Field Deployment",
    monthLabel: "June 2026",
    title: "Printable report suite",
    body: "The reports that used to take days become a checklist and a button. Template-driven LGU headers and footers, per-area and per-zone scoping, chart and map pages, and an event-highlights photo report — rendered to PDF by a dedicated worker.",
    highlights: [
      "Report-type checklist — summary, detailed, per-area, event highlights",
      "Admin-managed templates with LGU header, footer and layout",
      "Dedicated render worker; exports delivered without blocking the app",
    ],
    image: "/showcase/real/reports.png",
    imageAlt:
      "A generated Marine Guardian printable PDF report page showing charts, tables and an LGU header",
    icon: Printer,
  },
  {
    id: "media",
    phase: "Continuous Hardening",
    monthLabel: "July 2026",
    title: "Telegram-backed media",
    body: "Photo evidence moves to a private Telegram channel as the persistent media backend, with a ledger row mapping every stored key back to its message — keeping object storage for temporary and index files.",
    highlights: [
      "Storage adapter selected by a single environment variable",
      "Media ledger resolves every key; galleries and report photos read through it",
      "Object storage retained for ephemeral exports and scratch files",
    ],
    icon: Images,
  },
  {
    id: "showcase-docs",
    phase: "Continuous Hardening",
    monthLabel: "July 2026",
    title: "Showcase & documentation site",
    body: "The product learns to explain itself: a public marketing showcase, an in-app documentation site, and a WYSIWYG CMS in the admin dashboard so the copy and images can be edited live, in the browser, without a deploy.",
    highlights: [
      "Public /showcase and /docs, both rendered from the database",
      "Admin CMS editors with markdown round-trip and image upload",
      "Literal fallbacks everywhere — an empty CMS still renders the page",
    ],
    image: "/showcase/timeline/docs-cms.png",
    imageAlt:
      "The Marine Guardian in-app documentation site with its section sidebar and article content",
    icon: BookOpen,
  },
  {
    id: "attribution-overrides",
    phase: "Continuous Hardening",
    monthLabel: "July 2026",
    title: "Officer-controlled attribution",
    body: "The newest layer hands judgement back to the officer. Municipality and patrol times can be overridden by hand, every value carries its provenance, and review filters surface exactly the records a human still needs to look at.",
    highlights: [
      "Manual municipality and start/end time overrides, safe from sync clobber",
      "Provenance recorded inseparably alongside every attributed value",
      "“Unattributed only” and heuristic-review filters as work queues",
    ],
    image: "/showcase/timeline/patrols-attribution.png",
    imageAlt:
      "Marine Guardian patrols register showing municipality attribution with review and unattributed-only filters",
    icon: UserCheck,
  },
];

/* ------------------------------------------------------------------------- */
/*  WHAT'S NEXT — planned, not shipped                                        */
/* ------------------------------------------------------------------------- */

export type NextFeature = {
  id: string;
  /** Short status chip. Fuel is deliberately marked as already partly shipped. */
  status: "Planned" | "Shipped · expanding";
  title: string;
  /** What it is. */
  what: string;
  /** Why it exists. */
  purpose: string;
  /** Who uses it. */
  who: string;
  image: string;
  imageAlt: string;
  icon: LucideIcon;
};

export const NEXT_FEATURES: NextFeature[] = [
  {
    id: "fish-catch",
    status: "Planned",
    title: "Fish Catch Logging & Monitoring",
    what: "A catch register for landed fish — volume, species, gear and landing site — with trend monitoring and catch-per-unit-effort tracking over time.",
    purpose:
      "To turn scattered landing records into a fisheries trend line, so pressure on a stock and the effect of protection measures can be read from data instead of anecdote.",
    who: "Landing-site enumerators and fisherfolk record the catch; MPA managers and marine scientists read the trends.",
    image: "/showcase/timeline/next/catch.png",
    imageAlt:
      "Concept mockup of the planned Fish Catch Logging screen with catch volume KPIs, a monthly trend chart, a top-species table and a recent landings list",
    icon: Fish,
  },
  {
    id: "project-management",
    status: "Planned",
    title: "Project Management & Calendar of Activities",
    what: "A shared workspace for activities, plans, targets, deadlines and todos — an activity board, a calendar of activities, and per-person task lists across every team.",
    purpose:
      "To be the consolidation hub: the place where every other module's output is gathered into one organisation-wide view of what is planned, what is due and what is done.",
    who: "All Blue Alliance staff — every division, from field operations and outreach to finance and training.",
    image: "/showcase/timeline/next/project-management.png",
    imageAlt:
      "Concept mockup of the planned Project Management screen with an activity kanban board, project KPIs and a consolidated reporting feed",
    icon: ClipboardList,
  },
  {
    id: "fuel-expanded",
    status: "Shipped · expanding",
    title: "Fuel Logging — deeper efficiency",
    what: "Fuel logging already ships: allocation entries, area and date filters, role-scoped editing, consumption analytics and a fuel page in the printable report. The next step attributes fuel per boat and ties it to coverage.",
    purpose:
      "To move from “how much fuel was issued” to “what did that fuel buy” — cost per kilometre covered and per patrol hour, with alerts as a budget is drawn down.",
    who: "Logistics officers log and reconcile; coordinators and finance read the efficiency and budget view.",
    image: "/showcase/timeline/next/fuel-expanded.png",
    imageAlt:
      "Concept mockup of the expanded Fuel Logging screen showing consumption against patrol coverage, per-area breakdown and a fuel ledger marking shipped and planned columns",
    icon: Fuel,
  },
  {
    id: "follow-up-ops",
    status: "Planned",
    title: "Follow-Up Ops",
    what: "A case ledger under Events operations that tracks incidents turned over to third-party law enforcement — LGU, Maritime, BFAR — from the moment of hand-off through to resolution.",
    purpose:
      "To close the loop on enforcement. Today an escalated event leaves the system and its outcome is lost; this tracks each case to a recorded result and measures partner responsiveness.",
    who: "Enforcement coordinators file and chase cases; managers and partner agencies read the outcomes.",
    image: "/showcase/timeline/next/follow-up-ops.png",
    imageAlt:
      "Concept mockup of the planned Follow-Up Ops screen showing a case ledger of turned-over incidents, a per-case resolution timeline and a partner responsiveness table",
    icon: Gavel,
  },
];
