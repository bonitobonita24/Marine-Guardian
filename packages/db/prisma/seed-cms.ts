/**
 * seed-cms.ts
 *
 * Imports the current filesystem-backed content into the CMS models
 * (DocPage / ShowcaseField) added in migration `add_cms_content_models`
 * (docs/CMS_BUILD_PLAN.md — W2). This is a one-time backfill so the DB holds
 * an exact copy of what `apps/web/content/docs/**\/*.mdx` + the `/showcase`
 * text literals already render — W4/W5 then switch the *read* path from the
 * filesystem to these tables (this seed does not change any read path).
 *
 * DocPage slug derivation is copied 1:1 from
 * `apps/web/src/lib/docs/source.ts` (the docs-tree derivation authority) so
 * a DB slug always equals the current URL slug:
 *   - `content/docs/index.mdx`                 → slug "index"      (root page; kind folderIndex)
 *   - `content/docs/<folder>/index.mdx`        → slug "<folder>"   (folder's OWN slug, NOT "<folder>/index"; kind folderIndex)
 *   - `content/docs/<folder>/<page>.mdx`       → slug "<folder>/<page>" (kind page)
 * `orderInParent` is the position of the file's basename (no `.mdx`) in the
 * owning directory's `meta.json` `pages` array; names not listed there sort
 * alphabetically after the listed ones (mirrors source.ts's `orderer()`).
 *
 * ShowcaseField values are transcribed from the current literals in
 * `apps/web/src/app/showcase/_components/{hero,sections,data}.tsx` (text
 * only — layout/icons/images/animation stay in code). Keys are stable dotted
 * ids; see the KEY SCHEME comment block below for the full list — W5 reads
 * these keys back in with a fallback to the current literal.
 *
 * Idempotent: every write is an upsert keyed on `slug` / `key`. Called from
 * seed.ts (same pattern as seedMunicipalities) so `pnpm db:seed` runs it.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import type { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve from packages/db/prisma/ → monorepo root → apps/web/content/docs
// (same three-levels-up pattern as seed-municipalities.ts's COVERAGE_DIR).
const DOCS_ROOT = resolve(__dirname, "../../../apps/web/content/docs");

interface DocsMeta {
  title?: string;
  pages?: string[];
}

function readMeta(dir: string): DocsMeta {
  const metaPath = join(dir, "meta.json");
  if (!existsSync(metaPath)) return {};
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as DocsMeta;
  } catch {
    return {};
  }
}

/** Order rank matching source.ts's orderer(): listed names first (in meta
 * order), unlisted names appended alphabetically after. */
function orderRank(names: string[], listed: string[]): Map<string, number> {
  const rank = new Map<string, number>(listed.map((name, i) => [name, i]));
  const unlisted = names.filter((n) => !rank.has(n)).sort((a, b) => a.localeCompare(b));
  let next = listed.length;
  for (const name of unlisted) {
    if (!rank.has(name)) rank.set(name, next++);
  }
  return rank;
}

interface DocRow {
  slug: string;
  parentSlug: string | null;
  kind: "page" | "folderIndex";
  title: string;
  description: string | undefined;
  orderInParent: number;
  bodyMarkdown: string;
}

function readFrontmatter(filePath: string): { title: string; description: string | undefined; body: string } {
  const raw = readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const fm = data as { title?: unknown; description?: unknown };
  return {
    title: typeof fm.title === "string" ? fm.title : basename(filePath, ".mdx"),
    description: typeof fm.description === "string" ? fm.description : undefined,
    body: content,
  };
}

