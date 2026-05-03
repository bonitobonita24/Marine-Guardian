"use client";

import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div />
      <div className="flex items-center gap-3">
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
