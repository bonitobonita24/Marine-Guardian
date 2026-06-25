/**
 * alert-rule.schema.test.ts
 *
 * Regression tests proving the canonical alertRuleConditionSchema rejects
 * legacy condition shapes that predate the P1-B fix (2026-06-25).
 *
 * The processor (alerts.processor.ts → ruleMatches) reads ONLY minPriority and
 * eventTypeId. Any row persisted with other keys (eventTypeValue, priority.gte,
 * severity …) silently becomes a catch-all. The .strict() guard on the schema
 * prevents new code from writing those shapes, and the seed reconciliation loop
 * fixes existing stale rows.
 */

import { describe, it, expect } from "vitest";
import { alertRuleConditionSchema } from "../alert-rule";

describe("alertRuleConditionSchema — canonical contract (P1-B regression)", () => {
  // ── VALID shapes ──────────────────────────────────────────────────────────

  it("accepts empty object (catch-all rule)", () => {
    expect(alertRuleConditionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts canonical { minPriority: 200 }", () => {
    const result = alertRuleConditionSchema.safeParse({ minPriority: 200 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minPriority).toBe(200);
    }
  });

  it("accepts canonical { eventTypeId: 'some-cuid' }", () => {
    const result = alertRuleConditionSchema.safeParse({
      eventTypeId: "cmqero4jg0p69gm6d3hr0aw08",
    });
    expect(result.success).toBe(true);
  });

  it("accepts canonical { minPriority: 100, eventTypeId: 'abc' } (combined)", () => {
    const result = alertRuleConditionSchema.safeParse({
      minPriority: 100,
      eventTypeId: "cmqero4jg0p69gm6d3hr0aw08",
    });
    expect(result.success).toBe(true);
  });

  it("accepts boundary minPriority values (0, 100, 200, 300)", () => {
    for (const v of [0, 100, 200, 300]) {
      const result = alertRuleConditionSchema.safeParse({ minPriority: v });
      expect(result.success).toBe(true);
    }
  });

  // ── INVALID / LEGACY shapes — must be rejected by .strict() ──────────────

  it("REGRESSION: rejects legacy { eventTypeValue: 'sos_distress' } shape", () => {
    // Pre-fix seed used this key — evaluator never reads it, so it silently
    // became a catch-all. .strict() now rejects it at validation time.
    const result = alertRuleConditionSchema.safeParse({
      eventTypeValue: "sos_distress",
    });
    expect(result.success).toBe(false);
  });

  it("REGRESSION: rejects legacy { priority: { gte: 200 } } shape", () => {
    // Pre-fix seed used this nested shape — evaluator only reads minPriority.
    const result = alertRuleConditionSchema.safeParse({
      priority: { gte: 200 },
    });
    expect(result.success).toBe(false);
  });

  it("REGRESSION: rejects legacy { severity: 'critical' } shape", () => {
    // Hypothetical legacy shape documented in alerts.processor.test.ts (i-5).
    const result = alertRuleConditionSchema.safeParse({ severity: "critical" });
    expect(result.success).toBe(false);
  });

  it("rejects minPriority outside 0–300 range", () => {
    expect(alertRuleConditionSchema.safeParse({ minPriority: -1 }).success).toBe(false);
    expect(alertRuleConditionSchema.safeParse({ minPriority: 301 }).success).toBe(false);
  });

  it("rejects non-integer minPriority", () => {
    expect(alertRuleConditionSchema.safeParse({ minPriority: 1.5 }).success).toBe(false);
  });
});
