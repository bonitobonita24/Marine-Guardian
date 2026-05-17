// Non-tRPC: manual auth required (security.md L11).
// Server-Sent Events (SSE) stream of per-user notification events.
//
// Subscribes the caller to the Valkey pub/sub channel
//   tenant:{ctx.tenantId}:user:{ctx.userId}:notifications
// published by the alerts processor in @marine-guardian/jobs. Each Redis
// PUBLISH becomes a single `event: notification.created` SSE frame to the
// browser. The notification row in Postgres is the durable source of truth;
// SSE is best-effort fan-out (clients reconcile missed events via Last-Event-ID
// replay on reconnect — implemented in SSE-2/SSE-3).
//
// Lifecycle:
//   1. requireRouteAuth() — 401 on missing session/tenant
//   2. Create a ReadableStream whose `start` enqueues the opening comment and
//      registers a Valkey subscription
//   3. Each pub/sub message → enqueue `event: ... \n data: ... \n id: ... \n\n`
//   4. Heartbeat comment every HEARTBEAT_INTERVAL_MS keeps the connection
//      alive through proxies/load balancers (default 30s)
//   5. `cancel` (browser closed, navigated away, network drop) → clear
//      heartbeat timer, call subscription.unsubscribe() to release Redis conn

import { type NextRequest, NextResponse } from "next/server";

import { requireRouteAuth, RouteAuthError } from "@/server/lib/route-auth";
import { subscribeToChannel } from "@/server/lib/realtime-subscriber";

const HEARTBEAT_INTERVAL_MS = 30_000;

// Force Node.js runtime — ioredis is not edge-compatible and Vercel Edge has
// short execution limits that would cap SSE connection duration prematurely.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notificationChannel(tenantId: string, userId: string): string {
  return `tenant:${tenantId}:user:${userId}:notifications`;
}

function sseFormatEvent(eventName: string, data: unknown, id?: string): string {
  const dataLine = `data: ${JSON.stringify(data)}\n`;
  const eventLine = `event: ${eventName}\n`;
  const idLine = id !== undefined ? `id: ${id}\n` : "";
  return `${eventLine}${dataLine}${idLine}\n`;
}

export async function GET(_req: NextRequest): Promise<Response> {
  let ctx;
  try {
    ctx = await requireRouteAuth();
  } catch (e) {
    if (e instanceof RouteAuthError) return e.response;
    throw e;
  }

  const channel = notificationChannel(ctx.tenantId, ctx.userId);
  const encoder = new TextEncoder();

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let subscription: { unsubscribe: () => Promise<void> } | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Opening comment — flushes headers and confirms the stream is live.
      controller.enqueue(encoder.encode(": connected\n\n"));

      try {
        subscription = await subscribeToChannel({
          channel,
          onMessage: (payload: unknown) => {
            if (closed) return;
            const id =
              payload !== null &&
              typeof payload === "object" &&
              "id" in payload &&
              typeof payload.id === "string"
                ? payload.id
                : undefined;
            const eventName =
              payload !== null &&
              typeof payload === "object" &&
              "type" in payload &&
              typeof payload.type === "string"
                ? payload.type
                : "notification.created";
            try {
              controller.enqueue(
                encoder.encode(sseFormatEvent(eventName, payload, id)),
              );
            } catch {
              // controller may have been closed concurrently — safe to ignore
            }
          },
          onError: () => {
            // Best-effort: log via console (server-side only). Don't terminate
            // the stream on a single bad payload.
          },
        });
      } catch {
        // If subscription setup fails, close the stream cleanly so the client
        // reconnects rather than hanging.
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
        return;
      }

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // controller closed; cleanup will run via cancel
        }
      }, HEARTBEAT_INTERVAL_MS);
    },

    async cancel() {
      closed = true;
      if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (subscription !== null) {
        await subscription.unsubscribe();
        subscription = null;
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Disable nginx response buffering — proxies will hold SSE frames
      // until a buffer fills otherwise.
      "X-Accel-Buffering": "no",
    },
  });
}
