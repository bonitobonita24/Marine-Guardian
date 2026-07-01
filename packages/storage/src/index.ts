// 5.3c — packages/storage MinIO S3-compatible client surface.
//
// Targets MinIO in dev/staging/prod via Docker network, but uses the AWS SDK
// (@aws-sdk/client-s3 + lib-storage) so the eventual migration to Amazon S3
// is configuration-only — change STORAGE_ENDPOINT to the S3 regional endpoint
// and the same code paths run unchanged.
//
// Env var convention: STORAGE_* (matches apps/web/src/env.ts + V31 framework
// Phase 3 templates). The old MINIO_* names were deprecated 2026-05-23 when
// the smoke test exposed a name mismatch between this module and the rest
// of the stack — see lessons.md 🟤 entry on storage env var naming.
//
// Scope:
//   uploadPdf            — write a PDF buffer to (bucket, key)
//   getPdfReadStream     — open a download stream for the Route Handler
//   deletePdf            — remove an object (used by 5.3d retry path + future cleanup)
//   assertBucketExists   — idempotent bucket creation (HEAD → CREATE on 404)
//   getExportsBucketName — single source of truth for bucket name shape
//   buildExportKey       — single source of truth for object key shape
//   buildLogoKey         — key shape for template logo images
//   uploadImage          — write an image buffer (png/jpeg) to (bucket, key)
//   getImageReadStream   — open a download stream for logo image bytes
//   getImageBytes        — collect the full image into a Buffer (for print body)
//
// Bucket convention (locked in DECISIONS_LOG §142):
//   marine-guardian-${env}-exports  where env ∈ {dev, staging, prod}
// APP_ENV follows the NODE_ENV-mirroring convention (development | staging |
// production) so it cannot be substituted directly. getExportsBucketName
// translates APP_ENV → bucket env segment at the storage boundary:
//   development → dev
//   staging     → staging
//   production  → prod
//   (unset)     → dev   (safe default for local pnpm work)
// Adding a new APP_ENV value? Extend APP_ENV_TO_BUCKET_ENV below.
// Key shapes (locked):
//   PDF:   ${tenantId}/${YYYY}/${MM}/${exportId}.pdf
//   Logo:  logos/${tenantId}/${templateId}.${ext}
//   Per-tenant prefix gives us natural IAM scoping when we move to AWS S3.
//
// The S3Client is created lazily so the package can be imported in tests
// (where vi.mock("@aws-sdk/client-s3") intercepts the constructor) without
// blowing up on missing env vars.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

export interface UploadPdfInput {
  bucket: string;
  key: string;
  body: Buffer;
}

export interface UploadPdfResult {
  key: string;
}

export interface GetReadStreamInput {
  bucket: string;
  key: string;
}

export interface DeleteInput {
  bucket: string;
  key: string;
}

/** Accepted MIME types for logo/template images. */
export type ImageContentType = "image/png" | "image/jpeg";

export interface UploadImageInput {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: ImageContentType;
}

export interface UploadImageResult {
  key: string;
}

/** 10 MiB — logo images for print templates should never exceed this. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient !== null) return cachedClient;

  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.STORAGE_SECRET_KEY;
  const region = process.env.STORAGE_REGION ?? "us-east-1";

  if (endpoint === undefined || endpoint === "") {
    throw new Error(
      "STORAGE_ENDPOINT is not configured — packages/storage cannot create S3 client",
    );
  }
  if (accessKeyId === undefined || accessKeyId === "") {
    throw new Error(
      "STORAGE_ACCESS_KEY is not configured — packages/storage cannot create S3 client",
    );
  }
  if (secretAccessKey === undefined || secretAccessKey === "") {
    throw new Error(
      "STORAGE_SECRET_KEY is not configured — packages/storage cannot create S3 client",
    );
  }

  cachedClient = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // MinIO requires path-style addressing — bucket goes in the URL path,
    // not as a subdomain. AWS S3 also accepts path-style so this is portable.
    forcePathStyle: true,
  });
  return cachedClient;
}

/**
 * Test-only hook: reset the cached client between runs so env changes take
 * effect. Not exported in the package barrel.
 */
