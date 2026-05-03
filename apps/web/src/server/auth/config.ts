import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@marine-guardian/db";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { tenant: true },
        });

        if (user === null || !user.isActive) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          tenantId: user.tenantId,
          roles: [user.role],
          securityVersion: user.securityVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      token.userId = user.id;
      token.tenantId = user.tenantId ?? undefined;
      token.roles = user.roles;
      token.securityVersion = user.securityVersion;

      if (token.userId !== undefined) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { securityVersion: true, isActive: true },
        });
        if (dbUser === null || !dbUser.isActive || dbUser.securityVersion !== token.securityVersion) {
          return { ...token, expired: true };
        }
      }

      return token;
    },
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
          roles: token.roles ?? [],
        },
      };
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
};
