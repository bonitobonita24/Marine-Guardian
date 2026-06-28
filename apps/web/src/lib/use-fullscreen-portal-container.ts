"use client"

import { useEffect, useState } from "react"

/**
 * Tracks the active fullscreen element so Radix portals (Dialog, Select, …) can
 * mount INTO it. Radix defaults to document.body, which is OUTSIDE the
 * fullscreened subtree — so any portaled UI opened while a view is in fullscreen
 * (e.g. the Interactive Report Map / Command Center) mounts in the DOM but is
 * never painted by the browser (the user clicks and "nothing shows"). Returns
 * null when not in fullscreen → callers omit the container prop → Radix falls
 * back to document.body (unchanged behaviour). SSR-safe (guards `document`).
 */
export function useFullscreenPortalContainer(): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined"
      ? (document.fullscreenElement as HTMLElement | null)
      : null
  )
  useEffect(() => {
    const update = () => {
      setContainer((document.fullscreenElement as HTMLElement | null) ?? null)
    }
    update()
    document.addEventListener("fullscreenchange", update)
    return () => {
      document.removeEventListener("fullscreenchange", update)
    }
  }, [])
  return container
}
