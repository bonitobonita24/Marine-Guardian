"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useFullscreen } from "@/components/layout/fullscreen-context";

/**
 * Square icon button that enters the fullscreen "command center" mode (Item 6):
 * browser Fullscreen API on the app root + Sidebar/Header hidden. Shown only
 * when the browser supports the Fullscreen API. ESC / the floating exit button
 * leave fullscreen; the icon swaps to NotificationBell's neighbour position.
 */
function FullscreenToggle() {
  const { isSupported, toggle } = useFullscreen();
  if (!isSupported) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Enter fullscreen command center"
    >
      <Maximize2 aria-hidden="true" />
    </Button>
  );
}

/**
 * Blue Alliance brand mark, pinned to the far right of the header bar.
 *
 * Asset: `public/blue-alliance-logo.png` — the same 400x160 artwork already
 * bundled as `BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI` for report PDFs (extracted
 * from that constant so the two surfaces stay one brand asset). The PDF path
 * keeps its inline data URI because the renderer needs the bytes with zero
 * I/O; this client surface can just take the `public/` URL.
 *
 * It MUST live at the public ROOT, not in a subfolder. `middleware.ts` treats
 * any first path segment without a dot as a tenant slug, so `/brand/logo.png`
 * gets resolved as tenant "brand" and redirected to HTML — which makes the
 * next/image optimizer fail with "isn't a valid image ... received null" (400).
 * A root-level dotted filename is excluded by both `config.matcher` and the
 * `isStaticAssetSegment` guard, so it is served as a real static file.
 *
 * Sized to the visual weight of the neighbouring icon buttons (h-7), not the
 * text — it is a signature, not a control. This is Blue Alliance's official
 * white wordmark (from bluealliance.earth), which reads high-contrast on the
 * dark `bg-card`; logotypes are exempt from WCAG 1.4.11, so the artwork is used
 * unaltered rather than filtered or plated (brand fidelity).
 *
 * Hidden below `md` so the email + role badge keep the width they need on a
 * phone/tablet instead of overflowing the bar. `md` (not `sm`) is measured,
 * not guessed: the right-hand group needs ~438px and the bar reserves 176px
 * of sidebar + 48px of `px-6`, so the logo only fits from ~662px up — at the
 * `sm` 640px breakpoint it clipped off the right edge by 13px.
 */
function BlueAllianceMark() {
  return (
    <div className="ml-1 hidden shrink-0 border-l border-border pl-3 md:block">
      <Image
        src="/blue-alliance-logo.png"
        alt="Blue Alliance — Philippines Marine Protected Areas"
        width={800}
        height={320}
        className="h-7 w-auto"
      />
    </div>
  );
}

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div />
      <div className="flex items-center gap-3">
        <FullscreenToggle />
        <NotificationBell />
        {session?.user && (
          <>
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
          </>
        )}
        <BlueAllianceMark />
      </div>
    </header>
  );
}
