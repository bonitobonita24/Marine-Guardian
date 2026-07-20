# SEO Foundation — on-demand reference (V32.30, deliverable #31)

> **Load this file at Phase 4 (scaffold) and Phase 5 (validation) — ALWAYS, on every framework-built
> app.** Unlike `notifications.md` (a CONDITIONAL capability gated on a PRODUCT.md signal), SEO is a
> **CONSTITUTIONAL, always-on concern** — the same posture as `security.md` (the L1–L6 stack): every
> app gets it, with no human planning step and no new PRODUCT.md section. Also read this file on the
> **Scenario 44** existing-app retrofit.
>
> **INHERIT-not-REPLACE:** where `docs/PRODUCT.md` App Identity, `docs/DESIGN.md`, or a project
> decision defines a concrete site name / base URL / OG image / locale set, that wins. This file is
> the standard *pattern* and *mechanism* that fills silence — it never invents App Identity values.

This is the fleet-standard way every framework-scaffolded app gets a correct, **adaptive** SEO
foundation on the locked stack (Next.js App Router) — no third-party SEO library, no manual
per-page boilerplate, and no risk of an authenticated route leaking into a search index. Companion:
`security.md` (route/auth boundary this file detects off of), `templates.md` (App Identity /
env-var sourcing), Rule 35 (the constitutional rule this file implements), Scenario 44 (retrofit).

---

## 0. Core principle — adaptive, always scaffolded, never wasted, never planned by a human

