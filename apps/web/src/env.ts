import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    NEXTAUTH_URL: z.string().url(),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_FROM: z.string().min(1),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    STORAGE_ENDPOINT: z.string().url(),
    STORAGE_ACCESS_KEY: z.string().min(1),
    STORAGE_SECRET_KEY: z.string().min(1),
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_REGION: z.string().default("us-east-1"),
    EARTHRANGER_ENCRYPTION_KEY: z.string().min(32).optional(),
    // Phase 8 Batch 5 Sub-batch 5.3a — marine-guardian-pdf-renderer access.
    // Optional in 5.3a (infrastructure setup); the BullMQ pdf-render worker
    // (5.3b) is the actual consumer. The /print-render/* middleware guard
    // reads PDF_RENDERER_SERVICE_TOKEN directly from process.env.
    PDF_RENDERER_SERVICE_URL: z.string().url().optional(),
    PDF_RENDERER_SERVICE_TOKEN: z.string().min(32).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
    STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
    STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    STORAGE_REGION: process.env.STORAGE_REGION,
    EARTHRANGER_ENCRYPTION_KEY: process.env.EARTHRANGER_ENCRYPTION_KEY,
    PDF_RENDERER_SERVICE_URL: process.env.PDF_RENDERER_SERVICE_URL,
    PDF_RENDERER_SERVICE_TOKEN: process.env.PDF_RENDERER_SERVICE_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
