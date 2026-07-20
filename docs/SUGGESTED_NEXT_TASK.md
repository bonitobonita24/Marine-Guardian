# ⭐ Suggested next task — SEO Foundation retrofit (framework V32.30)

> Dropped by the Powerbyte-AIEF seat on 2026-07-19. This is a SUGGESTION, not a
> committed change. Adopting it is dev-first + OWNER-GATED (HARD HOLD — local only;
> no staging/prod/demo deploy without your explicit word).

## What
The AIEF framework now bakes **SEO as an always-on, adaptive baseline** into every
app (V32.30, Rule 35 + `.ai_prompt/seo.md` + Scenario 44). Public routes get full
SEO (canonical, Open Graph, Twitter cards, JSON-LD, sitemap, indexable); private/
authed routes get `noindex,nofollow` + robots disallow + sitemap exclusion. Built on
Next.js App Router primitives (metadata/generateMetadata, app/sitemap.ts, app/robots.ts,
hreflang, next/og). No new PRODUCT.md section, no interview — values come from your
existing App Identity + env.

**Marine-Guardian** is already built, so it does not get this automatically — it needs a
one-time **retrofit** (Scenario 44).

## How (when you're ready)
1. **Sync the framework to V32.30** — run the `register-to-aief` skill in this folder
   ("check this project for AIEF" / "sync V32.30 into this app"); it hands to
   `prep-sync` for a safe governance-only update (`.ai_prompt/seo.md` etc.).
2. **Run Scenario 44 (SEO retrofit)** — read `.ai_prompt/seo.md` + `.ai_prompt/scenarios.md`
   Scenario 44; scaffold the adaptive SEO baseline (public vs private routes), then run
   the Phase-5 SEO validation gate (Lighthouse SEO ≥ 90 on public-facing routes).
3. Commit LOCAL only. Staging/prod/demo stays owner-gated.

## Why it's safe to defer
SEO is additive and non-breaking. This note just surfaces the opportunity — nothing
changes until you run it.

## Also (V32.31) — SEO is now a design/content concern, not just tags
SEO isn't only meta tags/sitemap — for public marketing/landing surfaces, being
Google-friendly is decided at the DESIGN + CONTENT stage (mockup/prototype): single
H1, heading hierarchy, keyword-informed copy, semantic structure, alt text, and
CWV-aware layout. When you run the Scenario 44 retrofit above, it now ALSO does a
**content/design SEO pass** on your public/marketing/landing surfaces (heading
hierarchy, copy, semantics, alt text, CWV) — not just technical tags.
See `.ai_prompt/seo.md` §1.5 once synced to V32.31.
