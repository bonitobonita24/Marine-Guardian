# Production promotion — READY (staged 2026-07-21)

**Candidate image:** `bonitobonita24/marine-guardian:sha-bb2aa50`
**Currently on prod:** `sha-a08c700` (app + worker)
**Validated on staging:** yes — full data-first gate green against a fresh copy of production data.

> **Status: NOT PROMOTED.** Everything below is staged for the owner to run.
> Nothing in this document has been executed against production.

---

## What staging proved

| Check | Result |
|---|---|
| Staging DB refreshed from a live prod copy | ok |
| All 4 migrations applied to prod-shaped data | ok |
| `prisma migrate status` — "schema is up to date" | ok (hard-gated) |
| Attribution data intact after refresh | Dumaran 271 · Roxas 368 · Baco 51 · 4603 attributed patrols — exact match to prod |
| Unpaired attribution rows after migration | **0** on both `patrols` and `events` |
| App + worker both on the candidate image | `sha-bb2aa50` |
| `/api/health` | 200 |
| Feature spot-checks | "Unattributed only" + "Needs review" filters on Patrols and Events, Blue Alliance header logo, `/showcase/timeline` |

Because staging showed **0 unpaired rows** after migrating the same data prod holds,
`scripts/repair-municipality-attribution-pairing.ts` is expected to be a no-op on prod.
Step 6 still verifies this rather than assuming it.

---

## ⚠ The one ordering rule that matters

Migration `20260721020000_enforce_municipality_attribution_pairing` adds a CHECK constraint
that **rejects writes from any worker built before `825cf6c`**. A pre-`825cf6c` worker sets
`municipality_id` without the attribution method; once the constraint exists that write is
refused and the assign job fails loudly.

The sequence below removes the risk entirely: **the worker is stopped while migrations apply
and only comes back on the new image.** No stale writer can touch the DB across the boundary.
This is exactly the sequence that was rehearsed on staging.

The constraint is `NOT VALID`, so it does not scan pre-existing rows — the migration cannot
fail on legacy backlog. It enforces on every INSERT/UPDATE from that moment on.

---

## The promotion sequence

Run from the repo root at `main` = `bb2aa50`. Prod DB is reached over an SSH tunnel on an
**ephemeral local port** (never local==remote `DB_PORT`, which is 5434).

### 1 — Back up production (rollback point)

```bash
ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "U=\$(docker exec marine-guardian_prod_postgres printenv POSTGRES_USER); \
   D=\$(docker exec marine-guardian_prod_postgres printenv POSTGRES_DB); \
   docker exec marine-guardian_prod_postgres pg_dump -U \$U -d \$D \
   | gzip > /root/mg-prod-backup-pre-bb2aa50-\$(date -u +%Y%m%d-%H%M%S).sql.gz && echo ok"
```

### 2 — Pin the tag and pull app + worker (before anything stops)

```bash
ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "cd /etc/komodo/stacks/marine-guardian && \
   sed -i 's/^APP_IMAGE_TAG=.*/APP_IMAGE_TAG=sha-bb2aa50/' .env && \
   docker compose -p marine-guardian_prod --env-file .env \
     -f docker-compose.app.yml -f docker-compose.db.yml -f docker-compose.cache.yml \
     -f docker-compose.storage.yml -f docker-compose.pdf-renderer.yml \
     pull app worker && echo ok"
```

### 3 — Stop app + worker (removes the stale writer)

```bash
ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "cd /etc/komodo/stacks/marine-guardian && \
   docker compose -p marine-guardian_prod -f docker-compose.app.yml stop app worker && echo ok"
```

### 4 — Migrate production

`INTERNAL_DATABASE_URL` points **directly at Postgres**, not pgbouncer — keep it that way;
Prisma migrations must not run through the pooler.

```bash
# ephemeral local port, decoupled from the remote DB_PORT (5434)
LOCALPORT=45610
ssh -i ~/.ssh/powerbyte_hostinger -N -L ${LOCALPORT}:localhost:5434 root@72.62.74.203 &
TUN=$!
sleep 3
ss -ltn "sport = :${LOCALPORT}" | grep -q LISTEN || { echo "ABORT: tunnel down"; kill $TUN; exit 1; }

DBURL=$(ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "grep -oP '(?<=^INTERNAL_DATABASE_URL=).*' /etc/komodo/stacks/marine-guardian/.env" \
  | sed -E "s#@[^:/]+:[0-9]+#@localhost:${LOCALPORT}#")

DATABASE_URL="$DBURL" pnpm --filter @marine-guardian/db db:migrate:deploy
```

Expect exactly these four to apply:

```
20260720000100_add_report_type_event_highlights
20260721000000_add_municipality_attribution_provenance
20260721010000_add_title_hint_attribution_method
20260721020000_enforce_municipality_attribution_pairing
```

> If the DB password is ever rotated to one containing `/ @ : ? #`, percent-encode it in the
> URL or Prisma fails with `P1013`. The current prod password needs no encoding.

### 5 — HARD GATE: schema status must be clean before anything comes up

