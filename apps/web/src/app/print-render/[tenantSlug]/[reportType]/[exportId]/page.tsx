/**
 * Print-only HTML render target consumed by marine-guardian-pdf-renderer.
 *
 * URL path: /print-render/[tenantSlug]/[reportType]/[exportId]
 *   Deviates from v2 PRODUCT.md L724 spec path /_print/* — Next.js App
 *   Router treats `_`-prefixed folders as private folders that are excluded
 *   from routing. "Internal-only" semantics are enforced by the
 *   X-PDF-Renderer-Token guard in middleware.ts, not by the URL prefix.
 *   See DECISIONS_LOG.md "PDF Renderer Internal Route Path" for the lock.
 *
 * Access: bypasses the normal /login redirect via the service-token guard
 * in apps/web/src/middleware.ts (checks X-PDF-Renderer-Token before the
 * auth gate). Direct browser access without the header returns 401.
 *
 * Dispatch (slug ↔ ReportExport.reportType enum value):
 *   coverage          → CoverageReport (3-page funder template — 6.1a/b/c)
 *   area              → PerAreaReport (Page 1 ships in 6.2a; Pages 2-3
 *                       land in 6.2b / 6.2c). URL slug matches the
 *                       schema enum value `area`, not the spec route
 *                       segment `/[tenant]/reports/area` "per-area" label.
 *   ad-hoc-events /
 *   ad-hoc-patrols    → pipeline-stub banner (content lands in later 6.x).
 */

import { notFound } from "next/navigation";
import { getCoverageReportData } from "@/server/coverage-report/get-coverage-report-data";
import { getPerAreaReportData } from "@/server/per-area-report/get-per-area-report-data";
import { getReportMapReportData } from "@/server/report-map-report/get-report-map-report-data";
import { CoverageReport } from "./coverage-report";
import { PerAreaReport } from "./per-area-report";
import { ReportMapReport } from "./report-map-report";

interface PrintPageProps {
  params: Promise<{
    tenantSlug: string;
    reportType: string;
    exportId: string;
  }>;
}

const VALID_REPORT_TYPES = new Set([
  "coverage",
  "area",
  "report_map",
  "ad-hoc-events",
  "ad-hoc-patrols",
]);

export default async function PrintPage({ params }: PrintPageProps) {
  const { tenantSlug, reportType, exportId } = await params;

  if (reportType === "coverage") {
    const data = await getCoverageReportData(tenantSlug, exportId);
    if (data === null) notFound();
    return <CoverageReport data={data} />;
  }

  if (reportType === "area") {
    const data = await getPerAreaReportData(tenantSlug, exportId);
    if (data === null) notFound();
    return <PerAreaReport data={data} />;
  }

  if (reportType === "report_map") {
    const data = await getReportMapReportData(tenantSlug, exportId);
    if (data === null) notFound();
    return <ReportMapReport data={data} />;
  }

  const generatedAt = new Date().toISOString();
  const reportTypeLabel = VALID_REPORT_TYPES.has(reportType)
    ? reportType
    : `${reportType} (unrecognized — pipeline stub)`;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>
          Marine Guardian Export — {reportTypeLabel} — {exportId}
        </title>
        <style>{`
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; margin: 0; padding: 24px; }
          h1 { font-size: 22px; margin: 0 0 8px; }
          .meta { font-size: 12px; color: #555; }
          .meta dt { float: left; clear: left; width: 8em; font-weight: 600; }
          .meta dd { margin: 0 0 4px 8em; }
          .stub-banner { margin-top: 24px; padding: 12px 16px; background: #f4f4f5; border-left: 3px solid #71717a; font-size: 12px; }
        `}</style>
      </head>
      <body>
        <h1>Marine Guardian — Export Render Pipeline Stub</h1>
        <dl className="meta">
          <dt>Tenant:</dt>
          <dd>{tenantSlug}</dd>
          <dt>Report type:</dt>
          <dd>{reportTypeLabel}</dd>
          <dt>Export ID:</dt>
          <dd>{exportId}</dd>
          <dt>Generated at:</dt>
          <dd>{generatedAt}</dd>
        </dl>
        <div className="stub-banner">
          Report content for this type lands in a later Batch 6 sub-batch.
          Coverage Report Page 1 ships in 6.1a; Pages 2 + 3 follow in 6.1b
          and 6.1c.
        </div>
        {/* networkidle0 wait target — Puppeteer treats this page as fully loaded once this image (a 1×1 transparent data URI) resolves. */}
        <img
          alt=""
          src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          style={{ position: "absolute", width: 1, height: 1, left: -9999 }}
        />
      </body>
    </html>
  );
}
