import { z } from "zod";
import { reportLayoutSchema } from "./enums";

export const reportTemplateSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  name: z.string(),
  layout: reportLayoutSchema,
  municipalLogoKey: z.string().nullable(),
  partnerLogoKey: z.string().nullable(),
  reportTitle: z.string(),
  footerNotes: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const listReportTemplatesInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const getReportTemplateByIdInputSchema = z.object({
  id: z.string(),
});

export const createReportTemplateInputSchema = z.object({
  name: z.string().min(1).max(255),
  layout: reportLayoutSchema,
  municipalLogoKey: z.string().nullable().optional(),
  partnerLogoKey: z.string().nullable().optional(),
  reportTitle: z.string().min(1).max(255),
  footerNotes: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export const updateReportTemplateInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  layout: reportLayoutSchema.optional(),
  municipalLogoKey: z.string().nullable().optional(),
  partnerLogoKey: z.string().nullable().optional(),
  reportTitle: z.string().min(1).max(255).optional(),
  footerNotes: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const deleteReportTemplateInputSchema = z.object({
  id: z.string(),
});
