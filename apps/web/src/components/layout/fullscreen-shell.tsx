"use client";

import { type ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import {
  FullscreenProvider,
  useFullscreen,
} from "@/components/layout/fullscreen-context";

/**
 * Client shell for the dashboard layout (Item 6).
 *
 * The (dashboard)/layout.tsx is a server component (async auth gate), so the
 * fullscreen "command center" behaviour — which needs browser APIs and React
 * state — lives here. It:
 *   - provides FullscreenProvider so the Header toggle + this shell share state,
 *   - registers the root element so the Fullscreen API targets it,
 *   - hides Sidebar + Header when fullscreen so only the dashboard shows.
 *
 * Exiting fullscreen is via the ESC key (native) or the Header toggle — there is
 * intentionally no floating on-screen exit button.
 */
export function FullscreenShell({ children }: { children: ReactNode }) {
  return (
    <FullscreenProvider>
      <FullscreenShellInner>{children}</FullscreenShellInner>
    </FullscreenProvider>
  );
}

function FullscreenShellInner({ children }: { children: ReactNode }) {
  const { isFullscreen, registerRoot } = useFullscreen();

  return (
    <div ref={registerRoot} className="flex h-screen overflow-hidden bg-background">
      {!isFullscreen && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!isFullscreen && <Header />}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
