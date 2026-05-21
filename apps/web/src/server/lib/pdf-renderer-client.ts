/**
 * HTTP client for the marine-guardian-pdf-renderer Docker service.
 *
 * Calls POST {PDF_RENDERER_SERVICE_URL}/render with the X-PDF-Renderer-Token
 * header. The renderer launches headless Chromium via Puppeteer, navigates
 * to printUrl (an authenticated /_print/* URL on the web app), and returns
 * the rendered PDF as raw bytes.
 *
 * Phase 8 Batch 5 Sub-batch 5.3a — service infrastructure only. Producer
 * wiring (BullMQ pdf-render queue + processor) lands in 5.3b.
 */

export interface RenderPdfInput {
  printUrl: string;
  paperSize: "A4" | "Letter" | "Legal";
  landscape: boolean;
  exportId: string;
}

export class PdfRendererError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "PdfRendererError";
    this.status = status;
  }
}

export async function renderPdfViaService(input: RenderPdfInput): Promise<Buffer> {
  const baseUrl = process.env.PDF_RENDERER_SERVICE_URL;
  const token = process.env.PDF_RENDERER_SERVICE_TOKEN;

  if (baseUrl === undefined || baseUrl === "") {
    throw new PdfRendererError("PDF_RENDERER_SERVICE_URL is not configured");
  }
  if (token === undefined || token === "") {
    throw new PdfRendererError("PDF_RENDERER_SERVICE_TOKEN is not configured");
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PDF-Renderer-Token": token,
      },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw new PdfRendererError(
      `pdf-renderer fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new PdfRendererError(
      `pdf-renderer returned non-OK status ${String(response.status)}`,
      response.status,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
