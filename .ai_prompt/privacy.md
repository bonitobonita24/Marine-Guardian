# Compliance & Data Privacy — On-Demand Authority (V32.9)

> Loaded contextually (read-on-demand, NOT auto-loaded — same posture as `security.md`).
> This file is the sole authority for compliance and data-privacy constraints (Rule 33).
> Governs HOW a framework-generated app (Next.js · tRPC · Prisma · Auth.js v5 · PostgreSQL ·
> Valkey · BullMQ · shadcn/ui) implements privacy by design. Technical security controls
> live in `security.md`; this file references them, it does not duplicate them.

---

## When to read

Read this file when:
- Any build phase generates or touches **personal data** (auth, profiles, uploads, exports, analytics, audit, consent, any user-identifying field).
- The client is **government / LGU** (PRODUCT.md gov/LGU flag = Y) — triggers the Phase 5 WCAG 2.2 AA hard gate + tightened badge claims.
- You reach the **Phase 5 accessibility gate**.
- A **data-subject request (DSR)** feature is being designed or wired.
- The Planning Assistant is capturing the PRODUCT.md **Compliance** section (gov/LGU flag · DPO · data jurisdictions).

Privacy is **privacy by design and by default** — designed in from Phase 0, never bolted on before launch (Rule 33).

---

## Primary regime — PH Data Privacy Act (RA 10173) + NPC IRR

**Law:** Republic Act No. 10173 (Data Privacy Act of 2012) + its Implementing Rules and Regulations.
**Regulator:** National Privacy Commission (NPC). Sources: privacy.gov.ph / NPC.

### Lawful basis (required BEFORE any processing)
Personal data may be processed only on a lawful basis. Determine and **record** the basis per processing activity before the first write:
- consent · contract (necessary to perform) · legal obligation · legitimate interest · vital interest (life/health) · public authority (function of a public body).
Gov/LGU apps most often rely on **legal obligation / public authority**; commercial apps on **consent / contract**. Store the chosen basis with each processing activity (see ConsentLog below).

### Consent + privacy notice at collection
- Consent must be **informed, freely given, and specific** — bundled or pre-ticked consent is invalid.
- Consent must be **evidenced/recorded** (who · what · when · which version of the notice).
- A **privacy notice** is presented **at the point of collection** — what data, why, lawful basis, retention, recipients, the data subject's rights, and how to exercise them.
- Withdrawal of consent must be **as easy as giving it** (see right to object/withdraw).

### The 6 data-subject rights → implement as APP FEATURES
Each right is a working feature, not a policy paragraph. Default route: a tRPC DSR endpoint behind Auth.js + L5 AuditLog (contract below).
1. **Right to be informed** — privacy notice at collection + accessible privacy page.
2. **Right to object / withdraw consent** — toggle/endpoint that halts the processing relying on that consent.
3. **Right to access** — the subject obtains a **copy** of their personal data (machine-readable export).
4. **Right to rectification** — correct inaccurate/outdated data.
5. **Right to erasure or blocking** — delete or block, subject to legal-retention exceptions.
6. **Right to data portability** — export in a structured, commonly-used, machine-readable format (JSON/CSV).
(Plus the **right to damages** and the **right to file complaints** with the NPC — surface contact/complaint info in the privacy notice.)

### Sensitive personal information (heightened protection)
Race/ethnicity, health, genetic, sexual life, political/religious affiliation, **government-issued IDs** (e.g. SSS/GSIS/TIN/PhilHealth), and proceedings/offenses get **heightened protection**: stricter access controls (L3 RBAC), encryption at rest, minimized retention, and explicit consent where consent is the basis. Avoid collecting SPI unless a processing activity genuinely needs it (data minimization).

### DPO · NPC registration · PIA
- **DPO:** a Data Protection Officer must be **formally appointed** and the role documented (name/contact in the privacy notice). Captured in PRODUCT.md (named or "to be appointed").
- **NPC registration:** qualifying personal-information controllers/processors **register their data processing systems** with the NPC.
- **PIA (Privacy Impact Assessment):** required for systems processing personal data — privacy by design from the start. Produce/maintain a PIA artifact for the app's processing activities.

### Breach notification — 72 hours
On knowledge of a personal-data breach (likely to cause real risk to data subjects), notify **the NPC AND the affected data subjects within 72 hours** (per **NPC Circular 16-03**); a full report follows. The app must have a **breach-notification path** wired (detection → assessment → notify NPC + subjects → record). Absence of a breach path is a gap-reminder item (Rule 33).

