import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@marine-guardian/db";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authConfig: NextAuthConfig = {
  debug: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          console.log("[authorize] entering");
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) {
            console.log("[authorize] schema parse failed:", parsed.error.message);
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
            include: { tenant: true },
          });
          console.log("[authorize] user lookup result:", user === null ? "null" : `id=${user.id} active=${String(user.isActive)}`);

          if (user === null || !user.isActive) return null;

          const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
          console.log("[authorize] bcrypt compare:", valid);
          if (!valid) return null;

          const result = {
            id: user.id,
            email: user.email,
            name: user.fullName,
            tenantId: user.tenantId,
            roles: [user.role],
            securityVersion: user.securityVersion,
          };
          console.log("[authorize] returning user:", { id: result.id, tenantId: result.tenantId, roles: result.roles, securityVersion: result.securityVersion });
          return result;
        } catch (e) {
          console.error("[authorize] CAUGHT:", e);
          throw e;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      try {
        // next-auth v5 types declare `user` as always-defined, but at runtime
        // it is undefined on session-refresh calls. Runtime guard required.
        /* eslint-disable @typescript-eslint/no-unnecessary-condition */
        console.log("[jwt] entering, user defined?", user !== undefined, "token.userId?", token.userId);
        if (user !== undefined) {
          token.userId = user.id;
          token.tenantId = user.tenantId ?? undefined;
          token.roles = user.roles;
          token.securityVersion = user.securityVersion;
        }
        /* eslint-enable @typescript-eslint/no-unnecessary-condition */

        if (token.userId !== undefined) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.userId },
            select: { securityVersion: true, isActive: true },
          });
          console.log("[jwt] dbUser refresh:", dbUser);
          if (dbUser === null || !dbUser.isActive || dbUser.securityVersion !== token.securityVersion) {
            return { ...token, expired: true };
          }
        }

        return token;
      } catch (e) {
        console.error("[jwt] CAUGHT:", e);
        throw e;
      }
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async session({ session, token }) {
      try {
        console.log("[session] entering, token.expired?", token.expired);
        if (token.expired === true) {
          throw new Error("SESSION_EXPIRED");
        }
        return {
          ...session,
          user: {
            ...session.user,
            id: token.userId ?? "",
            tenantId: token.tenantId ?? "",
            roles: token.roles ?? [],
          },
        };
      } catch (e) {
        console.error("[session] CAUGHT:", e);
        throw e;
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
};