function collectDocRows(): DocRow[] {
  const rows: DocRow[] = [];
  if (!existsSync(DOCS_ROOT)) return rows;

  // ── Root index.mdx → slug "index" (special-cased per source.ts: the root
  // page is excluded from buildTree's own children list but IS the /docs page).
  const rootIndexPath = join(DOCS_ROOT, "index.mdx");
  if (existsSync(rootIndexPath) && statSync(rootIndexPath).isFile()) {
    const fm = readFrontmatter(rootIndexPath);
    const rootMeta = readMeta(DOCS_ROOT);
    const rootRank = orderRank(["index"], rootMeta.pages ?? []);
    rows.push({
      slug: "index",
      parentSlug: null,
      kind: "folderIndex",
      title: fm.title,
      description: fm.description,
      orderInParent: rootRank.get("index") ?? 0,
      bodyMarkdown: fm.body,
    });
  }

  const rootMeta = readMeta(DOCS_ROOT);
  const entries = readdirSync(DOCS_ROOT, { withFileTypes: true });
  const folderNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const rootPageNames = entries
    .filter((e) => e.isFile() && e.name.endsWith(".mdx") && e.name !== "index.mdx")
    .map((e) => e.name.replace(/\.mdx$/, ""));
  const topLevelRank = orderRank([...folderNames, ...rootPageNames], rootMeta.pages ?? []);

  // ── Top-level pages directly under content/docs (none today, but handled
  // for completeness — mirrors source.ts's buildTree pageNames branch).
  for (const name of rootPageNames) {
    const filePath = join(DOCS_ROOT, `${name}.mdx`);
    const fm = readFrontmatter(filePath);
    rows.push({
      slug: name,
      parentSlug: "index",
      kind: "page",
      title: fm.title,
      description: fm.description,
      orderInParent: topLevelRank.get(name) ?? 0,
      bodyMarkdown: fm.body,
    });
  }

  // ── Folders directly under content/docs (command-center/, doodles/, …).
  for (const folderName of folderNames) {
    const folderDir = join(DOCS_ROOT, folderName);
    const folderMeta = readMeta(folderDir);
    const folderIndexPath = join(folderDir, "index.mdx");
    const hasIndex = existsSync(folderIndexPath) && statSync(folderIndexPath).isFile();

    if (hasIndex) {
      const fm = readFrontmatter(folderIndexPath);
      rows.push({
        slug: folderName,
        parentSlug: "index",
        kind: "folderIndex",
        title: fm.title,
        description: fm.description,
        orderInParent: topLevelRank.get(folderName) ?? 0,
        bodyMarkdown: fm.body,
      });
    }

    const folderEntries = readdirSync(folderDir, { withFileTypes: true });
    const folderPageNames = folderEntries
      .filter((e) => e.isFile() && e.name.endsWith(".mdx") && e.name !== "index.mdx")
      .map((e) => e.name.replace(/\.mdx$/, ""));
    // No sub-folders exist under a docs folder today (2-level tree); if one
    // ever appears it is silently skipped here — source.ts's recursive
    // buildTree would need the same recursion added to stay in sync.
    const folderRank = orderRank(folderPageNames, folderMeta.pages ?? []);

    for (const name of folderPageNames) {
      const filePath = join(folderDir, `${name}.mdx`);
      const fm = readFrontmatter(filePath);
      rows.push({
        slug: `${folderName}/${name}`,
        parentSlug: folderName,
        kind: "page",
        title: fm.title,
        description: fm.description,
        orderInParent: folderRank.get(name) ?? 0,
        bodyMarkdown: fm.body,
      });
    }
  }

  return rows;
}

// ─── Showcase text literals ─────────────────────────────────────────────────
// Transcribed from apps/web/src/app/showcase/_components/{hero,sections,data}.tsx
// (2026-07-15). KEY SCHEME:
//   hero.*            — hero.tsx eyebrow/headline/subcopy/CTA labels
//   problem.*          — sections.tsx ProblemSection intro
//   problem.<pain-id>.title|body        — the 3 PAINS cards
//   features.*         — sections.tsx FeatureSections intro
//   feature.<id>.eyebrow|title|body|bullets(json) — data.ts FEATURES (7)
//   bento.*             — sections.tsx BentoSection intro
//   bento.<slug>.name|description        — data.ts BENTO (4)
//   steps.*             — sections.tsx HowItWorks intro
//   step.<n>.title|body                  — data.ts STEPS (4, n = "01".."04")
//   roles.*             — sections.tsx RolesSection intro
//   role.<slug>.name|can                 — data.ts ROLES (4)
//   cta.*               — sections.tsx ClosingCTA
interface FieldRow {
  key: string;
  value: string;
}
interface FieldJsonRow {
  key: string;
  valueJson: unknown;
}

