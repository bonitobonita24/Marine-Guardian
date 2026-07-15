import type { LucideIcon } from "lucide-react";

import {
  FEATURES,
  ROLES,
  STEPS,
  BENTO,
  PAINS,
  ROLE_SLUGS,
  BENTO_SLUGS,
  type Feature,
  type Role,
  type Step,
  type BentoItem,
} from "./data";

/**
 * CMS text-resolution layer for /showcase (CMS_BUILD_PLAN.md — W5). Reads
 * `cmsShowcase.getAll()`'s field map and merges the DB-backed copy onto the
 * code-owned layout/icon/image/accent data in ./data.ts. Every lookup falls
 * back to the current literal (also owned in ./data.ts / this file) when a
 * key is missing or the DB is empty — so an empty table renders byte-
 * identical to today. Keys mirror packages/db/prisma/seed-cms.ts KEY SCHEME.
 */
export type CmsFields = Record<string, { value: string; valueJson: unknown }>;

export function text(fields: CmsFields, key: string, fallback: string): string {
  return fields[key]?.value ?? fallback;
}

export function list(fields: CmsFields, key: string, fallback: string[]): string[] {
  const v = fields[key]?.valueJson;
  return Array.isArray(v) ? (v as string[]) : fallback;
}

export type ResolvedFeature = Omit<Feature, "eyebrow" | "title" | "body" | "bullets"> & {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
};

export function resolveFeatures(fields: CmsFields): ResolvedFeature[] {
  return FEATURES.map((f) => ({
    ...f,
    eyebrow: text(fields, `feature.${f.id}.eyebrow`, f.eyebrow),
    title: text(fields, `feature.${f.id}.title`, f.title),
    body: text(fields, `feature.${f.id}.body`, f.body),
    bullets: list(fields, `feature.${f.id}.bullets`, f.bullets),
  }));
}

export type ResolvedRole = Omit<Role, "name" | "can"> & { name: string; can: string };

export function resolveRoles(fields: CmsFields): ResolvedRole[] {
  return ROLES.map((r, i) => {
    const slug: string = ROLE_SLUGS[i] ?? "";
    return {
      ...r,
      name: text(fields, `role.${slug}.name`, r.name),
      can: text(fields, `role.${slug}.can`, r.can),
    };
  });
}

export type ResolvedStep = Omit<Step, "title" | "body"> & { title: string; body: string };

export function resolveSteps(fields: CmsFields): ResolvedStep[] {
  return STEPS.map((s) => ({
    ...s,
    title: text(fields, `step.${s.n}.title`, s.title),
    body: text(fields, `step.${s.n}.body`, s.body),
  }));
}

export type ResolvedBentoItem = Omit<BentoItem, "name" | "description"> & {
  name: string;
  description: string;
};

export function resolveBento(fields: CmsFields): ResolvedBentoItem[] {
  return BENTO.map((b, i) => {
    const slug: string = BENTO_SLUGS[i] ?? "";
    return {
      ...b,
      name: text(fields, `bento.${slug}.name`, b.name),
      description: text(fields, `bento.${slug}.description`, b.description),
    };
  });
}

export type ResolvedPain = { id: string; icon: LucideIcon; title: string; body: string };

export function resolvePains(fields: CmsFields): ResolvedPain[] {
  return PAINS.map((p) => ({
    id: p.id,
    icon: p.icon,
    title: text(fields, `problem.${p.id}.title`, p.title),
    body: text(fields, `problem.${p.id}.body`, p.body),
  }));
}
