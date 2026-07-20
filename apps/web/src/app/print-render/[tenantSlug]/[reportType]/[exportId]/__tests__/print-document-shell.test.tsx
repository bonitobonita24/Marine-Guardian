// print-document-shell.test.tsx
//
// Regression guard for React #418 on /print-render/* (2026-07-20).
//
// ROOT CAUSE: every print report emitted its own <html><head></head><body>
// document, but a print-render page is rendered as `children` of the app root
// layout (src/app/layout.tsx), which already emits <html> and <body>. The HTML
// parser never produces a nested document — per the spec's "in body" insertion
// mode a nested <html>/<body> start tag only merges attributes onto the
// existing element and a nested <head> is ignored outright, so the children are
// re-parented flat into the outer <body>. React's client hydration then walked
// the tree expecting host nodes the parser had discarded, and
// throwOnHydrationMismatch() fired — formatProdErrorMessage(418, "HTML") in
// react-dom@19.2.7's react-dom-client.production.js.
//
// These tests pin the invariant: NO print-render component may emit document
// scaffold tags. They also pin the parts the Puppeteer renderer depends on —
// the inline <style> stays un-hoisted, and the render-gate <script> is emitted
// BEFORE the content whose callbacks depend on the globals it defines.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PrintDocumentShell } from "../components/print-document-shell";
import { expectNoDocumentScaffold } from "./assert-no-document-scaffold";

describe("PrintDocumentShell", () => {
  it("emits NO <html>, <head> or <body> scaffold tags (the React #418 root cause)", () => {
    expectNoDocumentScaffold(
      renderToStaticMarkup(
        <PrintDocumentShell title="T" css="body { color: #111; }">
          <div className="content">hi</div>
        </PrintDocumentShell>,
      ),
    );
  });

  it("does NOT strip a genuine scaffold tag — the guard actually catches one", () => {
    // Sanity-check the guard itself: the <style>-stripping in
    // expectNoDocumentScaffold must not blind it to real markup.
    const withScaffold = renderToStaticMarkup(
      <PrintDocumentShell title="T" css="/* <html> in a comment */">
        <div />
      </PrintDocumentShell>,
    );
    // CSS-comment mention is tolerated…
    expectNoDocumentScaffold(withScaffold);
    // …but a real tag is not.
    expect(() => {
      expectNoDocumentScaffold("<div><body>nope</body></div>");
    }).toThrow();
  });

  it("renders the CSS inline in an un-hoisted <style> (no precedence prop)", () => {
    const html = renderToStaticMarkup(
      <PrintDocumentShell title="T" css="body { color: #111; }">
        <div />
      </PrintDocumentShell>,
    );

    expect(html).toContain("<style>body { color: #111; }</style>");
    // A `precedence` prop would opt the tag into React 19's hoisting machinery
    // and move it out of position — the PDF depends on it staying put.
    expect(html).not.toContain("precedence");
  });

  it("emits the render-gate script BEFORE children so its globals exist first", () => {
    const html = renderToStaticMarkup(
      <PrintDocumentShell
        title="T"
        css=""
        gateScript="window.__renderPending = 3;"
      >
        <div className="content" />
      </PrintDocumentShell>,
    );

    const scriptAt = html.indexOf("window.__renderPending = 3;");
    const contentAt = html.indexOf('class="content"');
    expect(scriptAt).toBeGreaterThan(-1);
    expect(contentAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeLessThan(contentAt);
    // Not `async` — an async script WOULD be hoisted by React 19.
    expect(html).not.toContain("<script async");
  });

  it("omits the gate <script> entirely when no gateScript is supplied", () => {
    const html = renderToStaticMarkup(
      <PrintDocumentShell title="T" css="">
        <div />
      </PrintDocumentShell>,
    );

    expect(html).not.toContain("<script");
  });

  it("renders the title as a single collapsed text node", () => {
    const html = renderToStaticMarkup(
      <PrintDocumentShell title="Tenant — Report — Range" css="">
        <div />
      </PrintDocumentShell>,
    );

    // One string child only. A multi-child <title> hydrates against the single
    // merged Text node the parser produces and re-triggers a mismatch.
    expect(html).toContain("<title>Tenant — Report — Range</title>");
    expect(html).not.toContain("<!-- -->");
  });
});
