// assert-no-document-scaffold.ts
//
// Shared assertion for the React #418 regression guards across every
// print-render template test. See components/print-document-shell.tsx for the
// full root-cause writeup.
//
// NOTE: the reports embed their CSS in an inline <style> block, and several of
// those blocks contain prose comments that mention "<html>" / "<body>"
// literally. Those are CSS text, not markup, so the scaffold check must run
// against the markup with <style> and <script> contents stripped out first —
// otherwise the guard false-positives on a comment.

import { expect } from "vitest";

/** Markup with the contents of every <style>/<script> block removed. */
export function stripInlineBlocks(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");
}

/**
 * Fails if the rendered markup contains an <html>, <head> or <body> tag.
 *
 * A print-render page is rendered as `children` of the app root layout, which
 * already emits the document scaffold. Emitting a second, nested one produced
 * markup the HTML parser cannot reproduce (it discards the nested tags and
 * re-parents their children), so React's hydration walk diverged from the real
 * DOM and threw error #418.
 */
export function expectNoDocumentScaffold(html: string): void {
  const markup = stripInlineBlocks(html);

  expect(markup).not.toMatch(/<(html|head|body)(\s|>)/i);
  expect(markup).not.toContain("</html>");
  expect(markup).not.toContain("</head>");
  expect(markup).not.toContain("</body>");
}
