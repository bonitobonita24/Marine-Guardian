// Export-janitor processor — the DELETION AUTHORITY for ephemeral report exports.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — DO NOT "OPTIMISE" IT AWAY
// ─────────────────────────────────────────────────────────────────────────────
// Report exports are DISPOSABLE. The UI purges them when the user closes the
// export dialog. That client-side purge is a BEST-EFFORT OPTIMISATION ONLY —
// it makes the common case tidy up promptly, and nothing more.
//
// It cannot be the mechanism of record, because it does not run when:
//   - the browser tab crashes or is killed,
//   - the machine sleeps / loses power,
//   - the network drops between the close and the purge call,
//   - the user simply never closes the dialog.
//
// Every one of those leaks an object (and a row) FOREVER. That unbounded
// accumulation is precisely the problem this whole change exists to fix, so
// the SERVER-SIDE TTL IMPLEMENTED HERE IS THE AUTHORITY FOR DELETION. If a
// future change removes or weakens this janitor on the grounds that "the
// dialog already cleans up", the leak comes straight back.
//
// ─────────────────────────────────────────────────────────────────────────────
// TTL SOURCE — createdAt, deliberately, with NO expiresAt column
// ─────────────────────────────────────────────────────────────────────────────
// There is no `expiresAt` column on ReportExport and one must NOT be added.
// `createdAt + EXPORT_TTL_MS` is the TTL by design — it needs no migration and
// exports have a single uniform lifetime, so a per-row expiry would be a
// column that never varies.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO SWEEPS PER RUN
// ─────────────────────────────────────────────────────────────────────────────
// SWEEP A — expired ROWS (all tenants, bounded page). Deletes the stored PDF
//   object (row.filePath), the derived PPTX object(s), then the row itself.
//
// SWEEP B — orphaned OBJECTS. An object can outlive its row: a render worker
//   can finish its upload moments after the row was purged (by the dialog or
//   by sweep A). Row-driven deletion alone can therefore never be complete,
//   so we additionally sweep the bucket by object age.
//
// ⚠ HIGHEST-RISK CODE IN THIS FILE — SWEEP B'S KEY FILTER ⚠
// The exports bucket is NOT exclusively ephemeral. It also holds:
//   - report-template logo images under `logos/`  (buildLogoKey)
//   - CMS-pasted media under `cms/`               (buildCmsMediaKey)
// Both are PERMANENT and are older than any TTL essentially always, so an
// unfiltered age sweep would destroy every tenant's logos on its first run.
// Deletion is therefore gated on isEphemeralExportKey(), which is
// allow-list shaped (positive match on the export key form) with an explicit
// belt-and-braces prefix denylist on top. Never relax it to a denylist alone.

import type { Job } from "bullmq";
import { platformPrisma } from "@marine-guardian/db";
import {
  buildPptxExportKey,
  deleteObject,
  getExportsBucketName,
  listExpiredObjectKeys,
} from "@marine-guardian/storage";
import type { ExportJanitorJobPayload } from "../queues/types";

/**
 * Lifetime of a report export, measured from ReportExport.createdAt.
 * Single source of truth — tests and any future caller import this rather
 * than re-deriving 30 minutes from a literal.
 */
export const EXPORT_TTL_MS = 30 * 60 * 1000;

/** Max expired rows handled per run — keeps one sweep bounded. */
export const EXPORT_JANITOR_ROW_PAGE_SIZE = 200;

/** Max object keys listed per run in the orphan sweep. */
export const EXPORT_JANITOR_OBJECT_PAGE_SIZE = 1000;

/**
 * Prefixes in the exports bucket that hold PERMANENT content and must never
 * be swept. Kept in sync with buildLogoKey / buildCmsMediaKey in
 * packages/storage/src/index.ts.
 */
const PERMANENT_KEY_PREFIXES = ["logos/", "cms/"] as const;

/**
 * Positive shape of an ephemeral export object key, as produced by
 * buildExportKey / buildPptxExportKey:
 *   `${tenantId}/${YYYY}/${MM}/${exportId}.pdf|.pptx`
 * tenantId and exportId are cuids, so the id segments are restricted to
 * cuid-safe characters — which alone already rejects `logos/<t>/<id>.png`
 * (its second segment is not a 4-digit year and its extension is not
 * pdf/pptx) and `cms/global/<id>.png`.
 */
const EPHEMERAL_EXPORT_KEY_RE =
  /^[A-Za-z0-9_-]+\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.(?:pdf|pptx)$/;

/**
 * TRUE only for keys that are a disposable report export. Every deletion in
 * the orphan sweep is gated on this. Two independent guards, deliberately
 * redundant:
 *   1. an explicit denylist of permanent prefixes, and
 *   2. a strict allow-list regex on the export key shape.
 * A key must clear BOTH.
 */
