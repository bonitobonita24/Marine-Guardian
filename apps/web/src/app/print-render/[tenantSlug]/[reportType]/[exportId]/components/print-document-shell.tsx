/**
 * PrintDocumentShell — the document scaffold for every /print-render/* report.
 *
 * ─── WHY THIS EXISTS (React #418 root cause, 2026-07-20) ──────────────────
 * Every print report used to emit its OWN `<html><head>…</head><body>…</body></html>`.
 * But a print-render page is a Next.js App Router PAGE — it is rendered as
 * `children` of the app root layout (`src/app/layout.tsx`), which already
 * emits `<html>` and `<body>`. So the SSR byte stream was:
 *
 *   <html><body> … <html lang="en"><head>…</head><body>…</body></html> … </body></html>
 *
 * The HTML parser NEVER produces that tree. Per the HTML spec's "in body"
 * insertion mode, a nested `<html>` start tag only merges its attributes onto
 * the existing root element and is otherwise IGNORED; a nested `<head>` is
 * ignored outright; a nested `<body>` likewise only merges attributes. The
 * nested elements' CHILDREN are re-parented straight into the outer `<body>`.
 *
 * So the live DOM has always been flat, while React's client hydration walked
 * the tree expecting real `<html>`/`<head>`/`<body>` host nodes to be there.
 * That structural divergence is exactly what `throwOnHydrationMismatch` fires
 * on — React error #418, "Hydration failed because the server rendered HTML
 * didn't match the client" (the `HTML` arg in the minified message is that
 * `%s`). Verified against react-dom@19.2.7:
 * `react-dom-client.production.js` → `throwOnHydrationMismatch()` →
 * `formatProdErrorMessage(418, …)`.
 *
 * ─── WHY THIS IS PDF-NEUTRAL ──────────────────────────────────────────────
 * Because the parser already discarded those wrapper tags, rendering the
 * children directly produces the SAME post-parse DOM the renderer has always
 * screenshotted. Concretely:
 *   • `<style>` has no `precedence` prop, so React 19 does NOT hoist it — it
 *     stays inline exactly where the parser put it before.
 *   • The inline gate `<script>` is not `async`, so React 19 does NOT hoist it
 *     either; it still executes before the content that follows it, which is
 *     what `window.__hlPhotoLoaded` / `window.__renderPending` rely on.
 *   • The CSS `html { … }` / `body { … }` rules already resolved against the
 *     ROOT layout's html/body (the only ones in the DOM) — unchanged.
 *   • `<meta charSet>` is dropped: Next.js already emits one in the real
 *     document head, and a duplicate parsed mid-body was always inert.
 *   • `<title>` is kept. React 19 hoists in-tree `<title>` into the real
 *     `<head>` deterministically on both server and client, so it hydrates
 *     cleanly. It affects `document.title` only — never the rendered page.
 *
 * The render-gate contract (`window.__renderReady` / `window.__renderPending`)
 * is untouched by design — the Puppeteer renderer waits on it.
 */

interface PrintDocumentShellProps {
  /** Document title. Single collapsed string — never multiple JSX children. */
  title: string;
  /** The report's full CSS, injected as a non-hoisted inline `<style>`. */
  css: string;
  /**
   * Optional inline render-gate bootstrap script, emitted BEFORE `children`
   * so the globals it defines exist by the time content-driven callbacks fire.
   * `null` when the report has no gate script of its own.
   */
  gateScript?: string | null;
  children: React.ReactNode;
}

export function PrintDocumentShell({
  title,
  css,
  gateScript = null,
  children,
}: PrintDocumentShellProps) {
  return (
    <>
      <title>{title}</title>
      <style>{css}</style>
      {gateScript !== null ? (
        <script dangerouslySetInnerHTML={{ __html: gateScript }} />
      ) : null}
      {children}
    </>
  );
}
