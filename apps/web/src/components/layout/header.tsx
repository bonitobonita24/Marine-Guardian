"use client";

import { useSession } from "next-auth/react";
import { Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
            {session.user.roles.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {session.user.roles[0]}
              </Badge>
            )}
          </>
        )}
      </div>
    </header>
  );
}
