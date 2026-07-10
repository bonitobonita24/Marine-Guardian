import { describe, it, expect } from "vitest";
import {
  FEATURE_REGISTRY,
  GRANTABLE_FEATURE_KEYS,
  RESERVED_FEATURE_KEYS,
  isGrantableFeature,
  featureActions,
} from "../feature-registry";

describe("feature-registry", () => {
  it("never marks a reserved key as grantable", () => {
    for (const reservedKey of RESERVED_FEATURE_KEYS) {
      expect(GRANTABLE_FEATURE_KEYS).not.toContain(reservedKey);
      expect(isGrantableFeature(reservedKey)).toBe(false);
    }
  });

  it("marks a real operational feature as grantable with full CRUD actions", () => {
    expect(isGrantableFeature("events")).toBe(true);
    expect(featureActions("events")).toEqual(["view", "write", "update", "delete"]);
  });

  it("marks a view-only feature with exactly the view action", () => {
    expect(featureActions("dashboard")).toEqual(["view"]);
  });

  it("derives every feature key from its href minus the leading slash", () => {
    for (const feature of FEATURE_REGISTRY) {
      expect(feature.key).toBe(feature.href.slice(1));
    }
  });
});
