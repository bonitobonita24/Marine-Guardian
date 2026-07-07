import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { encode as defaultEncode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { prisma } from "@marine-guardian/db";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Sent as the string "true"/"false" by the login form (URLSearchParams body);
  // absent entirely defaults to "not remembered".
  rememberMe: z.enum(["true", "false"]).optional(),
  // Path-based multi-tenancy: the per-tenant login (/[tenant]/login) submits the
  // URL slug so authorize() can bind the login to that tenant. The platform /login
  // (super_admin) submits NO tenantSlug. Empty string is treated as "not submitted".
  tenantSlug: z.string().optional(),
});

// "Remember me" session durations — see docs/AI: Auth.js v5 has no native
// per-login session.maxAge, so the effective session length is enforced via
// a dynamic `maxAge` passed into the custom jwt.encode() override below,
// which controls the JWT's own `exp` claim (checked on every decode).
const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60; // 30 days
const DEFAULT_SESSION_SECONDS = 8 * 60 * 60; // 8 hours (not remembered)

export const authConfig: NextAuthConfig = {
  debug: true,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "text" },
        // Path-based tenancy: submitted by the per-tenant login (/[tenant]/login);
        // absent on the platform /login. Declared so @auth/core forwards it to
        // authorize() (undeclared credential fields are stripped by the wrapper).
        tenantSlug: { label: "Tenant", type: "text" },
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

          // Path-based tenancy binding (SECURITY, defense-in-depth layer 0):
          // the per-tenant login submits the URL slug. Bind the credential to
          // it so a valid password for tenant A cannot mint a session at
          // /tenant-b/login. Empty string == "not submitted" (platform /login).
          const userSlug = user.tenant?.slug ?? "";
          const submittedSlug =
            parsed.data.tenantSlug !== undefined && parsed.data.tenantSlug !== ""
              ? parsed.data.tenantSlug
              : null;
          if (submittedSlug !== null) {
            // Tenant login: super_admins (tenantId === null) may NOT sign in
            // here, and the user's own tenant slug must match the URL slug.
            if (user.tenantId === null || userSlug !== submittedSlug) {
              console.log("[authorize] tenant-login slug mismatch/forbidden");
              return null;
            }
          } else {
            // Platform login (/login, no tenantSlug): only super_admins /
            // platform users with a null tenant may sign in here.
            if (user.tenantId !== null) {
              console.log("[authorize] platform-login rejected for tenant user");
              return null;
            }
          }

          const result = {
            id: user.id,
            email: user.email,
            name: user.fullName,
            tenantId: user.tenantId,
            tenantSlug: userSlug,
            roles: [user.role],
            securityVersion: user.securityVersion,
            rememberMe: parsed.data.rememberMe === "true",
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
          token.tenantSlug = user.tenantSlug ?? "";
          token.roles = user.roles;
          token.securityVersion = user.securityVersion;
          token.rememberMe = user.rememberMe ?? false;
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
            tenantSlug: token.tenantSlug ?? "",
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
  // Ceiling for the session cookie's own maxAge/Expires attribute (Auth.js
  // sets this from the static config, not per-request). The actual session
  // validity is enforced independently below via jwt.encode's dynamic
  // maxAge, which is embedded as the JWT's own `exp` claim and checked on
  // every decode — so a "not remembered" login stops being valid after
  // DEFAULT_SESSION_SECONDS even though the cookie itself may remain
  // present in the browser for up to this ceiling.
  session: { strategy: "jwt", maxAge: REMEMBERED_SESSION_SECONDS },
  jwt: {
    // Auth.js v5 has no native per-login session.maxAge (Context7 /websites/authjs_dev
    // "JWTOptions" + "JWTEncodeParams<Payload>": encode() accepts a `maxAge` that
    // sets the JWT's exp claim). We wrap the default encode() and pick the
    // effective maxAge from token.rememberMe (set in the jwt callback above).
    encode: async ({ token, secret, salt }) => {
      if (token === undefined) {
        throw new Error("[jwt.encode] missing token payload");
      }
      const maxAge =
        token.rememberMe === true ? REMEMBERED_SESSION_SECONDS : DEFAULT_SESSION_SECONDS;
      return defaultEncode({ token, secret, salt, maxAge });
    },
  },
};
