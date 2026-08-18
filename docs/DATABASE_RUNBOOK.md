# Database Runbook — Rescue Guide

> Practical, copy-pasteable guide for backing up, restoring, and recovering the
> dining-reservation database. Read the **Quick reference** first; the rest is
> detail for when something is actually on fire.

## 0. Quick reference (the crisis cheat sheet)

```bash
# --- Connect to the server ---
ssh deploy@your-server-ip
cd ~/dining-reservation

# --- The connection string (read from .env, strip Prisma's ?schema=public) ---
export U=$(grep -E '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL="?//; s/"?$//; s/\?schema=public//')

# --- Is the DB up? How many tenants? ---
psql "$U" -tAc 'SELECT count(*) FROM "Restaurant";'

# --- Take a backup RIGHT NOW (before doing anything risky) ---
pg_dump "$U" -Fc -f ~/db-backups/dining-manual-$(date +%Y%m%d-%H%M%S).dump

# --- See why the API is crashing ---
pm2 logs dining-api --lines 40 --nostream --err

# --- Restore the newest backup (DESTRUCTIVE — overwrites current data) ---
# ls -t ~/db-backups/dining-*.dump | head          # find the file first
pg_restore --clean --if-exists --no-owner -d "$U" ~/db-backups/<FILE>.dump

# --- After ANY schema change: restart the API ---
pm2 restart dining-api
```

---

## 1. What we run and where

| Thing | Value |
|---|---|
| Engine | **PostgreSQL** everywhere — production, local dev, and the test suite (tests use a disposable throwaway Postgres, not the real DB). No SQLite anywhere. |
| Server | `deploy@your-server-ip` |
| App directory | `~/dining-reservation` |
| DB name / user | `dining` / `dining_app` on `localhost:5432` |
| Connection string | in `~/dining-reservation/.env` as `DATABASE_URL` (note the trailing `?schema=public` — Prisma needs it, but `psql`/`pg_dump` do **not**, so strip it) |
| Process manager | `pm2` — `dining-api` (backend, `node dist/server.js`) and `dining-web` (Next.js, `next start -p 3001`) |
| Backups | `~/db-backups/` — daily via cron, see §2 |

**Why Postgres and not SQLite for production:** online/consistent backups while the
app keeps running, point-in-time recovery, selective (per-table) restore, and real
concurrent writes for many restaurants at once. SQLite is a single file with no
concurrent-write story and no PITR — great for tests, not for a multi-tenant SaaS.

**Connection pool sizing:** `.env.example`'s `DATABASE_URL` now pins Prisma's pool
via `connection_limit`/`pool_timeout` query params instead of relying on Prisma's
CPU-derived default — see the comment there for rationale. Treat it as a stopgap;
PRODUCTION_ROADMAP.md §8 Phase 2's move to managed Postgres will likely bring its
own pooling story.

---

## 2. Backups

### How they run
- Script: `scripts/db-backup.sh` (in this repo, deployed to the server).
- Schedule: **daily at 03:00** via cron.
- Format: compressed custom format (`pg_dump -Fc`) → restorable and selective.
- Location: `~/db-backups/dining-YYYYmmdd-HHMMSS.dump`
- **Retention: dumps older than `RETENTION_DAYS` (default 14) are deleted
  automatically** on every run, so old backups clean themselves up.