```bash
DATABASE_URL="$DBURL" pnpm --filter @marine-guardian/db exec prisma migrate status
```

**Must report "Database schema is up to date."** If it does not, **stop here** — do not bring
the app up. A green `/health` on a half-migrated schema is exactly the false positive this
gate exists to prevent. Restore from the step-1 backup if needed.

### 6 — Verify pairing, repair only if needed

```bash
ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "U=\$(docker exec marine-guardian_prod_postgres printenv POSTGRES_USER); \
   D=\$(docker exec marine-guardian_prod_postgres printenv POSTGRES_DB); \
   docker exec marine-guardian_prod_postgres psql -U \$U -d \$D -A -F'|' \
   -c \"SELECT 'unpaired_patrols', count(*) FROM patrols WHERE (municipality_id IS NULL) <> (municipality_attribution_method IS NULL);\" \
   -c \"SELECT 'unpaired_events', count(*) FROM events WHERE (municipality_id IS NULL) <> (municipality_attribution_method IS NULL);\""
```

Expected: **0 and 0** (staging produced 0 on this same dataset). If either is non-zero:

```bash
DATABASE_URL="$DBURL" pnpm --filter @marine-guardian/jobs exec tsx \
  ../../scripts/repair-municipality-attribution-pairing.ts --dry-run
# review the plan, then:
DATABASE_URL="$DBURL" pnpm --filter @marine-guardian/jobs exec tsx \
  ../../scripts/repair-municipality-attribution-pairing.ts --execute
```

The script recomputes containment per row, refuses to guess when the recomputed value
disagrees with the stored one, leaves manual rows alone, and runs `VALIDATE CONSTRAINT`
once the table is provably clean.

Close the tunnel: `kill $TUN`

### 7 — Bring production up on the new image

```bash
ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "cd /etc/komodo/stacks/marine-guardian && \
   docker compose -p marine-guardian_prod --env-file .env \
     -f docker-compose.app.yml -f docker-compose.db.yml -f docker-compose.cache.yml \
     -f docker-compose.storage.yml -f docker-compose.pdf-renderer.yml \
     up -d app worker && echo ok"
```

### 8 — Verify production

```bash
# health
curl -s -o /dev/null -w 'health=%{http_code}\n' https://<prod-domain>/api/health

# both services actually on the new image
ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "docker inspect --format '{{.Name}} => {{.Config.Image}}' \
   marine-guardian_prod_app marine-guardian_prod_worker"
# expect: sha-bb2aa50 for BOTH

# attribution numbers unchanged by the migration
ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "U=\$(docker exec marine-guardian_prod_postgres printenv POSTGRES_USER); \
   D=\$(docker exec marine-guardian_prod_postgres printenv POSTGRES_DB); \
   docker exec marine-guardian_prod_postgres psql -U \$U -d \$D -A -F'|' \
   -c \"SELECT m.name, count(*) FROM patrols p JOIN municipalities m ON m.id=p.municipality_id \
       WHERE m.name IN ('Dumaran','Roxas','Baco') GROUP BY m.name ORDER BY m.name;\" \
   -c \"SELECT 'attributed', count(*) FROM patrols WHERE municipality_id IS NOT NULL;\""
# expect: Baco 51 · Dumaran 271 · Roxas 368 · attributed 4603
```

Then spot-check in a browser: "Unattributed only" and "Needs review" filters on Patrols and
Events, the Blue Alliance header logo, and `/showcase/timeline`.

---

## Rollback

```bash
ssh -i ~/.ssh/powerbyte_hostinger root@72.62.74.203 \
  "cd /etc/komodo/stacks/marine-guardian && \
   sed -i 's/^APP_IMAGE_TAG=.*/APP_IMAGE_TAG=sha-a08c700/' .env && \
   docker compose -p marine-guardian_prod --env-file .env -f docker-compose.app.yml \
     up -d app worker"
```

⚠ Rolling the **image** back while the new **schema** stays in place puts a pre-`825cf6c`
worker behind the pairing CHECK — the assign job will fail loudly (by design, not silently).
A true rollback means restoring the step-1 DB dump as well. Prefer fixing forward.

---

## What is in this release

57 commits, `a08c700..bb2aa50`, two sessions of work:

- **Reports / map overhaul** — ephemeral MinIO-backed exports + TTL janitor, report-type
  checklist, shared boundary scope hierarchy, whole patrol tracks, zone-level traversing
  credit toggle, Event Highlights report, map control relocation.
- **Municipality attribution** — provenance columns, containment provenance recorded on
  assignment, value+provenance made inseparable (CHECK), one-time backlog backfill,
  "Unattributed only" filters on Patrols and Events, officer review filter for
  heuristically-attributed records, manual override with ER-sync anti-clobber.
- **Showcase** — Development Timeline subpage, React #418 hydration fix.
- **Other** — Blue Alliance header logo; municipality geometry hot path 1.8× faster
  (output-identical); worker lock duration fix for the CPU-bound assign job.

Local gate before push: typecheck 7/7, lint 6/6, tests 6/6 (web alone 2403 tests / 184 files).
