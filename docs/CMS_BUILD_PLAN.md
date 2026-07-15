# WYSIWYG CMS Build Plan — docs + showcase (Marine-Guardian)

> **Status:** PLANNED + spiked, NOT yet built. This is the executable brief for the next session.
> Branch `feat/app-showcase-page`. LOCAL only, HARD HOLD (no push/staging/prod). Dev :45204 (Docker,
> source baked → rebuild with `bash deploy/compose/start.sh dev up -d --build`).
> ⚠ Workers must write files with the Write/Edit tool ONLY (never bash heredoc/ctx_execute — they don't
> persist in this env). Lesson: `subagent.file-write.bash-heredoc-not-persisted`.

## Owner-confirmed decisions
- **DB-backed CMS** (edit anywhere): content lives in Postgres, admins edit live in-browser, Save
  persists, pages render FROM the DB, works in dev/staging/prod.
- **Scope:** BOTH `/docs` pages AND `/showcase` content editable.
- **Editor = Plate (platejs, shadcn-native)**, admin-gated "Edit" toggle, **Ctrl+V + drag-drop image
  paste → object storage**.
- **Edit gate = platform admin only** (`platformAdminProcedure` = role `tenant_manager` + empty
  `tenantId`). NOT `tenant_superadmin`. Content is GLOBAL.
- **Content is GLOBAL** (not tenant-scoped — `/docs` + `/showcase` are public unauth routes). Add a
  **nullable `tenantId`** column now as cheap future-proofing, but everything runs global.
- **Body = Markdown (GFM)** in DB (all 40+ MG docs are plain markdown, zero JSX → lossless). Add a
  nullable `bodyJson` (Plate value) column as a fallback only if fidelity fails.
- **Public render of CMS content = `react-markdown` + `remark-gfm`** (NOT raw `compileMDX`) — avoids the
  MDX literal-char trap where user-typed `{` or `<` makes `compileMDX` throw. Plate is client/edit-only.
- **Media:** admin-gated `POST /api/cms/media` (raw bytes, no presign) → `uploadImage`; **public**
  `GET /api/cms/media/[...key]` streams bytes (docs/showcase are public). Key prefix `cms/` in the
  existing `-exports` bucket (no new infra). **Widen the storage `ImageContentType` union to include
  `image/webp`** (pasted screenshots are often webp). Reuse `requireRouteAuth` + `rateLimiters.upload`.

## Spike-confirmed facts (Plate v53.x, 2026-07-15)
- Packages: `platejs@53.2.4`, `@platejs/markdown@53.2.2`, `@platejs/media@53.1.4`,
  `@platejs/basic-nodes@53.0.0`. Peer react>=18 (React 19 OK), Tailwind-version-agnostic (MG TW 3.4 OK).
- shadcn Plate UI via a registry in `apps/web/components.json` → `"@plate": "https://platejs.org/r/{name}.json"`,
  then `npx shadcn@latest add @plate/editor-basic` (or individual `@plate/fixed-toolbar`,
  `@plate/media-toolbar-button`, etc.). Run `npx shadcn@latest view @plate/editor-basic` first to see kit contents.
- Markdown API: `editor.getApi(MarkdownPlugin).markdown.deserialize(md)` / `.serialize()`; static:
  `deserializeMd(editor, md)` / `serializeMd(editor,{value})` over `createSlateEditor({plugins})`. **Enable
  `remark-gfm`** for tables. Frontmatter (title/description/slug) is NOT part of the Plate body — store as
  separate DB columns, reattach on render.
- Paste/drop: `@platejs/media` `ImagePlugin` + `PlaceholderPlugin` + a custom `useUploadFile` hook →
  POST bytes to `/api/cms/media` → `{url}` → `editor.tf.replace.placeholder({id, url, type})`. One hook
  covers paste AND drop.
- Storage (`packages/storage/src/index.ts`): `uploadImage({bucket,key,body,contentType})` (enforces
  `MAX_IMAGE_BYTES=10MiB`; contentType union currently png|jpeg → widen to +webp), `getImageBytes`,
  `getImageReadStream`, `getExportsBucketName()` → `marine-guardian-${env}-exports`. Add
  `buildCmsMediaKey(tenantId, mediaId, ext)` = `cms/${tenantId||'global'}/${mediaId}.${ext}`.
- Auth: `platformAdminProcedure` (`server/trpc/routers/*` / `require-platform-admin.ts`) for edit;
  `requireRouteAuth()` (`server/lib/route-auth.ts`, throws `RouteAuthError` w/ `.response`) for the upload
  route; `rateLimiters.upload` (20/min). ⚠ The public GET media route must be PUBLIC (add to
  `middleware.ts` publicPaths) and NOT tenant-scoped (content is global) — unlike the existing tenant-scoped
  `/api/assets/[id]` route; copy its serving hygiene (mime allowlist, nosniff, no SVG) but drop tenant-scope.
