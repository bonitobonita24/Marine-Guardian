# Tenant RBAC — 3-Tier Role Model + Credential Override (owner-set 2026-07-10)

Standing tenant-based RBAC model for MG (generalizes to every tenant-based Powerbyte app).
Supersedes the 2026-07-07 "Users+Settings = super_admin only" decision.

## Role hierarchy + capability matrix

| Capability | `tenant_manager` (platform) | `tenant_superadmin` (owner, 1/tenant) | `tenant_admin` (delegated) | lower (coordinator/operator/viewer) |
|---|:--:|:--:|:--:|:--:|
| Create/manage/impersonate tenants | ✅ | — | — | — |
| Billing (when app has it) | platform | ✅ own tenant | ❌ | ❌ |
| User Management (create admins + roles) | ✅ any | ✅ own tenant | ❌ | ❌ |
| All app features (read/write) | ✅ | ✅ | ✅ | scoped |

- **`tenant_superadmin`**: exactly ONE per tenant (DB partial-unique `unique(tenant_id) where role='tenant_superadmin'`).
  The tenant's very first/main admin. Highest role WITHIN a tenant. Succession: platform `tenant_manager` can
  reassign (break-glass for a lost owner) + owner can transfer ownership (promote another, demote self).
- **`tenant_admin`**: first child admin created by the owner; all features EXCEPT Billing + User Management.

## Enum rename (data-preserving)
`ALTER TYPE "UserRole" RENAME VALUE` ×3: `super_admin`→`tenant_manager`, `site_admin`→`tenant_superadmin`,
`administrator`→`tenant_admin`. Existing users keep their (renamed) role automatically. `field_coordinator`/
`operator`/`viewer` unchanged. Then rename ~46/30/25 code literals (rbac.ts procedures, middleware.ts,
sidebar.tsx, seed, tests). `userManagementProcedure` = tenant_manager + tenant_superadmin. `/users`+`/settings`
route access = tenant_manager + tenant_superadmin (reverses 2026-07-07 super_admin-only lock).

## Default login accounts per env (values in Server-Setups vault ONLY — never repo)
| Env | tenant_manager (universal) | tenant_superadmin (1/tenant `ph`) | tenant_admin |
|---|---|---|---|
| local dev | tenantadmin@powerbyteitsolutions.com | webmaster@localhost.com | admin@admin.com |
| staging/prod | tenantadmin@powerbyteitsolutions.com | webmaster@powerbyteitsolutions.com | admin@admin.com |
| demo | tenantadmin@powerbyteitsolutions.com | admin@demo.com | — (none) |

## Existing ph-user normalization (to satisfy 1-owner constraint)
- tenantadmin@… → tenant_manager (platform). webmaster@<env> super_admin → **tenant_superadmin** on ph.
- admin@admin.com NEW → tenant_admin on ph (dev + stg/prod). JosephD@bluealliance.earth administrator → tenant_admin (keep).
- RETIRE (deactivate): admin@mail.com (superseded), admin@demo-site.local (.local placeholder), webmaster@marine-guardian.local (demo old cross-seed).

## Sequencing (deploy gated — never auto)
1. DEV: branch → migration + code rename + constraint + succession + tests → apply to dev DB (roles/creds) → full gate + Visual QA. LOCAL only.
2. STAGING (owner word): ship image → migration runs (renames enum on staging) → apply creds → validate via staging data-first gate.
3. PROD (owner word): promote verified image → migration → apply creds → health verify. Back up first.
4. DEMO (owner word): promote → migration → apply creds (admin@demo.com owner; no tenant_admin) → NEVER reseed.
Passwords set via bcryptjs (special chars — feed plaintext via file/stdin, never shell argv) + mirrored to vault.
