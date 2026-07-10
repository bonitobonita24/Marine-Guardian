// remember-me.test.ts
//
// Regression coverage for the "Remember me" (30-day) vs default (8-hour)
// session duration, proving:
//   1. authConfig.jwt.encode() embeds the correct `exp` claim (Auth.js v5 /
//      @auth-core's encode() sets the JWE's own exp from the `maxAge` param —
//      no custom decode is required for this to be enforced, since jose's
//      jwtDecrypt() rejects an expired token on its own).
//   2. rememberMe survives a full sign-in → jwt callback → encode round trip.
//   3. rememberMe survives a decode → jwt callback (refresh, user===undefined)
//      → re-encode cycle (the sliding-session path that @auth/core's
//      session() action runs on every `auth()`/`getSession()` call), and the
//      refreshed token still carries the correct duration.
//
// Bug under investigation: "Remember me gets logged out after a short time."
// Finding (see PM report): NOT reproducible at the JWT/session-encoding layer
// — every scenario below round-trips correctly. This suite locks that in so a
// future change can't silently regress it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { decode as defaultDecode } from "next-auth/jwt";

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

import { authConfig } from "../config";

type JwtCallback = NonNullable<NonNullable<typeof authConfig.callbacks>["jwt"]>;
type JwtCallbackArgs = Parameters<JwtCallback>[0];

// The Auth.js v5 type declares `user` as always-defined on JwtCallbackArgs,
// but at runtime it is `undefined` on session-refresh calls (config.ts's own
// jwt() callback has an identical runtime guard + comment for this reason).
// Widen the helper's accepted shape to match reality.
async function runJwtCallback(args: {
  token: JwtCallbackArgs["token"];
  user: JwtCallbackArgs["user"] | undefined;
}): Promise<Awaited<ReturnType<JwtCallback>>> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return authConfig.callbacks!.jwt!({
    ...args,
    account: null,
  } as JwtCallbackArgs);
}

const SECRET = "test-only-secret-at-least-32-characters-long";
const SALT = "authjs.session-token";
const THIRTY_DAYS = 30 * 24 * 60 * 60;
const EIGHT_HOURS = 8 * 60 * 60;
// jose's jwtDecrypt clockTolerance is 15s; allow generous slack for CI jitter.
const TOLERANCE_SECONDS = 30;

const ACTIVE_DB_USER = { isActive: true, securityVersion: 1 };

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function encode(token: Record<string, unknown>): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return authConfig.jwt!.encode!({ token, secret: SECRET, salt: SALT });
}

async function decode(token: string) {
  return defaultDecode({ token, secret: SECRET, salt: SALT });
}

beforeEach(() => {
  mockFindUnique.mockReset();
  mockFindUnique.mockResolvedValue(ACTIVE_DB_USER);
});

describe("remember-me session duration — jwt.encode", () => {
  it("rememberMe: true → exp ~30 days out", async () => {
    const before = nowSeconds();
    const jwe = await encode({ userId: "u1", rememberMe: true });
    const payload = await decode(jwe);

    expect(payload).not.toBeNull();
    const exp = payload?.["exp"] as number;
    expect(exp).toBeGreaterThan(before + THIRTY_DAYS - TOLERANCE_SECONDS);
    expect(exp).toBeLessThan(before + THIRTY_DAYS + TOLERANCE_SECONDS);
  });

  it("rememberMe: false → exp ~8 hours out (NOT 30 days)", async () => {
    const before = nowSeconds();
    const jwe = await encode({ userId: "u1", rememberMe: false });
    const payload = await decode(jwe);

    expect(payload).not.toBeNull();
    const exp = payload?.["exp"] as number;
    expect(exp).toBeGreaterThan(before + EIGHT_HOURS - TOLERANCE_SECONDS);
    expect(exp).toBeLessThan(before + EIGHT_HOURS + TOLERANCE_SECONDS);
  });

  it("rememberMe absent (undefined) → defaults to the 8-hour ceiling, not 30 days", async () => {
    const before = nowSeconds();
    const jwe = await encode({ userId: "u1" });
    const payload = await decode(jwe);

    const exp = payload?.["exp"] as number;
    expect(exp).toBeLessThan(before + THIRTY_DAYS);
    expect(exp).toBeGreaterThan(before + EIGHT_HOURS - TOLERANCE_SECONDS);
    expect(exp).toBeLessThan(before + EIGHT_HOURS + TOLERANCE_SECONDS);
  });
});