- **Always-on.** Every new app gets the SEO Foundation at Phase 4, automatically. There is no
  PRODUCT.md checkbox to turn it on, and no interview step asks for it — the Planning Assistant does
  **not** gain a new section for this. If it did, most apps would ship without it (the same failure
  mode `notifications.md`'s conditional gate deliberately avoids for its own domain — SEO doesn't get
  that luxury because search-engine and social-share correctness matters on every app that has ANY
  public surface, including an app that's "mostly internal" but still has a public marketing/login page).
- **Adaptive, not uniform.** A blanket "index everything" default is wrong (leaks tenant dashboards to
  Google) and a blanket "noindex everything" default is also wrong (a public marketing page needs full
  SEO to be findable at all). The foundation therefore branches on **public vs. private** per route —
  see §1.
- **Never wasted.** Nothing here duplicates a hand-authored `<title>` tag or a manually-maintained
  sitemap file — it is all generated from Next.js App Router's own file-based/metadata-export
  conventions, so it stays correct as routes are added in Phase 7 feature updates.

---

## 1. Adaptive public-vs-private behavior

**Detection heuristic:** the app's existing route-group / middleware-auth boundary — the SAME
boundary that already gates tRPC session access and page-level auth — determines which routes are
"public" and which are "private." Do not invent a second, separate classification; reuse the one the
app already has (e.g. an `(auth)` / `(dashboard)` route group behind the auth middleware = private;
everything outside it = public). **Fail-closed:** if a route's status is genuinely undetermined,
treat it as **private** (never default a route to public/indexable by omission).

| | Public route | Private / authed / internal route |
|---|---|---|
| `robots` metadata | `{ index: true, follow: true }` | `{ index: false, follow: false }` → renders `noindex,nofollow` |
| `app/sitemap.ts` | **included** | **excluded** |
| `app/robots.ts` | allowed (`allow: '/'`) | **disallowed** (explicit `disallow` prefix rule) |
| `alternates.canonical` | set | omitted (no canonical needed on a non-indexed page) |
| Open Graph / Twitter | full card | omitted (no social-share surface for a private page) |
| JSON-LD | emitted where relevant | never emitted |

```tsx
// app/(dashboard)/layout.tsx — private route group
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
```

```tsx
// app/(marketing)/layout.tsx — public route group
export const metadata: Metadata = {
  robots: { index: true, follow: true },
}
```

---

## 1.5. Design & content-time SEO — Google-friendly BY DESIGN (NEW V32.31)

> **Read this section at the Planning Assistant's DESIGN.md/MOCKUP.jsx generation step, Phase 2.8
> (mockup), and Phase 3.3 (prototype) — ALWAYS, for any PUBLIC-facing surface.** §§2-6 below are the
> TECHNICAL foundation, enforced at Phase 4 (scaffold) and Phase 5 (validation). This section is the
> DESIGN + CONTENT foundation that must be decided EARLIER — at mockup/content time — so the built
> frontend inherits it instead of needing it retrofitted. Especially important for a marketing site /
> landing page, where SEO IS the design brief; internal/authed apps get a lighter touch (they render
> `noindex,nofollow` per §1 regardless of content quality).

Being "Google-friendly" is not only a matter of emitting the right `<meta>` tags — it is a matter of
WHAT the page says and how it's structured, decided while the mockup/copy is being written, not after
the frontend is built. Checklist:

**Content & copy:**
- [ ] Keyword-informed headline + body copy — the hero/section copy reflects the terms a real
      searcher would use, not just brand-voice marketing language.
- [ ] Exactly ONE clear `<h1>` per page — never zero, never more than one.
- [ ] Logical `<h2>`/`<h3>` heading hierarchy — headings describe the section beneath them and nest
      in order (no skipped levels, no headings used purely for visual size).
- [ ] Descriptive link text ("View pricing plans", never "click here" / "read more" with no context).
- [ ] Real, crawlable TEXT content — the page's substance is actual DOM text, never image-only or
      rendered exclusively client-side with nothing in the initial HTML.

**Structure & semantics:**
- [ ] Semantic sectioning — `<header>`/`<main>`/`<nav>`/`<article>`/`<section>` used for their
      actual roles, not generic `<div>` soup.
- [ ] Above-the-fold clarity — a first-time visitor (and a crawler) can tell what the page/product is
      within the hero, without scrolling.
- [ ] Meaningful `alt` text planned WITH the imagery in the mockup — not added as an afterthought at
      Phase 4; every image call-out in DESIGN.md/MOCKUP.jsx carries its intended `alt` text.
- [ ] A descriptive `<title>` + meta description drafted FROM the actual page content (feeds the
      Phase-4 `metadata`/`generateMetadata` §2.1 implementation — content-time drafting, not
      scaffold-time invention).

**Performance-as-design (Core Web Vitals):**
- [ ] LCP-friendly hero — the largest above-the-fold element (hero image/heading) is right-sized and
      planned for `priority` loading; the mockup does not assume a huge unoptimized hero asset.
- [ ] CLS-stable layout — every image/embed/dynamic block reserves its dimensions in the mockup so
      nothing shifts on load; no layout that depends on content arriving before it stabilizes.
- [ ] No render-blocking heavy assets planned above the fold (large unlazy-loaded carousels, heavy
      client-only widgets) — these are MOCKUP-TIME layout choices, not a Phase-5 audit fix.

**Where it lands:** these decisions are captured directly in `docs/DESIGN.md` + `docs/MOCKUP.jsx` at
the Planning Assistant step / Phase 2.8 / Phase 3.3 (see `Planning_Assistant.md` Step 7), so the
frontend Phase 4 scaffolds and Phase 7 extends already carries them. The Phase-4 technical scaffold
(§5 below) and the Phase-5 Lighthouse SEO gate (§6 below) then CONFIRM these design-time decisions
were implemented — they do not invent them from scratch.

---

## 2. Next.js App Router primitives checklist (verified against current Next.js docs, context7 `/vercel/next.js`)

All of the following are **native Next.js App Router conventions** — no `next-seo`, no third-party
metadata package. Cited from live Context7 docs; nothing here is guessed from stale training memory.

### 2.1 `metadata` export / `generateMetadata()`
Static metadata via a plain exported object; dynamic (data-dependent) metadata via an async
`generateMetadata` function exported from `layout.tsx` or `page.tsx`. `generateMetadata` receives
`{ params, searchParams }` and an optional `parent` (`ResolvingMetadata`) to extend rather than
replace inherited metadata:
```tsx
import type { Metadata, ResolvingMetadata } from 'next'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const slug = (await params).slug
  const entity = await fetchPublicEntity(slug)
  const previousImages = (await parent).openGraph?.images || []
  return {
    title: entity.title,
    description: entity.description,
    alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/${slug}` },
    openGraph: { images: [entity.ogImage, ...previousImages] },
  }
}
```

### 2.2 `app/sitemap.ts` — `MetadataRoute.Sitemap`
```ts
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    // ...only PUBLIC routes; private/authed routes are never listed here
  ]
}
```
Multi-locale entries may carry per-entry `alternates.languages` for a language-aware sitemap:
```ts
{
  url: `${BASE_URL}/about`,
  lastModified: new Date(),
  alternates: { languages: { es: `${BASE_URL}/es/about`, de: `${BASE_URL}/de/about` } },
}
```

### 2.3 `app/robots.ts` — `MetadataRoute.Robots`
```ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/admin/', '/api/'], // every private route-group prefix
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
```

### 2.4 `alternates.canonical` + `alternates.languages` (hreflang)
Set `metadataBase` once (root layout) so relative `canonical`/OG image paths resolve to absolute
URLs automatically:
```ts
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!),
  alternates: {
    canonical: '/',
    languages: { 'en-US': '/en-US', 'de-DE': '/de-DE' }, // ONLY when PRODUCT.md declares >1 locale
  },
}
```
Resolves to `<link rel="canonical" href="…">` + `<link rel="alternate" hreflang="…" href="…">` tags.

### 2.5 Open Graph + Twitter card fields
```ts
export const metadata: Metadata = {
  openGraph: {
    title: 'Acme',
    description: '…',
    url: 'https://acme.com',
    siteName: 'Acme',
    images: [{ url: 'https://acme.com/og-default.png', width: 1200, height: 630 }],
    locale: 'en_US',
    type: 'website',
  },
}
```
**Unverified-flag:** Context7 confirms Twitter card fields auto-fill from `openGraph` when the
`twitter` object omits `title`/`description`/`images` — so a minimal app only needs to set
`openGraph`; do not hand-duplicate the same values into `twitter` unless a field must diverge.

### 2.6 Dynamic OG image — `opengraph-image` / `next/og` `ImageResponse` (OPT-IN)
Only wire this when `PRODUCT.md` signals a per-page/per-post dynamic OG need (e.g. a blog, a
listing with a title-card requirement). Default behavior is a single static `defaultOgImage` from
App Identity — do not scaffold `ImageResponse` unconditionally.
```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  return new ImageResponse(
    (
      <div style={{ fontSize: 128, background: 'white', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {post.title}
      </div>
    )
  )
}
```

### 2.7 `robots` metadata field (page-level noindex/nofollow)
```ts
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
}
```
Renders `<meta name="robots" content="noindex, nofollow" />` — this is the exact mechanism §1 uses
on every private route-group layout.

---

## 3. Config sourcing (no new interview)

SEO config values come from **two places only** — never fabricated, never re-interviewed:

1. **`docs/PRODUCT.md` → App Identity section** (already exists on every app — this file adds NO new
   section): app/site name, tagline/description, default locale(s), and a default OG image asset
   reference if App Identity names one.
2. **Environment variables**, per env (dev/staging/prod), the standard being:
   - `NEXT_PUBLIC_SITE_URL` — the base URL `metadataBase` resolves against (differs per env: local
     dev URL, staging domain, prod domain — mirrors the existing per-env `.env` pattern the rest of
     the framework already uses).
   - A default OG image path/URL, if not literally named in App Identity (fallback: a generated
     brand-mark placeholder, never a fabricated marketing image).

**If App Identity is silent on a value the scaffold needs** (e.g. no locale declared, no OG image
named), the scaffold uses the narrowest safe default (single default locale = no `alternates.languages`
block; a plain text-based OG card if no image asset exists) and **flags the gap** rather than
inventing brand content. This mirrors the "flag what's unverified" discipline used everywhere else in
the framework's Context7 sourcing.

---

## 4. JSON-LD structured-data types

Public routes only; emitted as `<script type="application/ld+json">` inside the page/layout.

- **`Organization`** — always, once, at the root public layout (name, url, logo from App Identity).
- **`WebSite`** — always, once, at the root public layout (name, url; optional `SearchAction` if the
  app has a public search feature).
- **`BreadcrumbList`** — on nested public routes (e.g. `/blog/[slug]`, `/pricing/[plan]`) reflecting
  the route hierarchy.
- **Extensible per app domain** — `Article` (blog/news apps), `Product` (catalog/e-commerce apps),
  etc., added on a PRODUCT.md domain signal, following the same "adaptive, sourced from real app
  data, never fabricated" rule as the rest of this file.

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: appName,
      url: baseUrl,
      logo: `${baseUrl}/logo.png`,
    }),
  }}
/>
```

