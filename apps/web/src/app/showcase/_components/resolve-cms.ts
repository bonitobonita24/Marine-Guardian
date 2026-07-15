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
 *
 * IMPORTANT — this module runs on the SERVER (imported by the server
 * component apps/web/src/app/showcase/page.tsx) and its return values cross
 * the RSC server→client boundary into "use client" section components. React
 * cannot serialize a function/component reference (e.g. a LucideIcon) across
 * that boundary — doing so throws "Functions cannot be passed directly to
 * Client Components" at request time. So every Resolved* type here is
 * DELIBERATELY stripped of `icon` — the icon stays code-owned in ./data.ts
 * and the client components re-attach it locally (by array index, since the
 * resolvers preserve ./data.ts's order 1:1). Only plain serializable data
 * (strings/arrays/numbers/ids) may be added to a Resolved* type.
 */
export type CmsFields = Record<string, { value: string; valueJson: unknown }>;

export function text(fields: CmsFields, key: string, fallback: string): string {
  return fields[key]?.value ?? fallback;
}

export function list(fields: CmsFields, key: string, fallback: string[]): string[] {
  const v = fields[key]?.valueJson;
  return Array.isArray(v) ? (v as string[]) : fallback;
}

export type ResolvedFeature = Omit<Feature, "eyebrow" | "title" | "body" | "bullets" | "icon"> & {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
};

export function resolveFeatures(fields: CmsFields): ResolvedFeature[] {
  return FEATURES.map((f) => {
    const { icon: _icon, ...rest } = f;
    return {
      ...rest,
      eyebrow: text(fields, `feature.${f.id}.eyebrow`, f.eyebrow),
      title: text(fields, `feature.${f.id}.title`, f.title),
      body: text(fields, `feature.${f.id}.body`, f.body),
      bullets: list(fields, `feature.${f.id}.bullets`, f.bullets),
    };
  });
}

export type ResolvedRole = Omit<Role, "name" | "can" | "icon"> & { name: string; can: string };

export function resolveRoles(fields: CmsFields): ResolvedRole[] {
  return ROLES.map((r, i) => {
    const slug: string = ROLE_SLUGS[i] ?? "";
    const { icon: _icon, ...rest } = r;
    return {
      ...rest,
      name: text(fields, `role.${slug}.name`, r.name),
      can: text(fields, `role.${slug}.can`, r.can),
    };
  });
}

export type ResolvedStep = Omit<Step, "title" | "body" | "icon"> & { title: string; body: string };

export function resolveSteps(fields: CmsFields): ResolvedStep[] {
  return STEPS.map((s) => {
    const { icon: _icon, ...rest } = s;
    return {
      ...rest,
      title: text(fields, `step.${s.n}.title`, s.title),
      body: text(fields, `step.${s.n}.body`, s.body),
    };
  });
}

export type ResolvedBentoItem = Omit<BentoItem, "name" | "description" | "icon"> & {
  name: string;
  description: string;
};

export function resolveBento(fields: CmsFields): ResolvedBentoItem[] {
  return BENTO.map((b, i) => {
    const slug: string = BENTO_SLUGS[i] ?? "";
    const { icon: _icon, ...rest } = b;
    return {
      ...rest,
      name: text(fields, `bento.${slug}.name`, b.name),
      description: text(fields, `bento.${slug}.description`, b.description),
    };
  });
}

export type ResolvedPain = { id: string; title: string; body: string };

export function resolvePains(fields: CmsFields): ResolvedPain[] {
  return PAINS.map((p) => ({
    id: p.id,
    title: text(fields, `problem.${p.id}.title`, p.title),
    body: text(fields, `problem.${p.id}.body`, p.body),
  }));
}
