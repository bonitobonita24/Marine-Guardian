// V-pptx-export — pdf-to-pptx shaping tests.
//
// pdfjs-dist, @napi-rs/canvas, and pptxgenjs are all mocked here — this
// suite verifies renderPdfPagesToPptx's OWN logic (deck layout sizing,
// per-page contain-fit placement math, buffer plumbing), not the real PDF
// rasterization pipeline (that would require a real PDF fixture + native
// canvas rendering, which is exercised manually/in staging rather than
// this unit suite — see the processor test for the mocked integration
// boundary this module sits behind).
//
// Verifies:
//  (1) the deck's slide layout is sized to the FIRST page's true physical
//      size (in inches, derived from the PDF's own point size),
//  (2) a page whose aspect matches the deck fills it exactly (full-bleed,
//      x=0,y=0,w=deckWidth,h=deckHeight),
//  (3) a page whose aspect DIFFERS from the deck is contain-fit + centered
//      rather than stretched,
//  (4) pptx.write() is called with outputType "nodebuffer" and its return
//      value is what renderPdfPagesToPptx resolves to,
//  (5) an empty PDF (0 pages) throws rather than producing an empty deck.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// pdfjs-dist mock — a configurable fake document with N pages, each with its
// own scale=1 viewport size (the "true" PDF point size).
// ---------------------------------------------------------------------------
interface FakePageSpec {
  width: number; // points at scale=1
  height: number;
}

let pageSpecs: FakePageSpec[] = [];
const mockLoadingTaskDestroy = vi.fn().mockResolvedValue(undefined);
const mockGetDocument = vi.fn();

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: (...args: unknown[]): unknown => mockGetDocument(...args),
}));

vi.mock("@napi-rs/canvas", () => ({
  createCanvas: vi.fn((_w: number, _h: number) => ({
    getContext: vi.fn(() => ({})),
    encode: vi.fn(() => Promise.resolve(Buffer.from("fake-png-bytes"))),
  })),
}));

// ---------------------------------------------------------------------------
// pptxgenjs mock — records defineLayout/layout/addSlide/addImage/write calls.
// ---------------------------------------------------------------------------
const mockDefineLayout = vi.fn();
const mockAddImage = vi.fn();
const mockWrite = vi.fn(() => Promise.resolve(Buffer.from("fake-pptx-bytes")));
const addSlideCalls: { addImage: typeof mockAddImage }[] = [];

vi.mock("pptxgenjs", () => {
  class FakePptxGenJS {
    defineLayout = mockDefineLayout;
    layout = "";
    addSlide(): { addImage: typeof mockAddImage } {
      const slide = { addImage: mockAddImage };
      addSlideCalls.push(slide);
      return slide;
    }
    write = mockWrite;
  }
  return { default: FakePptxGenJS };
});

import { renderPdfPagesToPptx } from "../pdf-to-pptx";

function makeViewport(scale: number, spec: FakePageSpec) {
  return { width: spec.width * scale, height: spec.height * scale };
}

function setPdfPages(specs: FakePageSpec[]): void {
  pageSpecs = specs;
  mockGetDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: specs.length,
      getPage: vi.fn((pageNum: number) => {
        const spec = pageSpecs[pageNum - 1];
        if (spec === undefined) return Promise.reject(new Error("page out of range"));
        return Promise.resolve({
          getViewport: vi.fn(({ scale }: { scale: number }) =>
            makeViewport(scale, spec),
          ),
          render: vi.fn(() => ({ promise: Promise.resolve(undefined) })),
          cleanup: vi.fn(),
        });
      }),
      destroy: mockLoadingTaskDestroy,
    }),
    destroy: mockLoadingTaskDestroy,
  });
}