---

## 5. Phase-4 scaffold checklist (what Claude Code emits, automatically, on every app)

- [ ] Root `app/layout.tsx` sets `metadataBase` + base `metadata` (title template, description,
      default `openGraph`/`twitter`, `Organization` + `WebSite` JSON-LD).
- [ ] Every private route-group layout (the app's existing auth boundary) sets
      `robots: { index: false, follow: false }`.
- [ ] Every public route/page sets or inherits `alternates.canonical` + `openGraph`/`twitter`.
- [ ] `app/sitemap.ts` emits only public routes (static + dynamic — iterate real data for dynamic
      public routes, e.g. published blog posts); private routes never appear.
- [ ] `app/robots.ts` allows `/`, explicitly disallows every private route-group URL prefix, and
      points `sitemap:` at the deployed sitemap URL.
- [ ] `alternates.languages` wired ONLY when PRODUCT.md App Identity declares more than one locale.
- [ ] Dynamic `opengraph-image` scaffolded ONLY on a PRODUCT.md per-page-OG signal (§2.6); otherwise
      a single static default OG image is used fleet-wide for that app.
- [ ] `BreadcrumbList` JSON-LD added to nested public routes as they're scaffolded.

## 6. Phase-5 SEO validation gate checklist

- [ ] Every route (public and private) exports resolvable `metadata`/`generateMetadata` — no route
      falls through to a bare Next.js default title.
- [ ] `app/sitemap.ts` and `app/robots.ts` build clean (no runtime error, valid XML/txt output).
- [ ] Every public route carries `alternates.canonical` + `openGraph` + `twitter` (or an inherited
      equivalent from a parent layout).
- [ ] Every private route carries `robots: { index: false, follow: false }` **and** is covered by an
      `app/robots.ts` `disallow` rule **and** is absent from `app/sitemap.ts` — all three, not just one.
- [ ] Structured data (JSON-LD) on public routes validates as well-formed JSON matching the declared
      `@type`.
- [ ] `alternates.languages` present on every public route when PRODUCT.md declares multi-locale.
- [ ] **Lighthouse SEO score ≥ 90 — HARD GATE for any app with at least one public-facing route**
      (marketing/landing/docs/auth-less pages). For a fully internal/back-office-only app (no public
      surface at all), this is advisory rather than a hard block — but the private-route noindex/
      disallow checks above stay mandatory regardless.
- [ ] No private-route content or metadata (title, description, OG image) leaks into a public
      sitemap or a public JSON-LD block.

Phase 5 CANNOT close until this checklist is green, the same posture as the existing `lint-deploy.sh`
/ `lint-design.sh` gates.

## 7. Retrofit (existing app, not newly scaffolded)

Follow **Scenario 44 — Existing-App SEO Foundation Retrofit**: dev-first, LOCAL-only build (the
framework's deploy **HARD HOLD** applies exactly as it does to every other retrofit scenario —
Scenario 42's RBAC retrofit, Scenario 43's notifications build — staging/prod promotion requires the
owner's explicit word, per `~/.claude/rules/deploy-discipline.md`). The retrofit runs the Phase-4
scaffold checklist (§5) against the existing route tree and the Phase-5 validation gate (§6) before
the branch is considered done.

**Content/design SEO pass (NEW V32.31):** the retrofit is not only technical tags — Scenario 44 also
runs a content/design pass against §1.5 above on the app's existing public/marketing/landing surfaces:
audit and fix heading hierarchy (single `<h1>`, logical `<h2>`/`<h3>`), keyword-informed copy, semantic
structure, `alt` text, and CWV-affecting layout, alongside the metadata/sitemap/robots/JSON-LD work.
