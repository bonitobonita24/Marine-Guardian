import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config — no bcrypt, no prisma, no node:crypto.
// Used only by middleware.ts (runs on Edge Runtime).
// Full config with Credentials provider stays in config.ts (Node.js runtime only).
export const edgeAuthConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  session: { strategy: "jwt" },
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/require-await
    async session({ session, token }) {
      if (token.expired === true) {
        throw new Error("SESSION_EXPIRED");
      }
      return {
        ...session,
        user: {
          ...session.user,
          id: token.userId ?? "",
          tenantId: token.tenantId ?? "",
          tenantSlug: token.tenantSlug ?? "",
          roles: token.roles ?? [],
          customRoleId: token.customRoleId ?? null,
          customRolePermissions: token.customRolePermissions ?? null,
        },
      };
    },
  },
};