---

## Secondary regimes — GDPR (EU) / CCPA-CPRA (US-CA): key deltas vs PH DPA

Capture these only when a data jurisdiction in PRODUCT.md requires them. They layer ON TOP of the PH DPA baseline.

| Topic | PH DPA (primary) | GDPR (EU) delta | CCPA/CPRA (US-CA) delta |
|---|---|---|---|
| Regulator | NPC | per-member-state DPAs / EDPB | California Privacy Protection Agency |
| Lawful basis | 6 bases (as above) | 6 Art.6 bases (near-identical) | not basis-driven; notice + opt-out model |
| Breach deadline | NPC + subjects **72h** | DPA **72h**; subjects "without undue delay" | "without unreasonable delay"; AG notice thresholds |
| Core extra right | (the 6 above) | erasure/"right to be forgotten", restriction, automated-decision safeguards | **right to opt out of sale/share**, right to limit SPI use, non-discrimination |
| DPO | mandatory appointment | mandatory for certain controllers | not a DPO regime |
| Transfers | NPC rules on cross-border | adequacy / SCCs for international transfers | service-provider contract terms |

Implementation tactic: build the PH DPA baseline; add GDPR/CCPA controls as **deltas** (e.g. a "Do Not Sell/Share" toggle for CA users, SCC notes for EU transfers) rather than re-architecting.

---

## Organizing framework — ISO/IEC 27701 (PIMS)

The privacy model is organized on **ISO/IEC 27701** (Privacy Information Management System, an extension of ISO/IEC 27001):
- **Controller vs Processor** — establish which the app is per processing activity. Controller = decides purposes/means (most framework apps for their tenant data); Processor = processes on a controller's behalf (e.g. a multi-tenant platform acting for tenant-controllers). The split drives obligations, contracts, and DSR routing.
- **Controls** — PIMS adds privacy-specific controls (consent, notice, DSR handling, retention, breach, DPO) on top of the ISO 27001 ISMS controls. Map app features to these controls so the PIA and any future certification have a structure.
- 27701 is the **organizing structure**, not a claim of certification — see the badge policy below.

---

## Privacy by Design & Default — concrete patterns on OUR stack

### Prisma — ConsentLog / DataSubjectRequest / retention models (sketch)
```prisma
model ConsentLog {
  id           String   @id @default(cuid())
  tenantId     String                       // L6 tenant isolation
  userId       String
  purpose      String                       // processing activity
  lawfulBasis  LawfulBasis
  noticeVersion String                      // which privacy notice was shown
  granted      Boolean
  grantedAt    DateTime @default(now())
  withdrawnAt  DateTime?
  @@index([tenantId, userId])
}

enum LawfulBasis { CONSENT CONTRACT LEGAL_OBLIGATION LEGITIMATE_INTEREST VITAL_INTEREST PUBLIC_AUTHORITY }

model DataSubjectRequest {
  id          String      @id @default(cuid())
  tenantId    String
  userId      String
  type        DsrType                       // ACCESS RECTIFY ERASE PORT OBJECT INFORM
  status      DsrStatus   @default(RECEIVED)
  requestedAt DateTime    @default(now())
  dueAt       DateTime                       // statutory response window
  resolvedAt  DateTime?
  evidenceUrl String?                        // export artifact / action record
  @@index([tenantId, userId])
}

enum DsrType   { INFORM OBJECT ACCESS RECTIFY ERASE PORT }
enum DsrStatus { RECEIVED IN_PROGRESS COMPLETED REJECTED }

model RetentionPolicy {
  id          String  @id @default(cuid())
  tenantId    String
  entity      String                         // model/table the policy governs
  retainDays  Int                            // delete/block after N days unless legal hold
  legalHold   Boolean @default(false)
}
```
Every model carries `tenantId` (L6 guardrails). SPI fields are encrypted at rest and gated by L3 RBAC.

### tRPC — DSR endpoint contract
A single tenant-scoped, authenticated router (`dsrRouter`) — every procedure is a `protectedProcedure`, derives `userId`/`tenantId` from the session (never from input), and writes to **L5 AuditLog**:
```
dsr.access   → returns a machine-readable copy of the subject's personal data (right to access)
dsr.rectify  → validated patch of the subject's own records (right to rectification)
dsr.erase    → erase/block, honoring RetentionPolicy.legalHold + legal-retention exceptions
dsr.port     → structured JSON/CSV export (right to data portability)
dsr.object   → halt processing that relies on a withdrawn consent; flip ConsentLog.withdrawnAt
dsr.inform   → returns the current privacy notice + lawful bases per purpose
```
Contract per procedure: `{ input: Zod-strict, auth: protectedProcedure, scope: ctx.tenantId, audit: L5, response: tenantId-omitted }`. Long-running actions (full export, cascade erase) enqueue to BullMQ and update `DataSubjectRequest.status`.