- Log: `~/db-backups/backup.log` (one line per run: file, size, #pruned, #kept).

### Install / re-install the cron job (on the server)
```bash
cd ~/dining-reservation
chmod +x scripts/db-backup.sh
# Add the daily job (idempotent — removes any old copy of the line first):
( crontab -l 2>/dev/null | grep -v 'db-backup.sh' ; \
  echo '0 3 * * * /home/deploy/dining-reservation/scripts/db-backup.sh >> /home/deploy/db-backups/cron.log 2>&1' ) \
  | crontab -
crontab -l   # verify
```

### Run a backup by hand (anytime, safe)
```bash
~/dining-reservation/scripts/db-backup.sh
# or a one-off to a custom name:
pg_dump "$U" -Fc -f ~/db-backups/dining-manual-$(date +%Y%m%d-%H%M%S).dump
```

### Change retention
```bash
RETENTION_DAYS=30 ~/dining-reservation/scripts/db-backup.sh   # keep 30 days
```

### Verify a backup is good (before you trust it)
```bash
pg_restore --list ~/db-backups/<FILE>.dump | head   # lists contents; errors if corrupt
```

> **Off-box copies:** these dumps live on the same server as the DB. For real
> disaster-proofing, periodically copy them elsewhere, e.g. from your laptop:
> `scp deploy@your-server-ip:'~/db-backups/dining-*.dump' ./local-backups/`

---

## 3. Restore

### 3a. Full restore (overwrite everything with a backup)
**Destructive** — replaces current data. Take a fresh "just in case" dump first.
```bash
cd ~/dining-reservation
export U=$(grep -E '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL="?//; s/"?$//; s/\?schema=public//')

pg_dump "$U" -Fc -f ~/db-backups/pre-restore-$(date +%Y%m%d-%H%M%S).dump   # safety net

pm2 stop dining-api dining-web        # stop writers first
pg_restore --clean --if-exists --no-owner -d "$U" ~/db-backups/<FILE>.dump
pm2 start dining-api dining-web
```
- `--clean --if-exists` drops existing objects before recreating them.
- If the DB is badly broken, recreate it empty first:
  `dropdb dining && createdb -O dining_app dining`, then `pg_restore` without `--clean`.

### 3b. Selective restore (one table only)
```bash
pg_restore --data-only --table=Reservation --no-owner -d "$U" ~/db-backups/<FILE>.dump
```

---

## 4. Point-in-time recovery (PITR) — optional hardening

Nightly dumps recover you to the **last backup**. To recover to *any second*
(e.g. the moment before a bad migration), enable WAL archiving in
`postgresql.conf` (`wal_level=replica`, `archive_mode=on`, `archive_command=...`)
plus a periodic `pg_basebackup`. Not enabled yet — add it when the data is
valuable enough to justify the extra ops. Until then, §2 daily dumps are the
recovery floor.

---

## 5. Common failures & fixes

### "Can't see tenants" / API 500 with `P2022: column ... does not exist`
**Cause:** code was deployed that expects a DB column/table that was never
applied — the deploy's `prisma migrate deploy` step was skipped. (This is the
exact failure we hit adding the vendors/e-davetiye feature:
`RestaurantSettings.hasVendors`.)

**Diagnose:**
```bash
pm2 logs dining-api --lines 40 --nostream --err   # look for P2022 + the column name
```
**Fix — apply the pending migrations, then restart:**
```bash
cd ~/dining-reservation
npx prisma migrate deploy         # applies any committed migrations not yet in the DB
pm2 restart dining-api
```
If migrations are somehow out of sync with the DB, review the drift first
(read-only — prints SQL, applies nothing):
```bash
export U=$(grep -E '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL="?//; s/"?$//; s/\?schema=public//')
npx prisma migrate diff --from-url "$U" --to-schema-datamodel prisma/schema.prisma --script
```

### API won't start / keeps restarting
```bash
pm2 describe dining-api        # check status + restart count
pm2 logs dining-api --err      # read the actual error
# Common: DB unreachable → is Postgres up?  systemctl status postgresql
```

### Prisma client / schema mismatch after pulling code
```bash
cd ~/dining-reservation
npm run build          # runs `prisma generate && tsc` → regenerates the Postgres client
pm2 restart dining-api
```

---

## 6. Safe deploy procedure (prevents §5's first failure)

Schema reaches production via **`prisma migrate deploy`** — it applies any
committed migrations the DB hasn't seen yet, tracked in `_prisma_migrations`, so
code can never ship ahead of the schema (the §5 outage). **Every deploy runs it**,
in this order:

```bash
cd ~/dining-reservation
git pull

# 1. Back up first
scripts/db-backup.sh

# 2. Apply any new migrations (safe: only applies what's committed + pending)
npx prisma migrate deploy

# 3. Rebuild
npm run build                 # backend: prisma generate + tsc
cd frontend && npm run build  # frontend: next build
cd ..

# 4. Restart
pm2 restart dining-api dining-web

# 5. Smoke check
export U=$(grep -E '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL="?//; s/"?$//; s/\?schema=public//')
psql "$U" -tAc 'SELECT count(*) FROM "Restaurant";'   # tenants come back
pm2 logs dining-api --lines 20 --nostream --err       # no new P2022 errors
```

> **Creating a schema change** (dev): edit `prisma/schema.prisma`, then
> `npm run prisma:migrate` (`prisma migrate dev --name <change>`) to generate +
> apply a migration locally. Commit the new folder under `prisma/migrations/`.
> The deploy above (`migrate deploy`) applies it on the server.

> The failure class in §5 happens when step 2 is skipped. Never ship code that
> references new columns without pushing the schema in the same deploy.
