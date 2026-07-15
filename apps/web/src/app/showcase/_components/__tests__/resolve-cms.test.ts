/**
 * resolve-cms.ts tests (CMS_BUILD_PLAN.md — W5). Verifies the DB-value /
 * literal-fallback resolution that wires /showcase text to cmsShowcase.getAll():
 * a populated field map overrides the literal, and a missing/empty field map
 * falls back to the exact current literal (byte-identical page guarantee).
 */
import { describe, it, expect } from "vitest";
import {
  text,
  list,
  resolveFeatures,
  resolveRoles,
  resolveSteps,
  resolveBento,
  resolvePains,
  type CmsFields,
} from "../resolve-cms";
import { FEATURES, ROLES, STEPS, BENTO, PAINS } from "../data";

describe("text() / list()", () => {
  it("returns the fallback when the field map is empty", () => {
    expect(text({}, "hero.headline", "Marine Guardian")).toBe("Marine Guardian");
    expect(list({}, "feature.war-room.bullets", ["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns the DB value when the key is present", () => {
    const fields: CmsFields = { "hero.headline": { value: "__W5_PROBE__", valueJson: null } };
    expect(text(fields, "hero.headline", "Marine Guardian")).toBe("__W5_PROBE__");
  });

  it("returns the DB valueJson array when present, else the fallback array", () => {
    const fields: CmsFields = {
      "feature.war-room.bullets": { value: "", valueJson: ["x", "y"] },
    };
    expect(list(fields, "feature.war-room.bullets", ["a"])).toEqual(["x", "y"]);
    // Non-array valueJson (or missing) falls back.
    const badFields: CmsFields = { "feature.war-room.bullets": { value: "", valueJson: "not-an-array" } };
    expect(list(badFields, "feature.war-room.bullets", ["a"])).toEqual(["a"]);
  });
});

describe("resolveFeatures — empty DB is byte-identical to the code literals", () => {
  it("every resolved feature equals its ./data.ts literal when fields is empty", () => {
    const resolved = resolveFeatures({});
    expect(resolved).toHaveLength(FEATURES.length);
    resolved.forEach((r, i) => {
      const source = FEATURES[i];
      expect(source).toBeDefined();
      if (source == null) return;
      expect(r.eyebrow).toBe(source.eyebrow);
      expect(r.title).toBe(source.title);
      expect(r.body).toBe(source.body);
      expect(r.bullets).toEqual(source.bullets);
      // code-only fields pass through untouched
      expect(r.icon).toBe(source.icon);
      expect(r.image).toBe(source.image);
      expect(r.accent).toBe(source.accent);
    });
  });

  it("a DB override on one feature key overrides only that field", () => {
    const fields: CmsFields = {
      "feature.war-room.title": { value: "__W5_PROBE__", valueJson: null },
    };
    const resolved = resolveFeatures(fields);
    const warRoom = resolved.find((f) => f.id === "war-room");
    expect(warRoom?.title).toBe("__W5_PROBE__");
    expect(warRoom?.eyebrow).toBe(FEATURES.find((f) => f.id === "war-room")?.eyebrow);
  });
});

describe("resolveRoles / resolveSteps / resolveBento / resolvePains — empty-DB fallback parity", () => {
  it("roles match ./data.ts literals with an empty field map", () => {
    const resolved = resolveRoles({});
    resolved.forEach((r, i) => {
      const source = ROLES[i];
      expect(source).toBeDefined();
      if (source == null) return;
      expect(r.name).toBe(source.name);
      expect(r.can).toBe(source.can);
    });
  });

  it("steps match ./data.ts literals with an empty field map", () => {
    const resolved = resolveSteps({});
    resolved.forEach((s, i) => {
      const source = STEPS[i];
      expect(source).toBeDefined();
      if (source == null) return;
      expect(s.title).toBe(source.title);
      expect(s.body).toBe(source.body);
    });
  });

  it("bento items match ./data.ts literals with an empty field map", () => {
    const resolved = resolveBento({});
    resolved.forEach((b, i) => {
      const source = BENTO[i];
      expect(source).toBeDefined();
      if (source == null) return;
      expect(b.name).toBe(source.name);
      expect(b.description).toBe(source.description);
    });
  });

  it("pains match ./data.ts literals with an empty field map", () => {
    const resolved = resolvePains({});
    resolved.forEach((p, i) => {
      const source = PAINS[i];
      expect(source).toBeDefined();
      if (source == null) return;
      expect(p.title).toBe(source.title);
      expect(p.body).toBe(source.body);
    });
  });

  it("a DB override on role.site-admin.name overrides only that role", () => {
    const fields: CmsFields = { "role.site-admin.name": { value: "__W5_PROBE__", valueJson: null } };
    const resolved = resolveRoles(fields);
    expect(resolved.find((r) => r.name === "__W5_PROBE__")).toBeDefined();
    expect(resolved.filter((r) => r.name === "__W5_PROBE__")).toHaveLength(1);
  });
});
