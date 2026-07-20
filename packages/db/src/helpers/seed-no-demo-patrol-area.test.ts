import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the stray blue square on the live map.
 *
 * The seed used to find-or-create a PatrolArea named "Demo Patrol Zone Alpha"
 * with a small square polygon. Because the lookup was find-or-create rather
 * than a true upsert, deleting the row by hand only helped until the next seed
 * run recreated it — which is why it "always came back".
 *
 * seed.ts is a top-level script with side effects (it connects to a real
 * database on import), so it cannot be imported and unit tested. Asserting on
 * its source is the honest way to pin this invariant: no demo patrol area may
 * be reintroduced into the seed.
 */
const seedSource = readFileSync(
  fileURLToPath(new URL("../../prisma/seed.ts", import.meta.url)),
  "utf8",
);

/** Strip line and block comments so the intent-documenting comment in seed.ts
 * (which necessarily names the removed area) does not trip these assertions. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("seed.ts demo patrol area", () => {
  const code = stripComments(seedSource);

  it("does not reference the removed demo patrol area by name", () => {
    expect(code).not.toContain("Demo Patrol Zone Alpha");
  });

  it("never creates a PatrolArea", () => {
    expect(code).not.toMatch(/prisma\.patrolArea\.(create|upsert|createMany)/);
  });

  it("seeds patrol schedules unattached to any patrol area", () => {
    expect(code).toContain("patrolAreaId: null");
  });

  it("still seeds patrol schedules (the demo data itself is retained)", () => {
    expect(code).toMatch(/prisma\.patrolSchedule\.create/);
  });

  it("sanity check: the guard reads real seed source, not an empty file", () => {
    expect(seedSource.length).toBeGreaterThan(1000);
  });
});
