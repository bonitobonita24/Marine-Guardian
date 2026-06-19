import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the HIGH staging bug: `event.addAccompanyingRanger`
 * returned 500 on every insert.
 *
 * Root cause: `accompanying_rangers.entity_id` is a polymorphic column that
 * points at EITHER an event OR a patrol. The init migration created TWO
 * non-deferrable foreign keys on that single column:
 *     accompanying_ranger_event_fk  -> events(id)
 *     accompanying_ranger_patrol_fk -> patrols(id)
 * A single value can never satisfy both, so Postgres raised 23503 on every
 * insert. The fix drops both constraints (integrity is enforced in the tRPC
 * mutation instead). Unit tests mock Prisma, so this content-level guard is
 * the only thing that protects the fix in CI without a live database.
 */

const MIGRATIONS_DIR = join(
  __dirname,
  "../../../../../../../packages/db/prisma/migrations"
);

function readAllMigrationSql(): string {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return dirs
    .map((dir) => {
      try {
        return readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}

describe("accompanying_rangers polymorphic FK regression", () => {
  it("includes a migration that drops both polymorphic entity_id foreign keys", () => {
    const all = readAllMigrationSql();
    expect(all).toMatch(
      /DROP CONSTRAINT IF EXISTS "accompanying_ranger_event_fk"/
    );
    expect(all).toMatch(
      /DROP CONSTRAINT IF EXISTS "accompanying_ranger_patrol_fk"/
    );
  });

  it("does not leave both polymorphic FKs active (drop comes after the init ADD)", () => {
    const all = readAllMigrationSql();
    const lastEventAdd = all.lastIndexOf(
      'ADD CONSTRAINT "accompanying_ranger_event_fk"'
    );
    const lastEventDrop = all.lastIndexOf(
      'DROP CONSTRAINT IF EXISTS "accompanying_ranger_event_fk"'
    );
    const lastPatrolAdd = all.lastIndexOf(
      'ADD CONSTRAINT "accompanying_ranger_patrol_fk"'
    );
    const lastPatrolDrop = all.lastIndexOf(
      'DROP CONSTRAINT IF EXISTS "accompanying_ranger_patrol_fk"'
    );
    // The final state for each polymorphic FK must be "dropped".
    expect(lastEventDrop).toBeGreaterThan(lastEventAdd);
    expect(lastPatrolDrop).toBeGreaterThan(lastPatrolAdd);
  });
});