describe("remember-me — full sign-in wiring (authorize result → jwt callback → encode)", () => {
  it("threads rememberMe:true from the authorize() result all the way to a 30-day exp", async () => {
    const defaultToken = { name: "Dev Admin", email: "admin@mail.com", sub: "u1" };
    const authorizeResult = {
      id: "u1",
      email: "admin@mail.com",
      name: "Dev Admin",
      tenantId: "t1",
      roles: ["tenant_superadmin"],
      securityVersion: 1,
      rememberMe: true,
    };

    const token = await runJwtCallback({
      token: defaultToken,
      user: authorizeResult,
    });

    expect(token).not.toBeNull();
    expect((token as Record<string, unknown>)["rememberMe"]).toBe(true);

    const before = nowSeconds();
    const jwe = await encode(token as Record<string, unknown>);
    const payload = await decode(jwe);
    const exp = payload?.["exp"] as number;
    expect(exp).toBeGreaterThan(before + THIRTY_DAYS - TOLERANCE_SECONDS);
    expect(exp).toBeLessThan(before + THIRTY_DAYS + TOLERANCE_SECONDS);
  });
});

describe("remember-me — survives a decode → jwt(refresh) → re-encode cycle", () => {
  it("a remembered session stays remembered (and keeps sliding to +30d) across a session refresh", async () => {
    const initial = await encode({
      userId: "u1",
      securityVersion: 1,
      rememberMe: true,
    });
    const decoded = await decode(initial);
    expect(decoded).not.toBeNull();

    // Simulate @auth/core's session() action refresh call: callbacks.jwt is
    // invoked again with `user` undefined (session.ts line ~43).
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const refreshedToken = await runJwtCallback({ token: decoded!, user: undefined });

    expect(refreshedToken).not.toBeNull();
    expect((refreshedToken as Record<string, unknown>)["rememberMe"]).toBe(true);
    expect((refreshedToken as Record<string, unknown>)["expired"]).not.toBe(true);

    const before = nowSeconds();
    const reEncoded = await encode(refreshedToken as Record<string, unknown>);
    const rePayload = await decode(reEncoded);
    const exp = rePayload?.["exp"] as number;

    // Sliding window: the refreshed token should be valid ~30 days from NOW,
    // not just from the original login time.
    expect(exp).toBeGreaterThan(before + THIRTY_DAYS - TOLERANCE_SECONDS);
    expect(exp).toBeLessThan(before + THIRTY_DAYS + TOLERANCE_SECONDS);
  });

  it("a non-remembered session stays non-remembered across a refresh (8h, not 30d)", async () => {
    const initial = await encode({
      userId: "u1",
      securityVersion: 1,
      rememberMe: false,
    });
    const decoded = await decode(initial);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const refreshedToken = await runJwtCallback({ token: decoded!, user: undefined });

    expect((refreshedToken as Record<string, unknown>)["rememberMe"]).toBe(false);

    const before = nowSeconds();
    const reEncoded = await encode(refreshedToken as Record<string, unknown>);
    const rePayload = await decode(reEncoded);
    const exp = rePayload?.["exp"] as number;

    expect(exp).toBeLessThan(before + THIRTY_DAYS);
    expect(exp).toBeGreaterThan(before + EIGHT_HOURS - TOLERANCE_SECONDS);
    expect(exp).toBeLessThan(before + EIGHT_HOURS + TOLERANCE_SECONDS);
  });

  it("an inactive/deactivated user's refresh is marked expired regardless of rememberMe", async () => {
    mockFindUnique.mockResolvedValue({ isActive: false, securityVersion: 1 });

    const initial = await encode({
      userId: "u1",
      securityVersion: 1,
      rememberMe: true,
    });
    const decoded = await decode(initial);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const refreshedToken = await runJwtCallback({ token: decoded!, user: undefined });

    expect((refreshedToken as Record<string, unknown>)["expired"]).toBe(true);
  });
});
