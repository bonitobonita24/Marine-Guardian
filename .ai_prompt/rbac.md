# Tenant RBAC Standard — On-Demand Authority (V32.25 — Rule 34)

> Loaded contextually (read-on-demand, NOT auto-loaded — same posture as `security.md` / `privacy.md`).
> This file is the sole authority for the **tenant RBAC standard** every tenant-based framework app
> inherits (Rule 34): the fixed 3-tier system-role backbone AND the tenant-scoped custom-role
> permission-matrix builder. Governs HOW a framework-generated app (Next.js · tRPC · Prisma ·
> Auth.js v5 · PostgreSQL · shadcn/ui) models roles, enforces permissions, and lets a tenant owner
> build their own sub-roles. Technical security controls live in `security.md` (L1–L6); this file
> references them (esp. **L3 RBAC**), it does not duplicate them.
>
> ⚠️ **DESIGN / REFERENCE, not running app code.** The 3-tier backbone is a scaffold DEFAULT
> (Phase 0/4) and has a proven retrofit playbook (Scenario 42). The **custom-role matrix layer**
> below is authored ONCE at framework level as the standard DESIGN so every app inherits the same
> builder — it is implemented **per app at scaffold or next substantial touch**, under the deploy
> HARD HOLD (LOCAL commits only; no staging/prod without the owner's explicit word). Do not build
> running matrix code into any app from this file alone.

---

## When to read

Read this file when:
- Any build phase generates or touches **auth, roles, RBAC, user management, or tenant onboarding**.
- `docs/PRODUCT.md` **Roles & Permissions** section (§5) is populated and you are deriving the schema.
- A **role-builder / custom-role** feature is being designed or wired (tenant_superadmin screen).
- You are **retrofitting** the 3-tier backbone onto an existing tenant-based app → follow **Scenario 42**.
- You reach a phase that seeds accounts (Phase 4 Part 3 seed) or wires route/nav/tRPC authorization.

Reference impl (3-tier backbone, proven, data-preserving): Marine-Guardian branch
`feat/tenant-rbac-3tier` (enum RENAME + partial-unique index + succession + user-mgmt widening + tests).

---

## Part A — The 3-tier system-role backbone (FIXED, enum-based)

Every tenant-based app ships exactly three **fixed system tiers** at the top of its `UserRole` enum.
These are enum values (not matrix-driven) — they are the framework constant. Below them sit the app's
own **domain roles** (coordinator/operator/viewer or whatever the app calls them), which is where the
custom-role matrix (Part B) applies.

### Capability matrix (verbatim owner spec + MG-proven enum names)

| Capability | `tenant_manager` (platform) | `tenant_superadmin` (tenant owner, 1/tenant) | `tenant_admin` (delegated) | domain roles (coordinator/operator/viewer/custom) |
|---|:--:|:--:|:--:|:--:|
| Create / manage / impersonate tenants | ✅ | — | — | — |
| Billing (when the app has it) | platform | ✅ own tenant | ❌ | ❌ |
| User Management (create admins + assign roles + build custom roles) | ✅ any tenant | ✅ own tenant | ❌ | ❌ |
| All app features (read/write) | ✅ | ✅ | ✅ | scoped by the role_permissions matrix |

- **`tenant_manager`** — the platform operator. `tenant_id = NULL` (cross-tenant). Creates/manages
  tenants, break-glass reassigns a tenant's owner. Multiple platform managers are allowed.
- **`tenant_superadmin`** — the tenant's owner. **Exactly ONE per tenant**, enforced at the DB layer
  by a partial-unique index (below). The tenant's first/main admin; the only in-tenant role that may
  do Billing + User Management + **build/assign custom roles**.
- **`tenant_admin`** — the first delegated admin created by the owner. All app features EXCEPT Billing
  and User Management (deliberately excluded from `userManagementProcedure`).
- **domain roles** — everything below `tenant_admin`. These are where custom roles live and where the
  `role_permissions` matrix governs access (Part B).

### Enum + one-owner-per-tenant constraint (the proven, data-preserving mechanic)

```prisma
enum UserRole {
  tenant_manager      // platform operator (tenant_id NULL)
  tenant_superadmin   // tenant owner — exactly ONE per tenant (partial-unique index)
  tenant_admin        // delegated admin — all features EXCEPT Billing + User Management
  // ── app domain roles below (rename freely; these are examples) ──
  coordinator
  operator
  viewer
}
```

```sql
-- Exactly one owner per tenant. The platform manager (tenant_id NULL) is exempt,
-- so multiple platform managers remain allowed.
CREATE UNIQUE INDEX "one_tenant_superadmin_per_tenant"
  ON users (tenant_id)
  WHERE role = 'tenant_superadmin' AND tenant_id IS NOT NULL;
```

For an **existing** app, NEVER DROP/CREATE the enum (that loses every user's role). Rename in place with
`ALTER TYPE "UserRole" RENAME VALUE '<old>' TO '<tier>'` (data-preserving) — full executable steps in
**Scenario 42**.

### User-management gate

`userManagementProcedure` = `tenant_manager` + `tenant_superadmin` ONLY. `tenant_admin` is
**deliberately never added to it**. `/users` and `/settings` routes gate to those same two tiers.

### Succession contract (MANDATORY, both directions — the one-owner index is never violated mid-transfer)

1. **Break-glass reassign (platform):** a `tenant_manager` reassigns a tenant's `tenant_superadmin`
   (e.g. a lost/departed owner) — reassigns the account, **audited** (L5). Rejects a non-existent tenant
   → `NOT_FOUND`. Lives in a separate platform router (`platformUser.updateRole`).
2. **Owner transfer:** the current owner promotes another user to `tenant_superadmin` and demotes self.
   Because the partial-unique index forbids two owners at once, the swap is **mediated —
   promote-then-demote inside one transaction** (or demote-then-promote), never a naive double-write that
   would trip the index. Both directions are covered by unit tests in the auth scaffold.

---

## Part B — The custom-role permission-matrix (tenant-scoped, data-driven, DESIGN)

The 3 top tiers are fixed. Everything at `tenant_admin`-and-below is governed by a **data-driven
permission matrix** so a tenant owner can build sub-roles as narrow or as broad as the tenant needs —
without a code change. This is the framework's ONE custom-role builder, inherited identically by every app.

### B1 — The Feature Registry (each app declares its gatable modules)

Every app declares an **enumerable list of gatable features/modules** — the vocabulary both the matrix and
the role-builder UI read. Two valid forms; pick per app:
- **Compile-time enum / typed const** (`FEATURE_KEYS = ['patrols','reports','events',…] as const`) — simplest,
  type-safe, best when the module set is stable and app-owned.
- **`feature_registry` table** — when features are dynamic/tenant-configurable:

```prisma
model FeatureRegistry {
  id       String  @id @default(cuid())
  key      String  @unique          // stable machine key, e.g. "patrols"
  label    String                   // human label for the role-builder UI
  category String?                  // optional grouping for the matrix UI
  isActive Boolean @default(true)
}
```

Rule: a feature the matrix references MUST exist in the registry, and the role-builder UI renders its rows
**from the registry** (never a hardcoded list). This keeps matrix, enforcement, and UI in lockstep.

### B2 — The `role_permissions` matrix table (STRICT CRUD split)

```prisma
model CustomRole {
  id        String   @id @default(cuid())
  tenantId  String                       // tenant-scoped — L6 guardrails
  name      String                       // owner-chosen, mapped onto a preset (B5)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  @@unique([tenantId, name])
  @@index([tenantId])
}

model RolePermission {
  id         String  @id @default(cuid())
  tenantId   String                      // tenant-scoped — L6 guardrails
  roleId     String                      // → CustomRole.id
  featureKey String                      // → FeatureRegistry.key
  view       Boolean @default(false)     // can see / read
  write      Boolean @default(false)     // CREATE only (add new records)
  update     Boolean @default(false)     // EDIT only (modify existing)
  delete     Boolean @default(false)     // remove records
  @@unique([tenantId, roleId, featureKey])
  @@index([tenantId, roleId])
}
```

- **4 permissions, STRICT CRUD split:** `view` · `write` (create-only) · `update` (edit-only) · `delete`
  are **separate columns**. Write ≠ Update on purpose — a role can create records but not edit existing
  ones, or edit but never create. **Deny-by-default:** absent row / all-false = no access.
- A custom role can be as narrow as **View-only on one feature**.
- Every row carries `tenantId` (custom roles never leak across tenants — L6). `CustomRole.name` is
  owner-chosen; the app maps it onto a preset (B5) for a sensible starting matrix, never a forced rename.

### B3 — Matrix-driven enforcement (one resolver, three surfaces — mirrors MG's proven 3-surface pattern)

A single resolver reads the matrix; wire it identically at all three enforcement surfaces. **Deny-by-default**
everywhere. The 3 fixed tiers short-circuit to allow (they are not matrix-governed); everything at
`tenant_admin`-and-below resolves through the matrix.

```ts
// Pseudocode — the ONE authority both server and UI consult.
async function hasPermission(ctx, featureKey, action /* 'view'|'write'|'update'|'delete' */) {
  if (ctx.role === 'tenant_manager' || ctx.role === 'tenant_superadmin' || ctx.role === 'tenant_admin')
    return true;                                   // fixed tiers — full app access
  const perm = await db.rolePermission.findUnique({
    where: { tenantId_roleId_featureKey: { tenantId: ctx.tenantId, roleId: ctx.roleId, featureKey } },
  });
  return Boolean(perm?.[action]);                  // deny-by-default: no row → false
}
```

1. **tRPC procedures** — a `matrixProcedure(featureKey, action)` factory (a `protectedProcedure` +
   the resolver) gates every mutation/query. Never trust a role/permission from client input — derive
   `role`/`roleId`/`tenantId` from the session (L3 + L1).
2. **Route middleware** — deny-by-default prefixes: a route maps to `(featureKey, 'view')`; no view → redirect.
3. **Sidebar nav** — menu items filtered by `hasPermission(feature, 'view')`. Nav is **rendered from the
   matrix**, never a hardcoded enum switch (see `ui-rules.md` pointer).

The three surfaces read the SAME resolver so nav can never show what tRPC would forbid, and vice-versa.

### B4 — Role-builder UI spec (tenant_superadmin-only)

A screen where the tenant owner builds sub-roles:
- **Checklist matrix:** features (from the Feature Registry) down the side; the **4 permissions
  (View · Write · Update · Delete) across the top**; a checkbox per cell. Save writes `role_permissions`.
- Create/rename a role, clone from a **preset** (B5) as a starting matrix, then tighten/loosen per feature.
- **shadcn/ui only** (Data Table / Checkbox / Form + React Hook Form + Zod). Read cue paired with
  `accessibility-agents` (WCAG 2.2 AA — hard gate for gov/LGU) + `ui-rules.md`. See `ui-rules.md` pointer.

### B5 — Sub-role presets (capability templates — NEVER a forced rename)

Ship four presets as **starting matrices** the owner clones and maps onto the app's own domain names.
Presets are conveniences, not fixed roles — an app keeps its domain vocabulary (e.g. MG keeps
`field_coordinator` / `operator` / `viewer`) and maps a preset onto each:

| Preset | Typical matrix shape | Maps onto (example) |
|---|---|---|
| **Supervisor** | view + write + update across most features; delete on some; no User-Mgmt/Billing | team lead / field_coordinator |
| **Operator** | view + write + update on operational features; no delete | day-to-day staff / operator |
| **Contributor** | view + write (create-only) on assigned features; no update/delete | data-entry / enumerator |
| **Viewer** | view-only, read-only across granted features | read-only / viewer |

---

## Part C — Guardrails (custom roles can never escalate)

Non-negotiable — enforce in the role-builder AND server-side:
- **Tenant-scoped.** Every `CustomRole` / `RolePermission` carries `tenantId`; a custom role is invisible
  and inapplicable outside its tenant (L6 guardrails guarantee it structurally).
- **Below the `tenant_admin` ceiling.** A custom role can never grant more than `tenant_admin` holds.
  It is always strictly a subset of app-feature access — never a system tier.
- **NEVER Billing or User Management.** Those are exclusive to `tenant_superadmin` (own tenant) and
  `tenant_manager` (platform). The role-builder must not even expose them as gatable features; the server
  rejects any attempt to grant them.
- **Only tenant_superadmin (+ platform tenant_manager) build/edit/assign custom roles.** `tenant_admin`
  and below can neither create roles nor assign them (that is User Management, which they lack).
- **Deny-by-default, server-enforced.** Absent matrix row = no access. Enforcement is server-side from the
  matrix; the UI filter is convenience, never the security boundary.

---

## Part D — Credential model (reference the vault — never paste values)

The 3-tier default login accounts follow the canonical, already-vaulted scheme. **`tenant_manager` is a
single universal platform account across all envs; `tenant_superadmin` + `tenant_admin` are per-environment
defaults.** Values live ONLY in the vault — never in a repo, never in this file:

**Sole source:** `Server-Setups/secrets/universal-login-credentials.enc.yaml` (SOPS+age; nested, keyed
role × env). Describe the model in prose and point here; do not duplicate the table as an authority.

| Env | tenant_manager (universal) | tenant_superadmin | tenant_admin |
|---|---|---|---|
| local_dev | platform account | dev owner account | dev admin account |
| staging_prod | platform account | prod owner account | prod admin account |
| demo | platform account | demo owner account | — (none) |

Operational footnote: the vault schema is **nested 3 levels** (`["local_dev"]["tenant_superadmin"]["username"]`).
Some `sops` versions error on a 3-level `--extract` → **decrypt-whole + parse** instead. Passwords are set via
bcrypt (feed plaintext via file/stdin, never shell argv — special chars) and mirrored to the vault. Seed reads
passwords from env (`.env.{env}`) — never hardcoded (see `templates.md` seed + `.env` cred-key templates).

---

## Framework inheritance

- **Rule 34** (`Master_Prompt.md` / `CLAUDE_compact.md`) references this file, exactly as Rule 33 references
  `privacy.md`.
- **Scenario 42** (`scenarios.md`) is the executable retrofit playbook for an existing app.
- **`security.md` L3 (RBAC)** carries the enforcement summary + guardrails.
- **`Security_Checklist.md` §21** verifies the standard (one-owner index, matrix deny-by-default, no
  Billing/User-Mgmt in custom roles, succession).
- **`phases.md` Phase 0/4** seed the backbone by default; **`templates.md`** carries the seed + `.env` templates.
- **`LESSONS_REGISTRY.md`** (`framework.rbac.tenant-3tier-and-custom-role-matrix`) keeps the standard from regressing.
</content>
</invoke>