- **Could-not-verify (confirm at build):** exact shadcn `@plate` kit component names; the
  `editor.tf.replace.placeholder` signature (docs, not installed source); whether MG's current docs
  `compileMDX` enables remark-gfm (we're switching CMS content to react-markdown anyway); GFM round-trip
  not executed (assert then test).

## Dependency-ordered workers (W1 spike already DONE — findings above)
- **W2 — Prisma model + migration + seed [SEQ first].** Models: `DocPage {id, slug@unique, parentSlug?,
  kind(page|folderIndex), title, description?, orderInParent, bodyMarkdown, bodyJson? Json, published,
  tenantId? , updatedAt, updatedById?}`; `ShowcaseField {key@unique, value, valueJson? Json, tenantId?,
  updatedAt, updatedById?}`; `CmsMedia {id, key@unique, mimeType, bytes, scope(docs|showcase), tenantId?,
  uploadedById?, createdAt}`. Migration `add_cms_content_models` (additive). Seed `seed-cms.ts` (called from
  seed.ts): import current `content/docs/**.mdx` (gray-matter frontmatter+body) + `meta.json` order into
  `DocPage`; import `hero.tsx`/`sections.tsx`/`data.ts` literals into `ShowcaseField` (keys: `hero.headline`,
  `hero.subcopy`, `feature.<id>.title|body|bullets`, `problem.<id>.title|body`, `cta.label`). Idempotent
  upserts. Verify: migrate+seed clean, every MDX page + showcase literal present.
- **W3 — media routes + tRPC content layer [SEQ after W2].** `app/api/cms/media/route.ts` (POST, admin,
  validate mime png/jpeg/webp/gif + size, uploadImage, insert CmsMedia, return `{url:"/api/cms/media/<key>"}`)
  + `app/api/cms/media/[...key]/route.ts` (GET, PUBLIC, stream via getImageReadStream). Add GET path to
  middleware publicPaths. tRPC `cmsDocs` (tree/getBySlug public; update/create/delete/reorder platformAdmin)
  + `cmsShowcase` (getAll public; update platformAdmin); register in routers/index.ts. Vitest: public reads
  work; admin writes reject anon/non-platform-admin; media round-trips a PNG+webp to MinIO.
- **W4 — render /docs from DB [PAR with W5, after W3].** Replace FS reads in `src/lib/docs/source.ts`
  with Prisma-backed `getDocTree()`/`getDocPage(slug)` (keep the existing `DocsTreeNode`/`ResolvedDocPage`
  shapes so sidebar/doc-view change minimally). `doc-view.tsx` renders `bodyMarkdown` via **react-markdown +
  remark-gfm** (NOT compileMDX) with the existing shadcn token styling. Verify: all docs URLs render from DB
  identically, sidebar order matches old meta.json, build green.
- **W5 — wire /showcase text to DB [PAR with W4, after W3].** `showcase/page.tsx` (RSC) fetches
  `cmsShowcase.getAll` once, passes into hero/sections/features; replace inline literals with DB values keyed
  by stable id, **falling back to the current literal** (zero visual change pre-edit). Layout/animation/icons/
  images/accent stay in code. Verify: byte-identical when DB holds seeds; editing a row changes the page.
- **W6 — Plate editor UI + admin Edit toggle + paste-upload [SEQ after W3, UI can scaffold parallel].**
  Add Plate deps + shadcn @plate kit. `components/cms/plate-editor.tsx` (client): shadcn Editor, simple
  toolbar (headings, bold/italic, lists, links, inline+block code, image, table), MarkdownPlugin, media
  ImagePlugin+PlaceholderPlugin, `use-upload-file.ts` → POST /api/cms/media → insert URL on **Ctrl+V paste +
  drop**. Admin-only "Edit" toggle on docs pages (full-body Plate) + showcase (per-field inline rich text),
  visibility gated by a server-provided `isPlatformAdmin` flag (session in RSC/layout — anon never gets the
  editor). Save → serialize→markdown → cmsDocs.update / cmsShowcase.update. Honor DESIGN tokens.
- **W7 — end-to-end verify [SEQ last].** Rebuild dev. As platform admin: edit a docs page, **Ctrl+V a
  screenshot**, Save → persists; open anonymous → content+image render same-origin (CSP `img-src 'self'`
  intact). Showcase field edit persists. Non-admin/anon: no editor. build/typecheck/lint green across web/db/
  storage. No regression to existing docs URLs or showcase visuals.
- **W8 — skill-codification note [PAR anytime].** Spec what `app-showcase` must emit to GENERATE this CMS
  for any app: the content model shape, Plate setup (markdown body, react-markdown public render vs client
  edit), storage seam (`uploadImage`+served-route abstraction binding to the target app's object storage),
  and the seed-from-existing-content step. Parameterize: RBAC gate, storage package, CSP, bucket.

## Risks to respect
- Seed imports the FINAL post-Phase-1 docs MDX + images (Phase 1 is done — `bb358d2`). Rebase W2 on current HEAD.
- Platform-admin naming drift: code checks role `tenant_manager` even where comments say "super_admin".
- If Plate markdown loses table/code fidelity (test in W2/W6) → use the `bodyJson` column + Plate static
  read-only render as fallback (bigger; only if needed).
- Public CMS media GET is intentionally public (pages are public) — global, not tenant-scoped.

## Phase 3 (after CMS works) — codify into the `app-showcase` skill
Update `Powerbyte-AIEF/.claude/skills/app-showcase/SKILL.md` with: (1) the **in-app docs-site pattern**
(shadcn Sidebar + `next-mdx-remote` OR DB-backed, `/docs` route, meta/tree, per-feature screenshots, link
from showcase) as a new "Documentation site" mode, and (2) the **WYSIWYG CMS** capability (DB-backed content
+ Plate editor + Ctrl+V media paste + admin gate + seed-from-content) so the skill can generate showcase +
presentation + full documentation + the editor for any framework app. Use the W8 note as the source.