### Retention / erasure jobs (BullMQ)
- A scheduled (cron) BullMQ job iterates **per tenant** (see `security.md` cron rule — no tenant-blind jobs), applies each `RetentionPolicy`, and erases/blocks expired records unless `legalHold`.
- Erasure jobs are **idempotent** and **audited** (L5). Never hard-delete records under legal hold or active DSR dispute.
- Payloads carry `tenantId` + `userId`; no PII in plaintext in the queue (see `security.md` QUEUE AND CACHE SAFETY).

---

## Data-subject-request (DSR) handling workflow

```
1. RECEIVE   → DSR created (self-service endpoint or DPO intake) → DataSubjectRequest{RECEIVED, dueAt}
2. VERIFY    → confirm requester identity (prevent DSR-as-attack: an attacker exfiltrating another user's data)
3. SCOPE     → tenant + user scoped; controller vs processor routing (processor forwards to the controller)
4. EXECUTE   → run the matching dsr.* procedure; long jobs → BullMQ; status IN_PROGRESS → COMPLETED
5. RESPOND   → deliver copy/export/confirmation within the statutory window; attach evidence (Rule 32)
6. RECORD    → L5 AuditLog entry + DataSubjectRequest.resolvedAt + evidenceUrl
```
Identity verification (step 2) is mandatory — an unauthenticated or unverified "access"/"port" request is a data-exfiltration vector.

---

## L1–L6 ↔ ISO 27701 / OWASP ASVS mapping (pointer to security.md)

Privacy controls reuse the existing L1–L6 security stack — they do not invent a parallel one:

| Layer | Security role (security.md) | ISO 27701 / privacy role |
|---|---|---|
| L1 Tenant scoping | every query scoped to `tenantId` | data isolation between controllers/data subjects |
| L2 Input validation | Zod strict, IDOR checks | data accuracy / minimization at intake |
| L3 RBAC | role-derived authorization | access control over personal & sensitive data |
| L4 Rate limiting / transport | abuse prevention, secure transport | availability + integrity of processing |
| L5 AuditLog | append-only action log | **DSR evidence, breach forensics, accountability** |
| L6 Prisma guardrails | auto tenant-injection | structural guarantee personal data stays tenant-bound |

Technical implementation of each layer (auth defaults, error handling, SSRF, supply-chain, etc.) → **see `.ai_prompt/security.md`** (the sole authority for security constraints). For the OWASP ASVS 5.0 chapter mapping per layer, see the `security.md` "L1–L6 ↔ OWASP ASVS 5.0" table.

---

## Gov/LGU client checklist (sets WCAG 2.2 AA hard gate + badge claims)

When `docs/PRODUCT.md` marks the client as **government / LGU**:
- [ ] **WCAG 2.2 AA is a HARD GATE at Phase 5** — the build cannot pass with accessibility violations (for non-gov clients the same audit runs as a non-blocking WARN). Run the accessibility check in CI; a violation fails the build.
- [ ] Privacy notice + DPO contact + NPC complaint route are present and accessible.
- [ ] Lawful basis for public-sector processing recorded (commonly legal obligation / public authority).
- [ ] Transparency: data subjects can find what is processed and why, in plain language.
- [ ] Badge claims tightened (see below) — public-sector apps must be especially honest about certification.

---

## Honest compliance-badge policy (design-claims vs held certifications)

The generated app ships a **configurable compliance footer** that is honest by construction:

**Design-claim badges — ON by default** (truthful statements about what was *designed* into the app):
- "Designed for PH Data Privacy Act (RA 10173) compliance"
- "WCAG 2.2 AA accessibility"
- "Privacy by design" / "Data-subject rights supported"

**Third-party certification badges — OFF by default; turn ON ONLY if the client actually holds the cert:**
- ISO 27001 / ISO 27701 certified · SOC 2 · a specific NPC registration number · any audited certification.

Rule: **a design-claim is NOT a held certification.** The framework never fabricates a certification the client cannot evidence. The footer keeps the two groups visibly separate. Each badge is a config flag (default ON for design-claims, default OFF for certs); enabling a cert badge requires the client to supply the certificate/registration number.
