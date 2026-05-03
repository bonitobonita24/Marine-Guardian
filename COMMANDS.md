# Marine Guardian — Command Reference

All commands run from the project root unless noted otherwise.
Dev environment: WSL2 Ubuntu terminal (MODE A — the only supported dev environment).

---

## 🐳 Docker — Start / Stop / Rebuild

| Command | What it does |
|---|---|
| `bash deploy/compose/start.sh dev up -d` | Start all dev services (DB + cache + MailHog + pgAdmin + app + worker). App rebuilds from source. |
| `bash deploy/compose/start.sh dev down` | Stop all dev services (containers removed, volumes preserved) |
| `bash deploy/compose/start.sh stage up -d` | Start staging services (pulls image from Docker Hub) |
| `bash deploy/compose/start.sh prod up -d` | Start production services (pulls image from Docker Hub) |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml logs -f` | Tail all app/worker logs |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml logs -f app` | Tail app container logs only |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml logs -f worker` | Tail worker container logs only |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml ps` | Check app/worker health status |
| `docker compose -f deploy/compose/dev/docker-compose.db.yml ps` | Check DB + PgBouncer health |
| `docker compose -f deploy/compose/dev/docker-compose.cache.yml ps` | Check Valkey health |

---

## 🧹 Docker — Clean / Clear / Reset

> ⚠ These commands are destructive. Read carefully before running.