const SHOWCASE_TEXT_FIELDS: FieldRow[] = [
  // hero.tsx
  { key: "hero.eyebrow", value: "Marine Protected Area Operations Intelligence" },
  { key: "hero.headline", value: "Marine Guardian" },
  { key: "hero.headlineAccent", value: "Command Center" },
  {
    key: "hero.subcopy",
    value:
      "Real-time operations intelligence for marine protected areas. EarthRanger collects the field data — Marine Guardian turns it into a live command center for monitoring, incident escalation, patrol planning, and the reports that used to take days.",
  },
  { key: "hero.ctaPrimaryLabel", value: "See it in action" },
  { key: "hero.ctaSecondaryLabel", value: "Request a demo" },

  // sections.tsx — ProblemSection
  { key: "problem.eyebrow", value: "The reporting gap" },
  { key: "problem.title", value: "EarthRanger captures the field. Nothing turns it into command." },
  {
    key: "problem.body",
    value:
      "EarthRanger is an excellent field data collection platform — but it has no reporting, no charts for events or patrols, no cross-area analytics within a site, and no configurable alerting. So managers hand-build stale monthly PDFs, with no unified view for real-time monitoring, escalation, or patrol planning.",
  },
  { key: "problem.reports-by-hand.title", value: "Reports built by hand" },
  {
    key: "problem.reports-by-hand.body",
    value:
      "Per-area breakdowns, patrol stats, and ranger matrices assembled manually as static monthly PDFs — tedious and error-prone.",
  },
  { key: "problem.insights-stale.title", value: "Insights arrive stale" },
  {
    key: "problem.insights-stale.body",
    value: "By the time a monthly report is finished, the data it describes is weeks old. Decisions run on yesterday's picture.",
  },
  { key: "problem.no-realtime-alerting.title", value: "No real-time view or alerting" },
  {
    key: "problem.no-realtime-alerting.body",
    value:
      "EarthRanger collects field data but offers no charts, no cross-area analytics, and no configurable alerting or command center.",
  },

  // sections.tsx — FeatureSections intro
  { key: "features.eyebrow", value: "One platform, every layer of the operation" },
  { key: "features.title", value: "From live map to finished report" },

  // data.ts — FEATURES (7)
  { key: "feature.war-room.eyebrow", value: "Command Center War Room" },
  { key: "feature.war-room.title", value: "Your entire operation on one live screen" },
  {
    key: "feature.war-room.body",
    value:
      "A 24/7 wall-display command center built for a 100-inch TV. The live map, real-time event feed, and alert panel stream continuously — no clicking required. KPI cards carry trend sparklines so operators read direction at a glance, not just a number.",
  },
  { key: "feature.live-map.eyebrow", value: "Live Map" },
  { key: "feature.live-map.title", value: "Every subject and patrol track, layered in real time" },
  {
    key: "feature.live-map.body",
    value:
      "A MapLibre GL map renders the whole picture: patrol boats, rangers, and marine subjects as markers, foot and seaborne patrol tracks as polylines, planned patrol-area polygons, and event heatmaps — all toggleable.",
  },
  { key: "feature.doodles.eyebrow", value: "Doodle Annotations" },
  { key: "feature.doodles.title", value: "Sketch on the map when a marker isn't enough" },
  {
    key: "feature.doodles.body",
    value:
      "Some things are easier drawn than described. Switch on the Doodle tool right in the Command Center or Report Map controls and draw freehand — a patrol boundary, a suspect route, a stretch of reef. Strokes are pinned to real coordinates, so the sketch stays locked to the geography as you pan and zoom.",
  },
  { key: "feature.operations.eyebrow", value: "Event & Patrol Management" },
  { key: "feature.operations.title", value: "Turn raw field reports into finished operations" },
  {
    key: "feature.operations.body",
    value:
      "An operations list moves events New → Active → Resolved, and operators fill in the offender, vessel, and action-taken details field patrollers leave blank. Filter and search across thousands of events, monitor active patrols live, and plan assignments on a Gantt timeline.",
  },
  { key: "feature.reports.eyebrow", value: "Analytics & Reports" },
  { key: "feature.reports.title", value: "The monthly report that took days — done in seconds" },
  {
    key: "feature.reports.body",
    value:
      "Per-area event breakdowns, foot-vs-seaborne patrol KPIs, and a ranger performance matrix that credits every accompanying ranger, not just the reporter. Export any report to PDF or CSV in one click.",
  },
  { key: "feature.alerts.eyebrow", value: "Alert System & Notifications" },
  { key: "feature.alerts.title", value: "Nothing critical slips past a shift change" },
  {
    key: "feature.alerts.body",
    value:
      "Configure alert rules on the event types that matter. Critical events pulse red in the War Room with one-click acknowledge, fire in-app and email escalations to coordinators, and collect in a Notification Center.",
  },
  { key: "feature.earthranger.eyebrow", value: "EarthRanger Integration" },
  { key: "feature.earthranger.title", value: "Connect once, stay in sync automatically" },
  {
    key: "feature.earthranger.body",
    value:
      "Point Marine Guardian at your EarthRanger server with a URL and API token — stored AES-256-GCM encrypted and never returned to the browser. A scheduled sync pulls subjects, events, and patrols continuously.",
  },

  // sections.tsx — BentoSection intro
  { key: "bento.eyebrow", value: "And there is more under the hood" },
  { key: "bento.title", value: "Built for how MPA teams actually work" },

  // data.ts — BENTO (4)
  { key: "bento.ranger-performance-matrix.name", value: "Ranger performance matrix" },
  {
    key: "bento.ranger-performance-matrix.description",
    value: "Reported, accompanied, and total-credit columns — every ranger on an event gets equal credit.",
  },
  { key: "bento.patrol-area-planning.name", value: "Patrol-area planning" },
  {
    key: "bento.patrol-area-planning.description",
    value: "Draw polygon zones on the map to define estimated patrol areas and coverage.",
  },
  { key: "bento.fuel-logging-analytics.name", value: "Fuel logging & analytics" },
  {
    key: "bento.fuel-logging-analytics.description",
    value: "Any authenticated user logs fuel entries with receipt photos; consumption trends chart over time.",
  },
  { key: "bento.multi-tenant-currency-aware.name", value: "Multi-tenant and language-aware (translation)" },
  {
    key: "bento.multi-tenant-currency-aware.description",
    value: "Each MPA site is its own tenant with locale-aware currency formatting (IDR, PHP, MYR) and English/Bahasa.",
  },

  // sections.tsx — HowItWorks intro
  { key: "steps.eyebrow", value: "How it works" },
  { key: "steps.title", value: "From connection to command in four steps" },

  // data.ts — STEPS (4)
  { key: "step.01.title", value: "Connect EarthRanger" },
  {
    key: "step.01.body",
    value: "Enter your server URL and API token in tenant settings, validate the connection, and enable scheduled sync.",
  },
  { key: "step.02.title", value: "Monitor in the War Room" },
  {
    key: "step.02.body",
    value: "The live map, event feed, and alert panel stream in real time on the command-center display.",
  },
  { key: "step.03.title", value: "Manage incidents" },
  {
    key: "step.03.body",
    value: "Acknowledge and escalate alerts, then move events through the operations list and complete missing details.",
  },
  { key: "step.04.title", value: "Generate reports" },
  {
    key: "step.04.body",
    value: "Filter by date range and area, review the analytics, and export to PDF or CSV in one click.",
  },

  // sections.tsx — RolesSection intro
  { key: "roles.eyebrow", value: "Roles & permissions" },
  { key: "roles.title", value: "The right access for every seat" },
  { key: "roles.subcopy", value: "Scoped, tenant-isolated roles from the command floor to the platform." },

  // data.ts — ROLES (4)
  { key: "role.command-center-operator.name", value: "Command Center Operator" },
  {
    key: "role.command-center-operator.can",
    value: "Monitors the War Room and live map, updates event states, acknowledges and escalates alerts, and logs fuel entries.",
  },
  { key: "role.field-coordinator.name", value: "Field Coordinator" },
  {
    key: "role.field-coordinator.can",
    value: "Plans patrol areas, schedules rangers on the Gantt, reviews completed patrols, edits event details, and exports reports.",
  },
  { key: "role.site-admin.name", value: "Site Admin" },
  {
    key: "role.site-admin.can",
    value: "Connects EarthRanger, manages tenant users and alert rules, and performs every Operator and Coordinator action within the site.",
  },
  { key: "role.super-admin.name", value: "Super Admin" },
  {
    key: "role.super-admin.can",
    value: "Creates and manages tenants, assigns Site Admins, monitors platform health, and provides cross-tenant support.",
  },

  // sections.tsx — ClosingCTA
  { key: "cta.title", value: "Bring your marine protected area into one command center" },
  {
    key: "cta.body",
    value: "Connect EarthRanger, watch the War Room come alive, and export the report that used to take days — in seconds.",
  },
  { key: "cta.primaryLabel", value: "Request a demo" },
  { key: "cta.secondaryLabel", value: "Explore the features" },
];

