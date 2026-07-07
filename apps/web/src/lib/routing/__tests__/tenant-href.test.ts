import { describe, it, expect } from "vitest";
import { tenantHref } from "../tenant-href";

describe("tenantHref", () => {
  it("prefixes an absolute path with the tenant slug", () => {
    expect(tenantHref("demo-site", "/map")).toBe("/demo-site/map");
    expect(tenantHref("demo-site", "/patrols/123")).toBe("/demo-site/patrols/123");
  });

  it("normalizes a path missing the leading slash", () => {
    expect(tenantHref("demo-site", "dashboard")).toBe("/demo-site/dashboard");
  });

  it("handles the root path", () => {
    expect(tenantHref("acme", "/")).toBe("/acme/");
  });
});
