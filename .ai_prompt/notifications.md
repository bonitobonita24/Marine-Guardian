# Event Delivery & Notifications — on-demand reference (V32.28, deliverable #30)

> **Load this file ONLY when the app being built actually needs it.** Read it when
> `docs/PRODUCT.md` declares a **multi-channel notification / event-delivery** need (e.g. "notify
> users by email + push", "send SMS alerts", "webhooks to external systems", "in-app notification
> center", "event-driven side-effects across services"). An app with no such need NEVER loads this,
> and the locked default stack is untouched. This is a **CONDITIONAL capability**, not a default.
>
> **INHERIT-not-REPLACE:** where `docs/PRODUCT.md` / `docs/DESIGN.md` / a project decision defines a
> concrete channel, provider, or SLA, that wins. This file is the standard *pattern* to fill silence.

This is the fleet-standard, **right-sized, FOSS** way to build a multi-channel event delivery /
notification capability on the locked stack — **without Kafka's operational tax**. It is a library-
agnostic architecture reference: the *shape* is fixed; the exact channels/providers are per-app.
Global rule of record: `~/.claude/rules/` (fleet infra) + this deliverable. Companion:
`security.md` (L5 AuditLog), `privacy.md` (Rule 33, PII routing), `templates.md` (NATS opt-in +
compose), Scenario 43 (the build procedure).

---

## 0. The core principle — right-size, don't over-build

The canonical "Event Delivery System" reference architecture (producers → ingestion → streaming log →
processing/routing → multi-channel delivery → cross-cutting monitoring) is CORRECT, but its Kafka-style
streaming layer is **enterprise-scale** and over-engineered for Powerbyte-scale tenant SaaS. We keep
every FEATURE and drop the tax by using infra already in the locked stack.

### The FOSS tier ladder (start minimal, extend later)
- **Tier 1 — DEFAULT (zero new infra; already in the locked stack):**
  **Valkey Streams** (the durable append-only event log — AOF-persisted, consumer groups, per-stream
  ordering, `XACK` + pending-entries-list for at-least-once, `XAUTOCLAIM` for dead consumers) +
  **BullMQ** (processing/routing + retry/backoff + DLQ + per-provider rate-limit + delayed/scheduled).
  This matches essentially every feature of the reference diagram at fleet scale. **Use this unless a
  documented threshold forces otherwise.**
- **Tier 2 — GRADUATION (opt-in, only when Tier 1 is outgrown):**
  **NATS JetStream** (Apache-2.0, single Go binary, CNCF, low ops) — real streaming + subject routing +
  replay; the true "almost-Kafka, no tax, fully FOSS." See `templates.md` → "OPT-IN: NATS JetStream".
  **Graduation trigger (document it in `docs/DECISIONS_LOG.md`):** sustained high throughput OR many
  independent consumer groups OR replay/retention that strains Valkey memory.
- **NOT chosen:** Kafka / Redpanda (Redpanda is BSL, not fully FOSS; both are heavy) — reserve for a
  hypothetical true massive-scale multi-consumer streaming need (not on any current roadmap). The only
  Kafka advantage forgone is extreme horizontal throughput, which the fleet does not need.

### Kafka feature → our FOSS stack (parity map)
| Kafka feature | Tier 1 (Valkey Streams + BullMQ) | Tier 2 (NATS JetStream) |
|---|---|---|
| Durable append-only log | Redis Streams, AOF persisted | JetStream file store |
| Partition by key | N streams sharded by key-hash | subjects + partitioned consumers |
| Ordering per key | per-stream ordering | per-subject ordering |
| Consumer groups | `XREADGROUP` groups | durable / queue consumers |
| At-least-once + ack | `XACK` + PEL | ack + redelivery |
| Retry / backoff | BullMQ retry + backoff | max-deliver + backoff |
| Dead-letter queue | BullMQ failed set / DLQ stream | max-deliver → DLQ subject |
| Replay / offset | `XRANGE` from ID | replay by seq / time |
| **Ops tax** | **ZERO (already run Valkey)** | **low (one binary)** |

---

## 1. The architecture (mapped to the locked stack)

```
PRODUCERS      Next.js/tRPC apps · BullMQ workers · external systems (webhook) · Expo
               Every event stamped AT EMIT:
               { event_id (idempotency), tenant_id, type, schema_version, actor, ts, correlation_id }
   │
INGESTION      Shared emitEvent() lib  OR  tRPC/HTTP ingestion endpoint
               • Auth (Auth.js, TENANT-SCOPED)   • Zod validation per event type (= schema registry)
               • Enrich (tenant, ts, correlation_id)   • Idempotency stamp AT ENTRY (event_id)
   │
STREAMING/LOG  Tier 1 = Valkey Streams (one stream per event-type; shard by key/tenant)
               • durable append-only · consumer groups · per-stream ordering · decouples prod↔cons
   │
PROCESSING &   BullMQ workers
ROUTING        • filter / transform / enrich
               • routing rules: event × TENANT × user PREFERENCES → which channels
               • idempotency/dedup (Valkey SET NX on event_id)
               • retry + backoff + DLQ
               • cross-channel dedup (don't email AND push AND sms the same thing)
   │
DELIVERY       Per-channel BullMQ queues + provider adapter + PER-PROVIDER RATE LIMIT
               Email(SES/SendGrid/SMTP) · Push(Expo→FCM/APNs, locked stack) ·
               SMS(Twilio/SNS or PH-local gw) · Webhook(HMAC-signed, retried) ·
               In-App(WebSocket/SSE + DB row) · Telegram(fleet default bot)
   │
CROSS-CUTTING  Monitoring & Reliability
               • Metrics (throughput/latency) via BullMQ + Uptime-Kuma / Prometheus
               • Logging/tracing: correlation_id end-to-end · L5 AuditLog (security.md)
               • Alerts: Telegram (swarm-alert pattern) on DLQ growth / channel failure
               • DLQ: BullMQ failed set + dead-letter stream + a REPLAY tool
               • Security: tenant-scoped ingestion auth · per-tenant isolation ·
                 HMAC-signed webhooks · secrets in Server-Setups SOPS
```

---

## 2. The 6 mandatory additions (the reference diagram omits these — always include)

1. **Event schema + versioning.** A Zod contract per event type = a lightweight schema registry;
   `schema_version` on every event so a producer change can't silently break a consumer.
2. **Tenant isolation (HARD).** `tenant_id` on every event; routing/delivery NEVER cross tenants
   (shared-schema + tenant_id, the framework default; see `rbac.md`). A cross-tenant delivery is a
   security defect, not a bug.
3. **Notification preferences.** Per-user/per-tenant preference table + quiet hours + cross-channel
   dedup. A real notification product is not complete without this.
4. **Idempotency at INGESTION** (not only processing) — stamp `event_id` at entry so the WHOLE
   pipeline can dedup.
5. **Per-provider rate limits.** SES/Twilio/FCM all throttle; use BullMQ's rate-limiter per channel
   queue.
6. **PII / compliance routing.** Event payloads carrying PII (gov/LGU — see `privacy.md` Rule 33,
   RA 10173) stay internal; never forward PII to an external/free tier. Same sensitivity discipline as
   the fleet free-LLM rule. Minimize PII in event payloads (carry IDs, resolve at delivery).

---

## 3. Delivery-channel guidance (pick per `docs/PRODUCT.md`)
- **Email** → SES / SendGrid / SMTP; transactional templates; DKIM/SPF; bounce handling.
- **Push** → **Expo Push** (locked stack — wraps FCM/APNs); device-token table + invalidation.
- **SMS** → Twilio / AWS SNS internationally, OR a PH-local gateway (e.g. Semaphore/Movider) when
  cost/deliverability in PH matters — an owner `[WHAT]` per app.
- **Webhook** → signed HTTP callbacks (**HMAC** with a per-subscriber secret), retries + DLQ, a
  delivery-attempt log for the subscriber to inspect.
- **In-App** → persist a notification row (DB) + real-time via WebSocket/SSE or Valkey pub/sub; a
  read/unread model; the in-app center reads the same row.
- **Telegram** → the fleet default bot for internal/ops notifications (`~/.claude/rules/` Telegram).

---

## 4. Hard "do NOT"s
- ❌ Don't stand up Kafka/Redpanda by default — start Tier 1; graduate to NATS only at the documented
  threshold.
- ❌ Don't let an event cross tenants (isolation is a security invariant).
- ❌ Don't forward PII to an external/free tier (RA 10173 — `privacy.md`).
- ❌ Don't make a synchronous delivery call on the request path — always enqueue (BullMQ) so provider
  latency/rate-limits never hit the user.
- ❌ Don't skip idempotency + DLQ — they are the reliability floor, not optional extras.
- ❌ Don't over-build channels PRODUCT.md didn't ask for — add channels as the spec grows.

---

## 5. Build procedure
Follow **Scenario 43 — "Add multi-channel event delivery / notifications"** in `scenarios.md`
(dev-first, LOCAL-only, HARD HOLD). Phased: MVP (`emitEvent()` + one Valkey Stream + one BullMQ
processor + 2 channels [email + in-app] + DLQ + L5 audit) → expand channels + preference center +
rate limits → (only if needed) graduate the log Valkey → NATS at the documented threshold. Every
stage is schema-validated + tenant-isolated + audited.
