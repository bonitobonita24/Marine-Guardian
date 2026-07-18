/**
 * seed-cms-only.ts
 *
 * Standalone runner for JUST the CMS content backfill (seedCms) — the DocPage
 * (cms_doc_pages) + ShowcaseField (cms_showcase_fields) rows sourced from the
 * committed `apps/web/content/docs/**\/*.mdx` tree + the /showcase text
 * literals. Unlike `pnpm db:seed` (prisma/seed.ts) this does NOT touch
 * municipalities, tenants, users, or the SEED_DEV_ACCOUNTS-gated dev logins —
 * so it is safe to run against staging/prod to first-populate the docs CMS
 * without seeding any operational or dev-only data.
 *
 * `seedCms` is idempotent (every write is an upsert on slug/key). Its `update`
 * branch OVERWRITES bodyMarkdown/value from the repo, so this is a
 * FIRST-POPULATE tool: once an env's docs/showcase copy is edited live in the
 * in-app CMS editor, that env's content is the source of truth — do NOT
 * re-run this against it (same discipline as "demo = migrate but NEVER
 * re-seed"; see ~/.claude/rules/deploy-discipline.md).
 *
 * Usage (DATABASE_URL points at the target env's Postgres):
 *   pnpm --filter @marine-guardian/db db:seed:cms
 */

import { PrismaClient } from "@prisma/client";
import { seedCms } from "./seed-cms";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const counts = await seedCms(prisma);
  console.log("CMS seed complete:");
  console.log(`  CMS DocPages:       ${counts.docPages}`);
  console.log(`  CMS ShowcaseFields: ${counts.showcaseFields}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
