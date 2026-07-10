/**
 * Canonical, client-safe feature registry for the custom-role permission
 * matrix (tenant-rbac-standard §4). PURE TypeScript — no server/prisma/react
 * imports — so it can be shared by the server-side resolver, tRPC middleware,
 * route middleware, and the sidebar nav filter without pulling in Node-only
 * or React-only dependencies.
 *
 * `key` is derived from the sidebar nav `href` (leading slash stripped) so
 * this registry stays mechanically in sync with apps/web/src/components/
 * layout/sidebar.tsx. `labelKey` reuses the exact i18n key from that same
 * nav item (see the "nav" translation namespace).
 *
 * Reserved surfaces — User Management, tenant Settings, Billing, and the
 * per-user Profile page — are intentionally NOT included here. Those stay
 * exclusive to tenant_superadmin / tenant_manager (Users, Settings) or are
 * self-service for every role (Profile) and must never be grantable via a
 * custom role (tenant-rbac-standard §4 guardrails).
 */

export type FeatureAction = "view" | "write" | "update" | "delete";

export interface FeatureDef {
  /** Stable key = nav href without the leading slash, e.g. "events". */
  key: string;
  /** i18n label key reused from the sidebar nav item (the "nav" namespace). */
  labelKey: string;
  /** Nav href this feature governs, e.g. "/events". */
  href: string;
  /** Which of the 4 CRUD-split actions this feature exposes. */
  actions: FeatureAction[];
}

/** The full ordered registry of GRANTABLE features (operational surfaces only). */
export const FEATURE_REGISTRY: readonly FeatureDef[] = [
  { key: "dashboard", labelKey: "dashboard", href: "/dashboard", actions: ["view"] },
  { key: "map", labelKey: "map", href: "/map", actions: ["view"] },
  { key: "exports", labelKey: "exports", href: "/exports", actions: ["view"] },
  {
    key: "events",
    labelKey: "events",
    href: "/events",
    actions: ["view", "write", "update", "delete"],
  },
  {
    key: "patrols",
    labelKey: "patrols",
    href: "/patrols",
    actions: ["view", "write", "update", "delete"],
  },
  {
    key: "patrol-areas",
    labelKey: "patrolAreas",
    href: "/patrol-areas",
    actions: ["view", "write", "update", "delete"],
  },
  {
    key: "patrol-schedule",
    labelKey: "patrolSchedule",
    href: "/patrol-schedule",
    actions: ["view", "write", "update", "delete"],
  },
  {
    key: "notifications",
    labelKey: "notifications",
    href: "/notifications",
    actions: ["view", "update"],
  },
  {
    key: "fuel",
    labelKey: "fuel",
    href: "/fuel",
    actions: ["view", "write", "update", "delete"],
  },
  { key: "alerts", labelKey: "alerts", href: "/alerts", actions: ["view", "update"] },
  {
    key: "subjects",
    labelKey: "subjects",
    href: "/subjects",
    actions: ["view", "write", "update", "delete"],
  },
  { key: "sync", labelKey: "sync", href: "/sync", actions: ["view"] },
] as const;

/**
 * Keys reserved as NEVER-grantable via a custom role (User Management,
 * tenant Settings, Billing, and personal Profile). Billing has no dedicated
 * nav item today but is reserved defensively per tenant-rbac-standard §4.
 */
export const RESERVED_FEATURE_KEYS: readonly string[] = [
  "users",
  "settings",
  "billing",
  "profile",
];

export type FeatureKey = (typeof FEATURE_REGISTRY)[number]["key"];

/** All grantable feature keys (same keys as FEATURE_REGISTRY, in order). */
export const GRANTABLE_FEATURE_KEYS: readonly string[] = FEATURE_REGISTRY.map(
  (feature) => feature.key,
);

/** True iff `key` is a grantable (non-reserved) feature in the registry. */
export function isGrantableFeature(key: string): boolean {
  return GRANTABLE_FEATURE_KEYS.includes(key);
}

/** Looks up a feature definition by key, or undefined if not found. */
export function getFeature(key: string): FeatureDef | undefined {
  return FEATURE_REGISTRY.find((feature) => feature.key === key);
}

/** The actions a feature exposes, or [] if the key is unknown. */
export function featureActions(key: string): FeatureAction[] {
  return getFeature(key)?.actions ?? [];
}