const SHOWCASE_JSON_FIELDS: FieldJsonRow[] = [
  {
    key: "feature.war-room.bullets",
    valueJson: [
      "Pick any FROM / TO date range — every KPI, map layer, and chart re-queries instantly",
      "Click any KPI, marker, alert, or chart bar to drill into the underlying records",
      "Full-screen tactical theme, live clock, and a sync-health indicator",
    ],
  },
  {
    key: "feature.live-map.bullets",
    valueJson: [
      "Seaborne patrol tracks drawn in signature cyan; foot patrols in neutral white",
      "Coverage vs planned patrol-area polygons at a glance",
      "Staleness badges flag GPS gaps with a last-known position and timestamp",
    ],
  },
  {
    key: "feature.doodles.bullets",
    valueJson: [
      "Six preset pen colors plus a custom picker and three thicknesses; undo or clear as you go",
      "Save a sketch with a name — it keeps its exact map framing to reopen the way you left it",
      "Saved doodles are shared across the site in a searchable list; teammates preview them read-only",
    ],
  },
  {
    key: "feature.operations.bullets",
    valueJson: [
      "Filterable, infinite-scroll operations list with per-event state changes and last-write-wins conflict handling",
      "Patrol monitor: elapsed time, distance covered, and current position",
      "Gantt patrol-area scheduling with drag-and-resize assignment blocks",
    ],
  },
  {
    key: "feature.reports.bullets",
    valueJson: [
      "Law-enforcement and monitoring event categories as breakdown charts",
      "Ranger performance matrix — reported, accompanied, and total credit",
      "Printable report map plus one-click PDF and CSV export",
    ],
  },
  {
    key: "feature.alerts.bullets",
    valueJson: [
      "Rule-based alerting on the event types you choose",
      "One-click acknowledge with a full audit trail",
      "In-app + email escalation to Field Coordinators and Site Admins",
    ],
  },
  {
    key: "feature.earthranger.bullets",
    valueJson: [
      "Validated connection with a Connected / Error status badge",
      "Scheduled sync (default 30s) with a per-data-type sync table",
      "Sync-health indicator and a SYNC FAILED banner keep data freshness honest",
    ],
  },
];

