import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    tenantId: string | null;
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
      roles: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string | undefined;
    tenantId?: string | undefined;
    roles?: string[] | undefined;
    securityVersion?: number | undefined;
    expired?: boolean | undefined;
    rememberMe?: boolean | undefined;
  }
}