export function __resetClientForTesting(): void {
  cachedClient = null;
}

// Maps APP_ENV (NODE_ENV-style) to the locked bucket env segment from
// DECISIONS_LOG §142. Unknown values throw — silent fallthrough to "dev"
// would risk writing prod data into a dev-named bucket if APP_ENV ever
// drifts (e.g. "preview", "qa") and would mask the misconfiguration.
const APP_ENV_TO_BUCKET_ENV: Record<string, string> = {
  development: "dev",
  staging: "staging",
  production: "prod",
};

export function getExportsBucketName(): string {
  const appEnv = process.env.APP_ENV;
  if (appEnv === undefined || appEnv === "") {
    return "marine-guardian-dev-exports";
  }
  const bucketEnv = APP_ENV_TO_BUCKET_ENV[appEnv];
  if (bucketEnv === undefined) {
    throw new Error(
      `[storage] APP_ENV=${appEnv} is not mapped in APP_ENV_TO_BUCKET_ENV. Expected one of: ${Object.keys(
        APP_ENV_TO_BUCKET_ENV,
      ).join(", ")}`,
    );
  }
  return `marine-guardian-${bucketEnv}-exports`;
}

export function buildExportKey(
  tenantId: string,
  exportId: string,
  at: Date,
): string {
  const year = String(at.getUTCFullYear());
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${tenantId}/${year}/${month}/${exportId}.pdf`;
}

/**
 * Key shape for report-template logo images stored in the exports bucket.
 * Shape: logos/${tenantId}/${templateId}.${ext}
 * ext must not include a leading dot ("png", not ".png") — a leading dot is
 * stripped defensively so callers that derive ext from a filename do not
 * produce double-dot keys (e.g. "logos/t/id..png") that are unreachable.
 */
export function buildLogoKey(
  tenantId: string,
  templateId: string,
  ext: string,
): string {
  const normalizedExt = ext.startsWith(".") ? ext.slice(1) : ext;
  return `logos/${tenantId}/${templateId}.${normalizedExt}`;
}

export async function uploadPdf(
  input: UploadPdfInput,
): Promise<UploadPdfResult> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: "application/pdf",
      ContentLength: input.body.length,
    }),
  );
  return { key: input.key };
}

export async function getPdfReadStream(
  input: GetReadStreamInput,
): Promise<Readable> {
  const client = getClient();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
  const body = response.Body;
  if (body === undefined) {
    throw new Error(
      `getPdfReadStream: no body returned for s3://${input.bucket}/${input.key}`,
    );
  }
  // The SDK types body as a union; in Node.js runtime it is always a Readable.
  return body as Readable;
}

export async function deletePdf(input: DeleteInput): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
}

export async function uploadImage(
  input: UploadImageInput,
): Promise<UploadImageResult> {
  if (input.body.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `uploadImage: body size ${input.body.length} exceeds maximum ${MAX_IMAGE_BYTES} bytes`,
    );
  }
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.length,
    }),
  );
  return { key: input.key };
}

export async function getImageReadStream(
  input: GetReadStreamInput,
): Promise<Readable> {
  const client = getClient();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
  const body = response.Body;
  if (body === undefined) {
    throw new Error(
      `getImageReadStream: no body returned for s3://${input.bucket}/${input.key}`,
    );
  }
  return body as Readable;
}

export async function getImageBytes(
  input: GetReadStreamInput,
): Promise<Buffer> {
  const stream = await getImageReadStream(input);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

interface S3LikeError {
  $metadata?: { httpStatusCode?: number };
  name?: string;
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const s3err = err as unknown as S3LikeError;
  if (s3err.$metadata?.httpStatusCode === 404) return true;
  if (s3err.name === "NoSuchBucket" || s3err.name === "NotFound") return true;
  return false;
}

export async function assertBucketExists(bucket: string): Promise<void> {
  const client = getClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
}

// R2 photo cache (24h-TTL read-through cache for Telegram event photos).
// Lives in its own module with a distinct S3Client (R2 config differs from
// MinIO); re-exported here so consumers keep the single
// `@marine-guardian/storage` import path. See ./r2-cache.ts.
export * from "./r2-cache";