export function isEphemeralExportKey(key: string): boolean {
  if (key === "") return false;
  for (const prefix of PERMANENT_KEY_PREFIXES) {
    if (key.startsWith(prefix)) return false;
  }
  return EPHEMERAL_EXPORT_KEY_RE.test(key);
}

export interface ExportJanitorResult {
  /** Expired ReportExport rows deleted (sweep A). */
  rowsDeleted: number;
  /** Objects deleted while processing expired rows (sweep A). */
  objectsDeleted: number;
  /** Objects deleted because they outlived their row (sweep B). */
  orphansDeleted: number;
}

/**
 * Best-effort object delete. deleteObject is already idempotent on a missing
 * object; this additionally swallows REAL storage failures so a single bad
 * key can never abort the rest of the sweep — a leaked object gets another
 * chance on the next run (every 5 minutes), whereas an aborted sweep leaks
 * everything behind it.
 *
 * @returns true when the delete call completed without throwing.
 */
async function tryDeleteObject(bucket: string, key: string): Promise<boolean> {
  try {
    await deleteObject({ bucket, key });
    return true;
  } catch (err) {
    console.warn(
      `[export-janitor] failed to delete object ${key}:`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/**
 * PPTX object keys for a row. The key is DERIVED, never persisted (see
 * pptx-render.processor) — and buildPptxExportKey embeds the UTC year/month
 * of the Date it is handed, which at upload time is the UPLOAD instant, not
 * the row's createdAt. A row created at 23:59 UTC on the last day of a month
 * therefore lands under the NEXT month's prefix. So we probe both the
 * createdAt month and the following day's month; deleteObject is idempotent,
 * so a probe that matches nothing costs one no-op call. Anything this still
 * misses is caught by sweep B.
 */
function derivePptxKeyCandidates(
  tenantId: string,
  exportId: string,
  createdAt: Date,
): string[] {
  const atCreate = buildPptxExportKey(tenantId, exportId, createdAt);
  const nextDay = buildPptxExportKey(
    tenantId,
    exportId,
    new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
  );
  return atCreate === nextDay ? [atCreate] : [atCreate, nextDay];
}

export async function processExportJanitor(
  job: Job<ExportJanitorJobPayload>,
): Promise<ExportJanitorResult> {
  // NOTE: no validateTenantContext() — this job is platform-wide by design.
  // See ExportJanitorJobPayload in queues/types.ts.
  const bucket = getExportsBucketName();
  const cutoff = new Date(Date.now() - EXPORT_TTL_MS);

  let rowsDeleted = 0;
  let objectsDeleted = 0;
  let orphansDeleted = 0;

  // ── SWEEP A — expired rows, across ALL tenants, bounded page ──────────────
  const expired = await platformPrisma.reportExport.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, tenantId: true, filePath: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: EXPORT_JANITOR_ROW_PAGE_SIZE,
  });

  for (const row of expired) {
    if (row.filePath !== null && row.filePath !== "") {
      const ok = await tryDeleteObject(bucket, row.filePath);
      if (ok) objectsDeleted += 1;
    }

    // Always attempted: there is no column telling us whether a PPTX was ever
    // rendered, and deleteObject is idempotent, so a row without one simply
    // has no object to remove.
    for (const key of derivePptxKeyCandidates(
      row.tenantId,
      row.id,
      row.createdAt,
    )) {
      const ok = await tryDeleteObject(bucket, key);
      if (ok) objectsDeleted += 1;
    }

    try {
      await platformPrisma.reportExport.deleteMany({ where: { id: row.id } });
      rowsDeleted += 1;
    } catch (err) {
      console.warn(
        `[export-janitor] failed to delete row ${row.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ── SWEEP B — orphaned objects that outlived their row ────────────────────
  try {
    const keys = await listExpiredObjectKeys({
      bucket,
      olderThan: cutoff,
      limit: EXPORT_JANITOR_OBJECT_PAGE_SIZE,
    });

    for (const key of keys) {
      // THE SAFETY LINE. Logos and CMS media live in this same bucket and are
      // permanent — skipping them is not an optimisation, it is the guard.
      if (!isEphemeralExportKey(key)) continue;
      const ok = await tryDeleteObject(bucket, key);
      if (ok) orphansDeleted += 1;
    }
  } catch (err) {
    console.warn(
      "[export-janitor] orphan sweep failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log(
    `[export-janitor] job ${job.id ?? "unknown"} swept: rowsDeleted=${String(
      rowsDeleted,
    )} objectsDeleted=${String(objectsDeleted)} orphansDeleted=${String(
      orphansDeleted,
    )}`,
  );

  return { rowsDeleted, objectsDeleted, orphansDeleted };
}
