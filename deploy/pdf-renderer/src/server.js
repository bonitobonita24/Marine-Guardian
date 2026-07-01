// marine-guardian-pdf-renderer — standalone HTTP service.
//
// Consumed by the @marine-guardian/jobs pdf-render BullMQ worker
// (Phase 8 Batch 5 Sub-batch 5.3b). The worker POSTs to /render with the
// X-PDF-Renderer-Token header. This service launches headless Chromium via
// Puppeteer, navigates to the supplied printUrl (an authenticated /_print/*
// URL on the web app), waits for network idle, then returns the rendered
// PDF as application/pdf bytes.
//
// Auth: every /render request MUST present a matching X-PDF-Renderer-Token
// header (constant-time compare). The /health endpoint is open for
// container healthcheck and joins the same internal Docker network as the
// web app — no external port exposure.
//
// Concurrency + rate limiting is enforced UPSTREAM by the BullMQ worker
// (5.3b: concurrency=2, limiter={max:5, duration:1000}). This service
// processes one request at a time per process; scale by running multiple
// container replicas behind a load balancer if throughput demands it.

import http from "node:http";
import puppeteer from "puppeteer-core";

const PORT = Number(process.env.PORT ?? "4000");
const SERVICE_TOKEN = process.env.PDF_RENDERER_SERVICE_TOKEN ?? "";
const CHROMIUM_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium";
// Raised 30s→120s (owner 2026-07-01): full-length portrait reports (all events/patrols,
// multi-hundred pages) render well under 30s when filtered, but a large/unfiltered tenant
// can approach the ceiling — 120s gives safe margin. Override per-env via PDF_NAV_TIMEOUT_MS.
const NAV_TIMEOUT_MS = Number(process.env.PDF_NAV_TIMEOUT_MS ?? "120000");

if (!SERVICE_TOKEN || SERVICE_TOKEN.length < 32) {
  console.error(
    "[pdf-renderer] PDF_RENDERER_SERVICE_TOKEN must be set to a value of at least 32 characters",
  );
  process.exit(1);
}

/**
 * Constant-time string compare. Mirrors apps/web/src/server/lib/service-token-guard.ts.
 * Cannot use node:crypto.timingSafeEqual here because the two strings may
 * differ in length and timingSafeEqual throws on length mismatch.
 */
function verifyToken(presented) {
  if (!presented || presented.length !== SERVICE_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < SERVICE_TOKEN.length; i++) {
    diff |= presented.charCodeAt(i) ^ SERVICE_TOKEN.charCodeAt(i);
  }
  return diff === 0;
}

function send(res, status, contentType, body) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function handleRender(req, res) {
  const presented = req.headers["x-pdf-renderer-token"];
  const headerVal = Array.isArray(presented) ? presented[0] : presented;
  if (!verifyToken(headerVal ?? null)) {
    send(res, 401, "application/json", JSON.stringify({ error: "unauthorized" }));
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    send(
      res,
      400,
      "application/json",
      JSON.stringify({ error: "invalid_json", message: String(err) }),
    );
    return;
  }

  const { printUrl, paperSize, landscape, exportId } = body;
  if (typeof printUrl !== "string" || !printUrl.startsWith("http")) {
    send(
      res,
      400,
      "application/json",
      JSON.stringify({ error: "invalid_printUrl" }),
    );
    return;
  }
  if (paperSize !== "A4" && paperSize !== "Letter" && paperSize !== "Legal") {
    send(
      res,
      400,
      "application/json",
      JSON.stringify({ error: "invalid_paperSize" }),
    );
    return;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      "X-PDF-Renderer-Token": SERVICE_TOKEN,
    });
    await page.goto(printUrl, {
      waitUntil: "networkidle0",
      timeout: NAV_TIMEOUT_MS,
    });
    // Optional render-ready signal — Coverage Report Page 2 (6.1b) sets
    // window.__renderReady = true after Leaflet tile load + polygon paint.
    // Pages without a map never set this flag; the catch swallows the
    // timeout so they continue rendering immediately after networkidle0.
    // Decision: docs/DECISIONS_LOG.md → "Coverage Report Page 2 Map
    // Render Strategy".
    await page
      .waitForFunction(() => window.__renderReady === true, { timeout: 8000 })
      .catch(() => {
        /* page does not advertise a render-ready flag — proceed */
      });
    const pdfBuffer = await page.pdf({
      format: paperSize,
      landscape: Boolean(landscape),
      printBackground: true,
      preferCSSPageSize: true,
    });
    console.log(
      `[pdf-renderer] rendered export=${String(exportId)} size=${String(pdfBuffer.length)} bytes`,
    );
    send(res, 200, "application/pdf", pdfBuffer);
  } catch (err) {
    console.error("[pdf-renderer] render failed:", err);
    send(
      res,
      500,
      "application/json",
      JSON.stringify({
        error: "render_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {
        /* ignore close errors */
      });
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, "application/json", JSON.stringify({ status: "ok" }));
    return;
  }
  if (req.method === "POST" && req.url === "/render") {
    handleRender(req, res).catch((err) => {
      console.error("[pdf-renderer] unhandled error:", err);
      if (!res.headersSent) {
        send(res, 500, "application/json", JSON.stringify({ error: "internal" }));
      }
    });
    return;
  }
  send(res, 404, "application/json", JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, () => {
  console.log(`[pdf-renderer] listening on :${String(PORT)}`);
});

function shutdown(signal) {
  console.log(`[pdf-renderer] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
