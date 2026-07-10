/**
 * App version — mirrors the annotated git release tag (versioning-standard: git owns versions).
 * NEXT_PUBLIC_APP_VERSION overrides at build time (staging appends the -rc.N suffix); this
 * constant is the frozen fallback baked into the bundle for the current release.
 */
export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "1.1.0";
