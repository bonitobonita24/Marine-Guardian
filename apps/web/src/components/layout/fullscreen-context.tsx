"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Shared "command center" fullscreen state for the dashboard shell.
 *
 * Two things happen together when fullscreen is active (Item 6):
 *   (a) the browser Fullscreen API is invoked on the app root element, and
 *   (b) the surrounding chrome (Sidebar + Header) is hidden so only the
 *       dashboard content shows.
 *
 * The header button (FullscreenToggle) and the shell (FullscreenShell) both
 * consume this context so the toggle, the chrome visibility, and the native
 * fullscreen element stay in lock-step. ESC (native) also exits — we mirror
 * that back into React state via the `fullscreenchange` listener.
 */
interface FullscreenContextValue {
  /** True when the app root is in browser fullscreen. */
  isFullscreen: boolean;
  /** Whether the Fullscreen API is available in this browser. */
  isSupported: boolean;
  /** Enter fullscreen if not already, otherwise exit. Keyboard-accessible. */
  toggle: () => void;
  /** Exit fullscreen (used by the floating exit button). */
  exit: () => void;
  /**
   * Ref callback the shell uses to register the element that should go
   * fullscreen (the app root wrapping Sidebar + Header + main).
   */
  registerRoot: (el: HTMLElement | null) => void;
}

const FullscreenContext = createContext<FullscreenContextValue | null>(null);

export function FullscreenProvider({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  const registerRoot = useCallback((el: HTMLElement | null) => {
    rootRef.current = el;
  }, []);

  // Detect support + keep React state synced with the native fullscreen
  // element. Covers ESC, the browser UI exit, and programmatic changes.
  useEffect(() => {
    setIsSupported(
      typeof document !== "undefined" && document.fullscreenEnabled,
    );
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  const exit = useCallback(() => {
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch(() => {
        /* ignore — state stays in sync via fullscreenchange */
      });
    }
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement !== null) {
      exit();
      return;
    }
    const root = rootRef.current;
    if (root === null) return;
    void root.requestFullscreen().catch(() => {
      /* ignore — state stays in sync via fullscreenchange */
    });
  }, [exit]);

  const value = useMemo<FullscreenContextValue>(
    () => ({ isFullscreen, isSupported, toggle, exit, registerRoot }),
    [isFullscreen, isSupported, toggle, exit, registerRoot],
  );

  return (
    <FullscreenContext.Provider value={value}>
      {children}
    </FullscreenContext.Provider>
  );
}

export function useFullscreen(): FullscreenContextValue {
  const ctx = useContext(FullscreenContext);
  if (ctx === null) {
    throw new Error("useFullscreen must be used within a FullscreenProvider");
  }
  return ctx;
}
