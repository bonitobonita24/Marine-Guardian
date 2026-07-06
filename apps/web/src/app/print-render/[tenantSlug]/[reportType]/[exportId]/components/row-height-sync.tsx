"use client";

import { useEffect } from "react";

/**
 * Equalizes row heights across the two halves of a column-split event-type
 * table so each event's row lines up on BOTH the "columns 1 of 2" and
 * "columns 2 of 2" pages (owner report 2026-07-06 — rows drifted out of
 * alignment because the two halves wrap to different heights).
 *
 * The two <table>s of a split live in the same `.event-type-block` and render
 * the same events in the same order, so row i on page 1 ↔ row i on page 2. For
 * each pair we set both rows to the taller of the two (a <tr> height acts as a
 * min-height in table layout, so the shorter row grows to match).
 *
 * Runs after fonts + layout settle. The tables are static HTML and lay out
 * almost immediately, whereas the PDF capture waits on window.__renderReady,
 * which the slower map islands flip — so the equalized layout is always in
 * place before Puppeteer prints.
 */
export function RowHeightSync() {
  useEffect(() => {
    const sync = () => {
      document
        .querySelectorAll<HTMLElement>(".event-type-block")
        .forEach((block) => {
          const tables =
            block.querySelectorAll<HTMLTableElement>("table.full-table");
          const tableA = tables[0];
          const tableB = tables[1];
          if (tableA === undefined || tableB === undefined) return;
          const rowsA = Array.from(
            tableA.querySelectorAll<HTMLTableRowElement>("tbody tr"),
          );
          const rowsB = Array.from(
            tableB.querySelectorAll<HTMLTableRowElement>("tbody tr"),
          );
          const n = Math.min(rowsA.length, rowsB.length);
          // Clear any prior override so we measure natural heights.
          for (let i = 0; i < n; i++) {
            const a = rowsA[i];
            const b = rowsB[i];
            if (a === undefined || b === undefined) continue;
            a.style.height = "";
            b.style.height = "";
          }
          for (let i = 0; i < n; i++) {
            const a = rowsA[i];
            const b = rowsB[i];
            if (a === undefined || b === undefined) continue;
            const h = Math.max(a.offsetHeight, b.offsetHeight);
            a.style.height = `${String(h)}px`;
            b.style.height = `${String(h)}px`;
          }
        });
    };
    // Double rAF after fonts load guarantees a completed layout pass.
    const run = () =>
      requestAnimationFrame(() => {
        requestAnimationFrame(sync);
      });
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(run);
    } else {
      run();
    }
  }, []);
  return null;
}
