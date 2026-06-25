"use client";

import { type ReactNode } from "react";
import { Minimize2 } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
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
 *   - hides Sidebar + Header when fullscreen so only the dashboard shows,
 *   - renders a small floating "Exit fullscreen" button (ESC also exits).
 */
export function FullscreenShell({ children }: { children: ReactNode }) {
  return (
    <FullscreenProvider>
      <FullscreenShellInner>{children}</FullscreenShellInner>
    </FullscreenProvider>
  );
}

function FullscreenShellInner({ children }: { children: ReactNode }) {
  const { isFullscreen, registerRoot, exit } = useFullscreen();

  return (
    <div ref={registerRoot} className="flex h-screen overflow-hidden bg-background">
      {!isFullscreen && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!isFullscreen && <Header />}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {isFullscreen && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={exit}
          aria-label="Exit fullscreen"
          className="fixed right-4 top-4 z-50 gap-2 shadow-lg"
        >
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
          Exit fullscreen
        </Button>
      )}
    </div>
  );
}
