// End-to-end webmaster login verification.
// Usage:  set -a && source .env.dev && set +a && node packages/db/scripts/verify-webmaster-login.mjs
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const env = process.env.WEBMASTER_PASSWORD;
if (!env) { console.log("FAIL: WEBMASTER_PASSWORD not in process.env — source .env.dev first"); process.exit(1); }
console.log("env password length:", env.length);

const user = await prisma.user.findUnique({
  where: { email: "webmaster@marine-guardian.local" },
});

if (!user) { console.log("FAIL: webmaster user not found in DB"); await prisma.$disconnect(); process.exit(1); }

console.log("\nDB record (ALL fields):");
for (const k of Object.keys(user).sort()) {
  const v = user[k];
  if (k === "passwordHash") {
    console.log(`  ${k}: <length=${v?.length}>`);
  } else if (v instanceof Date) {
    console.log(`  ${k}: ${v.toISOString()}`);
  } else {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
}

const match = await bcrypt.compare(env, user.passwordHash);
console.log("\nbcrypt.compare:", match);
await prisma.$disconnect();

if (!match) { console.log("\nFAIL: hash mismatch"); process.exit(2); }

// ===== Full HTTP simulation =====
const BASE = process.env.NEXTAUTH_URL || "http://localhost:45204";
console.log(`\n=== HTTP auth simulation against ${BASE} ===`);

const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
const setCookie = csrfRes.headers.get("set-cookie") || "";
const csrfBody = await csrfRes.json();
console.log("got csrfToken length:", csrfBody.csrfToken.length);

const cookieMatch = setCookie.match(/authjs\.csrf-token=([^;]+)/);
const cookieHeader = cookieMatch ? `authjs.csrf-token=${cookieMatch[1]}` : "";

const body = new URLSearchParams({
  csrfToken: csrfBody.csrfToken,
  email: "webmaster@marine-guardian.local",
  password: env,
  callbackUrl: BASE + "/dashboard",
  json: "true",
});

const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: cookieHeader,
    "X-Auth-Return-Redirect": "1",
  },
  body,
  redirect: "manual",
});
console.log("HTTP status:", r.status);
console.log("location:", r.headers.get("location"));
const text = await r.text();
console.log("body (first 400):", text.slice(0, 400));

if (text.includes("CredentialsSignin")) {
  console.log("\n>>> Auth.js rejected even with correct password — error is in authorize() return shape, jwt(), or session() callback. Inspect docker logs after this attempt.");
} else if ((text.includes("dashboard") || text.includes('"url"')) && !text.includes("error=")) {
  console.log("\n>>> Auth.js ACCEPTED — login works server-side. Browser cookie/redirect handling is the issue.");
} else {
  console.log("\n>>> Unexpected — paste body above.");
}