| Command | What it does | Data lost? |
|---|---|---|
| `bash deploy/compose/start.sh dev down` | Stop + remove containers | ❌ No (volumes kept) |
| `bash deploy/compose/start.sh dev down --volumes` | Stop + remove containers + volumes | ✅ YES — all DB + cache data |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml build --no-cache` | Rebuild app image from scratch | ❌ No |
| `docker builder prune -f` | Remove dangling build cache | ❌ No |
| `docker builder prune -a -f` | Remove ALL build cache (free disk space) | ❌ No |
| `docker system prune -f` | Remove stopped containers + dangling images + cache | ❌ No |
| `docker volume rm marine-guardian_dev_postgres_data` | Remove dev PostgreSQL volume | ✅ YES — dev DB data |
| `docker volume rm marine-guardian_dev_valkey_data` | Remove dev Valkey volume | ✅ YES — dev cache |
| `docker volume ls` | List all Docker volumes | — |
| `docker image ls` | List all Docker images | — |

**Full dev environment reset (nuclear — wipes all dev data and rebuilds):**
```bash
bash deploy/compose/start.sh dev down --volumes   # stop + remove volumes
docker builder prune -f                            # clear build cache
bash deploy/compose/start.sh dev up -d             # rebuild + restart
pnpm db:migrate                                    # re-run migrations
pnpm db:seed                                       # re-seed (creates webmaster account)
```

---

## 📦 Docker — Image Build & Push (Manual Pipeline)

| Command | What it does |
|---|---|
| `bash deploy/compose/push.sh dev` | Build app image from source, run tests, push dev tags to Docker Hub |
| `bash deploy/compose/push.sh staging` | Re-tag last dev image as staging, push to Docker Hub |
| `bash deploy/compose/push.sh prod` | Re-tag last staging image as production, push to Docker Hub |
| `docker pull bonitobonita24/marine-guardian:staging-latest` | Pull staging image on staging server |
| `docker pull bonitobonita24/marine-guardian:latest` | Pull prod image on production server |

**Tag format:**
- `:dev-latest` — latest dev build (mutable)
- `:dev-sha-{hash}` — specific dev commit (immutable)
- `:staging-latest` — latest promoted to staging (mutable) — Komodo auto-update watches this
- `:staging-sha-{hash}` — specific staging commit (immutable)
- `:latest` — current production (mutable)
- `:prod-sha-{hash}` — specific production commit (immutable)

**Rollback:** set `APP_IMAGE_TAG=prod-sha-{previous-hash}` in `.env.prod` → `docker compose up -d`

---

## 🗄️ Database

| Command | What it does |
|---|---|
| `pnpm db:migrate` | Run all pending Prisma migrations |
| `pnpm db:generate` | Regenerate Prisma client after schema change |
| `pnpm db:seed` | Run seed script — creates webmaster account + demo data |
| `pnpm db:reset` | Drop + recreate + migrate + seed (**dev only** — destroys all dev data) |
| `pnpm db:studio` | Open Prisma Studio at http://localhost:45214 |
| `pnpm db:migrate --create-only` | Create migration file without running it |
| `pnpm db:migrate deploy` | Run migrations on staging/prod (safe — no data loss) |

**First admin account** (created by `pnpm db:seed`):
| Field | Value |
|-------|-------|
| Username | `webmaster` |
| Password | See `CREDENTIALS.md` → "First Admin Account" section |
| URL | http://localhost:45204/login |

⚠ Change the webmaster password immediately after first production login.

---

## 🧪 Testing

| Command | What it does |
|---|---|
| `pnpm test` | Run all tests (unit + integration) |
| `pnpm test --watch` | Watch mode (re-runs on file change) |
| `pnpm test --coverage` | With coverage report |
| `pnpm test --passWithNoTests` | No-fail if no test files yet |

---

## 🔍 Code Quality

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint across all packages |
| `pnpm lint --fix` | Auto-fix lint issues |
| `pnpm typecheck` | TypeScript type check (tsc --noEmit) |
| `pnpm format` | Prettier format all files |
| `pnpm build` | Full production build via Turborepo |
| `pnpm audit --audit-level=high` | Dependency CVE scan |
| `pnpm audit --fix` | Auto-fix CVEs where possible |

---

## ⚙️ Governance & Validation

| Command | What it does |
|---|---|
| `pnpm tools:validate-inputs` | Validate inputs.yml against schema |
| `pnpm tools:check-env` | Check all required env vars are set in .env.dev |
| `pnpm tools:check-product-sync` | Validate PRODUCT.md ↔ inputs.yml alignment + private tag check |
| `pnpm tools:hydration-lint` | Check for SSR hydration mismatches in apps/ |

---

## 🌿 Git Workflow (Rule 23)

| Command | What it does |
|---|---|
| `git checkout -b feat/{slug}` | Create feature branch before any work |
| `git add -A && git commit -m "feat(module): description"` | Atomic conventional commit |
| `git checkout main && git merge --squash feat/{slug}` | Squash-merge to main |
| `git branch -d feat/{slug}` | Delete feature branch after merge |
| `git rev-parse --short HEAD` | Get short SHA (used in image tags) |

---

## 🤖 AI Agent Triggers

| What to say in Claude Code | What it does |
|---|---|
| `Feature Update` | Start Phase 7 — implement a PRODUCT.md change |
| `Start Phase 8` | Begin iterative buildout loop |
| `Resume Session` + 3 docs | Resume from STATE.md position |
| `Governance Sync` + 9 docs | Reconcile code ↔ governance docs |
| `Governance Retro` | Run retrospective on last session |
| `Re-run Phase 2.7` | Re-run spec stress-test |

---

## 🔌 Dev Services — URLs

| Service | URL | Notes |
|---|---|---|
| App | http://localhost:45204 | Marine Guardian web app |
| Worker | (background process) | BullMQ: er-sync, alerts, email, maintenance queues |
| pgAdmin | http://localhost:45201 | PostgreSQL web UI — see CREDENTIALS.md |
| MailHog | http://localhost:45200 | Dev email catcher (SMTP UI) |
| Prisma Studio | http://localhost:45214 | Visual DB browser (when `pnpm db:studio` running) |

> All ports are in `.env.dev` — run `cat .env.dev | grep _PORT` to see them all.

---

## 🔐 Credentials & Secrets

| Command | What it does |
|---|---|
| `cat CREDENTIALS.md` | View all credentials (gitignored — safe to view locally) |
| `grep -i password CREDENTIALS.md` | Quick lookup of all passwords |
| `openssl rand -base64 32 \| tr -d '\n' \| head -c 22` | Generate a strong 22-char password |
| `openssl rand -base64 64 \| tr -d '\n' \| head -c 48` | Generate a 48-char signing secret |
| `git status \| grep CREDENTIALS` | Verify CREDENTIALS.md is NOT tracked by git |
| `git rm --cached CREDENTIALS.md` | Untrack CREDENTIALS.md if accidentally committed |

> ⚠ CREDENTIALS.md is gitignored. If others clone this repo they will NOT see it.
> They must run Phase 3 to generate their own credentials from .env.example.

---

## 🛠️ Utilities

| Command | What it does |
|---|---|
| `cat .env.dev \| grep _PORT` | List all assigned ports for dev environment |
| `docker stats` | Live CPU/memory/network stats for all containers |
| `docker exec -it marine-guardian_dev_postgres psql -U marine-guardian_dev -d marine-guardian_dev` | Open PostgreSQL shell |
| `docker exec -it marine-guardian_dev_valkey valkey-cli -a $REDIS_PASSWORD` | Open Valkey (Redis) CLI |
| `docker logs marine-guardian_dev_app --tail 100` | Last 100 lines of app logs |
| `docker logs marine-guardian_dev_worker --tail 100` | Last 100 lines of worker logs |
| `pnpm --filter @marine-guardian/web dev` | Start only the web app (no Docker) |
| `pnpm turbo run build --filter=@marine-guardian/web` | Build only the web app |
| `git log --oneline -10` | Last 10 commits |
| `git rev-parse --short HEAD` | Current commit short SHA |

---

## 🔁 Common Full Workflow

```bash
# 1. Start dev environment
bash deploy/compose/start.sh dev up -d

# 2. Develop + test locally
pnpm test && pnpm typecheck && pnpm lint

# 3. When ready to push to Docker Hub (dev)
bash deploy/compose/push.sh dev

# 4. When ready for staging
bash deploy/compose/push.sh staging
# On staging server (if not using Komodo auto-update):
# docker compose -f deploy/compose/stage/docker-compose.app.yml pull
# docker compose -f deploy/compose/stage/docker-compose.app.yml up -d

# 5. When ready for production (via Komodo UI → Deploy, or manually)
bash deploy/compose/push.sh prod
# On prod server:
# docker compose -f deploy/compose/prod/docker-compose.app.yml pull
# docker compose -f deploy/compose/prod/docker-compose.app.yml up -d
```
