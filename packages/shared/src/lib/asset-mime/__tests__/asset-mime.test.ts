import { describe, it, expect } from "vitest";

import { mimeFromFilename, isImageAsset } from "../index";

describe("mimeFromFilename", () => {
  it("maps common raster image extensions (case-insensitive)", () => {
    expect(mimeFromFilename("photo.jpg")).toBe("image/jpeg");
    expect(mimeFromFilename("PHOTO.JPEG")).toBe("image/jpeg");
    expect(mimeFromFilename("a.png")).toBe("image/png");
    expect(mimeFromFilename("b.GIF")).toBe("image/gif");
    expect(mimeFromFilename("c.webp")).toBe("image/webp");
  });

  it("maps non-image types it knows about", () => {
    expect(mimeFromFilename("report.pdf")).toBe("application/pdf");
    expect(mimeFromFilename("clip.mov")).toBe("video/quicktime");
  });

  it("returns null for unknown or missing extensions", () => {
    expect(mimeFromFilename("data.bin")).toBeNull();
    expect(mimeFromFilename("noextension")).toBeNull();
    expect(mimeFromFilename("trailingdot.")).toBeNull();
  });

  it("does NOT map svg (XSS-via-inline-SVG guard)", () => {
    expect(mimeFromFilename("logo.svg")).toBeNull();
  });
});

describe("isImageAsset", () => {
  it("prefers an explicit image mimeType", () => {
    expect(isImageAsset("image/jpeg", "whatever.dat")).toBe(true);
    expect(isImageAsset("application/pdf", "report.pdf")).toBe(false);
  });

  it("falls back to the filename extension when mimeType is null/undefined", () => {
    expect(isImageAsset(null, "community_support-01.jpg")).toBe(true);
    expect(isImageAsset(undefined, "scan.png")).toBe(true);
    expect(isImageAsset(null, "manifest.pdf")).toBe(false);
    expect(isImageAsset(null, "unknown")).toBe(false);
  });

  it("treats svg as non-image (never rendered inline)", () => {
    expect(isImageAsset(null, "logo.svg")).toBe(false);
  });
});
