"use client";

/**
 * SSR-disabled dynamic wrapper around `AreaBoundaryEditor`.
 *
 * Leaflet (and @geoman-io/leaflet-geoman-free) reach for `window` at module
 * load. Importing the editor synchronously breaks Next.js SSR/build. Both
 * the Create and Edit boundary dialogs need this exact same dynamic wrapper
 * with the same `ssr: false` setting and the same 400px loading skeleton,
 * so it lives here once and gets imported by both consumers.
 *
 * Types remain exported from `./area-boundary-editor` directly — only the
 * runtime wrapper is shared here.
 *
 * Consumer pattern:
 *
 *     import { AreaBoundaryEditor } from "./area-boundary-editor.dynamic";
 *     <AreaBoundaryEditor mode="create" onGeometryChange={...} />
 */

import dynamic from "next/dynamic";

export const AreaBoundaryEditor = dynamic(
  () => import("./area-boundary-editor").then((m) => m.AreaBoundaryEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] w-full animate-pulse rounded border bg-muted" />
    ),
  },
);
