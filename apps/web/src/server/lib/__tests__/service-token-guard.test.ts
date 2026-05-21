import { describe, expect, it } from "vitest";

import { verifyServiceToken } from "../service-token-guard";

const VALID = "abcdef1234567890abcdef1234567890abcdef1234567890";

describe("verifyServiceToken", () => {
  it("returns true when presented token matches expected token", () => {
    expect(verifyServiceToken(VALID, VALID)).toBe(true);
  });

  it("returns false when presented token is missing (null)", () => {
    expect(verifyServiceToken(null, VALID)).toBe(false);
  });

  it("returns false when presented token is empty string", () => {
    expect(verifyServiceToken("", VALID)).toBe(false);
  });

  it("returns false when presented token differs by a single character", () => {
    const tampered = VALID.slice(0, -1) + "X";
    expect(verifyServiceToken(tampered, VALID)).toBe(false);
  });

  it("returns false when lengths differ (short prefix)", () => {
    expect(verifyServiceToken(VALID.slice(0, 8), VALID)).toBe(false);
  });

  it("returns false when expected token is missing/empty (safety default)", () => {
    expect(verifyServiceToken(VALID, "")).toBe(false);
    expect(verifyServiceToken(VALID, null)).toBe(false);
  });

  it("does not short-circuit on first differing byte (constant-time approximation)", () => {
    // We can't measure timing reliably in vitest, but we can at least verify
    // the function inspects the entire length of the longer string by checking
    // that it returns false for two strings of equal length that differ only
    // in the LAST position — which a naive early-return loop would also
    // detect, so this is a smoke-level guard against a buggy `indexOf` impl.
    const a = "0".repeat(48) + "1";
    const b = "0".repeat(48) + "2";
    expect(verifyServiceToken(a, b)).toBe(false);
    expect(verifyServiceToken(a, a)).toBe(true);
  });
});