export async function seedCms(prisma: PrismaClient): Promise<{ docPages: number; showcaseFields: number }> {
  const docRows = collectDocRows();
  for (const row of docRows) {
    await prisma.docPage.upsert({
      where: { slug: row.slug },
      update: {
        parentSlug: row.parentSlug,
        kind: row.kind,
        title: row.title,
        description: row.description ?? null,
        orderInParent: row.orderInParent,
        bodyMarkdown: row.bodyMarkdown,
      },
      create: {
        slug: row.slug,
        parentSlug: row.parentSlug,
        kind: row.kind,
        title: row.title,
        description: row.description ?? null,
        orderInParent: row.orderInParent,
        bodyMarkdown: row.bodyMarkdown,
        published: true,
        tenantId: null,
      },
    });
  }

  for (const field of SHOWCASE_TEXT_FIELDS) {
    await prisma.showcaseField.upsert({
      where: { key: field.key },
      update: { value: field.value },
      create: { key: field.key, value: field.value, tenantId: null },
    });
  }

  for (const field of SHOWCASE_JSON_FIELDS) {
    await prisma.showcaseField.upsert({
      where: { key: field.key },
      update: { valueJson: field.valueJson as never },
      create: { key: field.key, value: "", valueJson: field.valueJson as never, tenantId: null },
    });
  }

  return {
    docPages: docRows.length,
    showcaseFields: SHOWCASE_TEXT_FIELDS.length + SHOWCASE_JSON_FIELDS.length,
  };
}
