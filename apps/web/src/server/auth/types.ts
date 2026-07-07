import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    tenantId: string | null;
    tenantSlug?: string;
    roles: string[];
    securityVersion: number;
    rememberMe?: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      // Path-based tenancy: the authenticated user's own tenant slug (""
      // for super_admin / platform users). The URL slug is the *requested*
      // tenant; this is the *authenticated* tenant. Enforcement compares them.
      tenantSlug: string;
      roles: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string | undefined;
    tenantId?: string | undefined;
    tenantSlug?: string | undefined;
    roles?: string[] | undefined;
    securityVersion?: number | undefined;
    expired?: boolean | undefined;
    rememberMe?: boolean | undefined;
  }
}
