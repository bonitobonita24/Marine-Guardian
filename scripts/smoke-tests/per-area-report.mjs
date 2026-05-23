#!/usr/bin/env node
// Per Area Report end-to-end smoke test (Task 3 in .cline/next-tasks.md).
//
// Validates the full pipeline:
//   NextAuth login → reportExport.create (tRPC) → BullMQ pdf-render →
//   Puppeteer renderer → MinIO upload → /api/exports/reports/[id]/download.
//
// Reads credentials from env vars (DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD)
// — never logs values. Wrapper script (run-per-area-smoke.sh) extracts the
// password from CREDENTIALS.md and exports it before invoking this script.

import { setTimeout as sleep } from "node:timers/promises";
import { writeFile } from "node:fs/promises";

const APP_URL = process.env.APP_URL ?? "http://localhost:45204";
const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? "admin@demo-site.local";
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD;
const AREA_BOUNDARY_ID = process.env.AREA_BOUNDARY_ID ?? "smoke-test-area-001";
const OUTFILE = process.env.OUTFILE ?? "/tmp/smoke-area-report.pdf";

if (!PASSWORD) {
  console.error("FAIL: DEMO_ADMIN_PASSWORD env var not set");
  process.exit(1);
}

// Cookie jar — persists Set-Cookie headers across requests.
const jar = new Map();
function storeCookies(setCookieHeaders) {
  for (const raw of setCookieHeaders) {
    const [pair] = raw.split(";");
    const [name, value] = pair.split("=");
    if (name && value !== undefined) jar.set(name.trim(), value.trim());
  }
}
function cookieHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchWithCookies(url, opts = {}) {
  const headers = new Headers(opts.headers ?? {});
  if (jar.size > 0) headers.set("cookie", cookieHeader());
  const res = await fetch(url, { ...opts, headers, redirect: "manual" });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) storeCookies(setCookie);
  return res;
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function getCsrfToken() {
  const res = await fetchWithCookies(`${APP_URL}/api/auth/csrf`);
  if (!res.ok) throw new Error(`csrf endpoint ${res.status}`);
  const { csrfToken } = await res.json();
  return csrfToken;
}

async function login(csrfToken) {
  const body = new URLSearchParams({
    email: EMAIL,
    password: PASSWORD,
    csrfToken,
    callbackUrl: `${APP_URL}/`,
    json: "true",
  });
  const res = await fetchWithCookies(
    `${APP_URL}/api/auth/callback/credentials`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  // NextAuth returns 200 + { url } on success or 302 redirect.
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  log(`login response status=${res.status} hasUrl=${parsed?.url ? "yes" : "no"}`);
  // Validate session: hit /api/auth/session and confirm user.id present
  const sess = await fetchWithCookies(`${APP_URL}/api/auth/session`);
  const sessJson = await sess.json();
  if (!sessJson?.user?.id) {
    throw new Error(`session lacks user.id — login failed (status=${res.status} sess=${JSON.stringify(sessJson)})`);
  }
  log(`session userId=${sessJson.user.id} tenantId=${sessJson.user.tenantId ?? "null"} roles=${JSON.stringify(sessJson.user.roles)}`);
  return sessJson.user;
}

// tRPC v11 batch endpoint convention: POST /api/trpc/{procedure}?batch=1
// Body: { "0": { json: input } }
async function trpcMutation(procedure, input) {
  const url = `${APP_URL}/api/trpc/${procedure}?batch=1`;
  const body = JSON.stringify({ "0": { json: input } });
  const res = await fetchWithCookies(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`tRPC ${procedure} ${res.status}: ${text.slice(0, 500)}`);
  }
  const parsed = JSON.parse(text);
  const result = parsed[0]?.result?.data?.json;
  if (result === undefined) {
    throw new Error(`tRPC ${procedure} unexpected payload: ${text.slice(0, 500)}`);
  }
  return result;
}

async function trpcQuery(procedure, input) {
  const inputParam = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const url = `${APP_URL}/api/trpc/${procedure}?batch=1&input=${inputParam}`;
  const res = await fetchWithCookies(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`tRPC ${procedure} ${res.status}: ${text.slice(0, 500)}`);
  }
  const parsed = JSON.parse(text);
  const result = parsed[0]?.result?.data?.json;
  if (result === undefined) {
    throw new Error(`tRPC ${procedure} unexpected payload: ${text.slice(0, 500)}`);
  }
  return result;
}

async function pollUntilReady(exportId, maxSeconds = 120) {
  const start = Date.now();
  let lastStatus = null;
  while ((Date.now() - start) / 1000 < maxSeconds) {
    const s = await trpcQuery("reportExport.pollStatus", { id: exportId });
    if (s.status !== lastStatus) {
      log(`status=${s.status} ${s.errorMessage ? `error=${s.errorMessage}` : ""}`);
      lastStatus = s.status;
    }
    if (s.status === "ready") return s;
    if (s.status === "failed") throw new Error(`render failed: ${s.errorMessage}`);
    await sleep(2000);
  }
  throw new Error(`timeout after ${maxSeconds}s last status=${lastStatus}`);
}

(async () => {
  log("== Per Area Report smoke test ==");
  log(`app=${APP_URL} email=${EMAIL} areaId=${AREA_BOUNDARY_ID}`);

  log("step 1: csrf");
  const csrf = await getCsrfToken();
  log(`csrf len=${csrf.length}`);

  log("step 2: login");
  const user = await login(csrf);

  log("step 3: reportExport.create");
  const today = new Date();
  const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);
  const created = await trpcMutation("reportExport.create", {
    reportType: "area",
    paramsJson: {
      areaBoundaryId: AREA_BOUNDARY_ID,
      startDate,
      endDate,
    },
    paperSize: "A4",
  });
  log(`created exportId=${created.id} status=${created.status}`);

  log("step 4: poll until ready");
  const ready = await pollUntilReady(created.id);
  log(`render complete: fileSize=${ready.fileSizeBytes} bytes`);

  log("step 5: getDownloadUrl");
  const dl = await trpcQuery("reportExport.getDownloadUrl", { id: created.id });
  log(`downloadUrl=${dl.downloadUrl}`);
  if (!dl.downloadUrl) throw new Error("downloadUrl is null");

  log("step 6: download PDF");
  const res = await fetchWithCookies(`${APP_URL}${dl.downloadUrl}`);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(OUTFILE, buf);
  log(`downloaded ${buf.length} bytes → ${OUTFILE}`);

  // Validate PDF magic
  const magic = buf.slice(0, 4).toString("ascii");
  if (magic !== "%PDF") {
    throw new Error(`not a PDF (magic=${magic})`);
  }
  // Count Page objects — Per Area Report has 3 pages per 6.2c
  const pdfStr = buf.toString("latin1");
  const pageCount = (pdfStr.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  log(`PDF valid: magic=${magic} pageCount=${pageCount}`);

  log("==== SMOKE TEST PASS ====");
  console.log(JSON.stringify({
    pass: true,
    exportId: created.id,
    fileSizeBytes: buf.length,
    pageCount,
    downloadUrl: dl.downloadUrl,
    outfile: OUTFILE,
  }, null, 2));
})().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
