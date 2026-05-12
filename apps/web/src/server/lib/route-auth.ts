import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

export interface RouteAuthContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

export class RouteAuthError extends Error {
  readonly response: NextResponse;
  constructor(response: NextResponse) {
    super("Route handler authentication failed");
    this.response = response;
  }
}

/**
 * Verify the current request has a valid authenticated session with tenant context.
 *
 * Route Handlers bypass tRPC middleware (security.md L11) so they MUST call this.
 * Throws `RouteAuthError` carrying a 401 `NextResponse` when the session is
 * missing or has no tenant — callers catch and return the response directly.
 */
export async function requireRouteAuth(): Promise<RouteAuthContext> {
  const session = await auth();
  if (session === null || session.user.id === "" || session.user.tenantId === "") {
    throw new RouteAuthError(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    roles: session.user.roles,
  };
}