describe("renderPdfPagesToPptx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addSlideCalls.length = 0;
  });

  it("throws for a PDF with zero pages rather than producing an empty deck", async () => {
    setPdfPages([]);
    await expect(renderPdfPagesToPptx(new Uint8Array([1]))).rejects.toThrow(
      "no pages",
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("sizes the deck layout to the FIRST page's true physical size (points → inches)", async () => {
    // 612x792 points = US Letter portrait = exactly 8.5in x 11in.
    setPdfPages([{ width: 612, height: 792 }]);
    await renderPdfPagesToPptx(new Uint8Array([1]));

    expect(mockDefineLayout).toHaveBeenCalledTimes(1);
    const layoutArg = mockDefineLayout.mock.calls[0]?.[0] as {
      name: string;
      width: number;
      height: number;
    };
    expect(layoutArg.width).toBeCloseTo(8.5, 5);
    expect(layoutArg.height).toBeCloseTo(11, 5);
  });

  it("a page matching the deck's aspect ratio fills it exactly (full-bleed, no letterboxing)", async () => {
    setPdfPages([{ width: 612, height: 792 }]);
    await renderPdfPagesToPptx(new Uint8Array([1]));

    expect(mockAddImage).toHaveBeenCalledTimes(1);
    const imgArg = mockAddImage.mock.calls[0]?.[0] as {
      x: number;
      y: number;
      w: number;
      h: number;
      data: string;
    };
    expect(imgArg.x).toBeCloseTo(0, 5);
    expect(imgArg.y).toBeCloseTo(0, 5);
    expect(imgArg.w).toBeCloseTo(8.5, 5);
    expect(imgArg.h).toBeCloseTo(11, 5);
    expect(imgArg.data).toMatch(/^data:image\/png;base64,/);
  });

  it("a page with a DIFFERENT aspect ratio is contain-fit and centered, not stretched", async () => {
    // First page: 612x792 (portrait, defines the deck at 8.5in x 11in).
    // Second page: 792x612 (landscape) — must NOT be stretched to fill the
    // portrait deck; it should be scaled down to fit within both dimensions
    // and centered.
    setPdfPages([
      { width: 612, height: 792 },
      { width: 792, height: 612 },
    ]);
    await renderPdfPagesToPptx(new Uint8Array([1]));

    expect(mockAddImage).toHaveBeenCalledTimes(2);
    const secondImgArg = mockAddImage.mock.calls[1]?.[0] as {
      x: number;
      y: number;
      w: number;
      h: number;
    };

    // Second page's own physical size: 792/72=11in x 612/72=8.5in.
    // Deck is 8.5in x 11in. scale = min(8.5/11, 11/8.5) = min(0.7727, 1.294) = 0.7727.
    const expectedScale = Math.min(8.5 / 11, 11 / 8.5);
    const expectedW = 11 * expectedScale;
    const expectedH = 8.5 * expectedScale;
    expect(secondImgArg.w).toBeCloseTo(expectedW, 5);
    expect(secondImgArg.h).toBeCloseTo(expectedH, 5);
    // Centered — not flush to the top-left corner. The binding constraint
    // here is deck WIDTH (scale = min(...) picks the width ratio), so the
    // rendered width exactly matches the deck width (x=0) while the height
    // is strictly smaller than the deck height (letterboxed top/bottom,
    // vertically centered) — contain-fit, never stretched beyond the deck.
    expect(secondImgArg.x).toBeCloseTo((8.5 - expectedW) / 2, 5);
    expect(secondImgArg.y).toBeCloseTo((11 - expectedH) / 2, 5);
    expect(secondImgArg.w).toBeCloseTo(8.5, 5);
    expect(secondImgArg.h).toBeLessThan(11);
  });

  it("adds one slide per PDF page", async () => {
    setPdfPages([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
      { width: 612, height: 792 },
    ]);
    await renderPdfPagesToPptx(new Uint8Array([1]));
    expect(addSlideCalls).toHaveLength(3);
  });

  it("calls pptx.write with outputType 'nodebuffer' and returns its result", async () => {
    setPdfPages([{ width: 612, height: 792 }]);
    const result = await renderPdfPagesToPptx(new Uint8Array([1]));

    expect(mockWrite).toHaveBeenCalledWith({ outputType: "nodebuffer" });
    expect(result.toString()).toBe("fake-pptx-bytes");
  });

  it("destroys the pdf.js loading task after rendering (releases worker resources)", async () => {
    setPdfPages([{ width: 612, height: 792 }]);
    await renderPdfPagesToPptx(new Uint8Array([1]));
    expect(mockLoadingTaskDestroy).toHaveBeenCalledTimes(1);
  });
});
