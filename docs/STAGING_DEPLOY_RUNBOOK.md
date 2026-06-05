# Staging deployment runbook

Step-by-step instructions for deploying **Elevated Claims Builder** to a **staging server**. This runbook is for operators — not local development.

> **Do not proceed to production** until staging automated gates pass, the [manual E2E checklist](./STAGING_E2E_CHECKLIST.md) is signed, and the [staging launch sign-off](./STAGING.md#staging-launch-sign-off) in `STAGING.md` is complete.

Related docs:

- [STAGING.md](./STAGING.md) — release gate and sign-off
- [STAGING_E2E_CHECKLIST.md](./STAGING_E2E_CHECKLIST.md) — manual dry-run workflow
- [DEPLOYMENT.md](./DEPLOYMENT.md) — production checklist (after staging)

---

## 1. Required server specs

Minimum recommended for staging (single-node):

| Resource | Minimum | Notes |
|----------|---------|-------|
| CPU | 2 vCPU | 4 vCPU if running app + Docker PostgreSQL on same host |
| RAM | 4 GB | 8 GB preferred when co-locating Postgres in Docker |
| Disk | 40 GB SSD | App + `STORAGE_DIR` + logs; grow with document volume |
| OS | Ubuntu 22.04+ / Windows Server 2022+ | Linux preferred for production-like staging |
| Node.js | **20 LTS** or **22 LTS** | Match local dev (`package.json` engines if set) |
| npm | 10+ | Bundled with Node |
| Network | HTTPS outbound | For `npm ci`, OpenAI (if used), OS updates |
| Process manager | systemd, PM2, or container orchestrator | Keeps `next start` running |

Optional on staging host:

- **Docker** — only if using local Docker PostgreSQL (Option B below)
- **Reverse proxy** — nginx, Caddy, or cloud load balancer for TLS termination

---

## 2. Required environment variables

Create a staging `.env` on the server (never commit). Copy from `.env.example` and replace all placeholders.

| Variable | Required | Staging notes |
|----------|----------|---------------|
| `DATABASE_URL` | Yes | **PostgreSQL** connection string (`postgresql://` or `postgres://`) |
| `DIRECT_URL` | If pooled | Direct connection for Prisma CLI (`db:migrate`). Same as `DATABASE_URL` when not using a pooler |
| `NEXTAUTH_URL` | Yes | Public staging URL, e.g. `https://staging.claims.example.com` |
| `NEXTAUTH_SECRET` | Yes | Staging-specific random string (≥ 8 chars); **not** shared with production |
| `ADMIN_EMAIL` | Yes | Seed admin login |
| `ADMIN_PASSWORD` | Yes | Strong staging password; change after first login |
| `ADMIN_NAME` | Yes | Display name for seed admin |
| `STORAGE_DIR` | Yes | **Absolute path**, e.g. `/var/lib/claims-builder/storage` |
| `MAX_UPLOAD_SIZE_MB` | Yes | e.g. `100` |
| `OPENAI_API_KEY` | Recommended | Required for real generation in `NODE_ENV=production`; optional for mock-only staging pilot |
| `OPENAI_MODEL` | Optional | Defaults to `gpt-4o-mini` |
| `NODE_ENV` | Yes for prod build | Set `production` when running `next start` |

**Forbidden:** `DATABASE_URL=file:...` (SQLite) on staging.

Example staging `.env` fragment (managed PostgreSQL):

```env
DATABASE_URL="postgresql://USER:PASSWORD@staging-db.example.com:5432/claims_builder?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@staging-db.example.com:5432/claims_builder?sslmode=require"
NEXTAUTH_URL="https://staging.claims.example.com"
NEXTAUTH_SECRET="<staging-only-secret>"
ADMIN_EMAIL="admin@staging.example.com"
ADMIN_PASSWORD="<strong-password>"
ADMIN_NAME="Staging Admin"
STORAGE_DIR="/var/lib/claims-builder/storage"
MAX_UPLOAD_SIZE_MB="100"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"
NODE_ENV="production"
```

---

## 3. PostgreSQL setup

### Option A — Managed PostgreSQL (preferred)

Use a managed instance (RDS, Cloud SQL, Azure Database for PostgreSQL, Supabase, Neon, etc.).

1. Create database `claims_builder` (or your chosen name).
2. Create application user with `CONNECT`, `CREATE` (for migrations), and DML on `public`.
3. Enable automated backups / PITR on the managed service.
4. Restrict network access to staging app server IP (or VPC peering).
5. Use `?sslmode=require` (or provider equivalent) in connection strings.
6. Set `DATABASE_URL` for the app runtime.
7. If the provider offers a **pooler** (PgBouncer, Neon pooler):
   - `DATABASE_URL` → pooled URL
   - `DIRECT_URL` → direct URL (for `npm run db:migrate`)

Verify connectivity from the staging server:

```bash
# If psql is available
psql "$DATABASE_URL" -c "SELECT 1"
```

### Option B — Docker PostgreSQL (staging only)

Acceptable for **staging** when managed PostgreSQL is not yet provisioned. **Not recommended for production.**

On the staging server (with Docker installed):

```bash
cd /opt/claims-builder   # or your deploy path
docker compose up -d
docker compose ps        # wait until postgres is healthy
```

Default credentials from `docker-compose.yml`:

| Setting | Value |
|---------|--------|
| Host | `localhost` (same server) or Docker network alias |
| Port | `5432` |
| Database | `claims_builder` |
| User / password | `claims` / `claims` |

```
postgresql://claims:claims@localhost:5432/claims_builder
```

**Change default passwords** if the staging host is network-reachable. Data persists in volume `claims_builder_pgdata`.

> **Do not use `npm run db:push`** on staging or production — migrations only.

---

## 4. STORAGE_DIR setup and permissions

Uploaded documents and exports live on disk, **not** in PostgreSQL.

```bash
# Linux example
sudo mkdir -p /var/lib/claims-builder/storage
sudo chown -R <app-user>:<app-group> /var/lib/claims-builder/storage
chmod 750 /var/lib/claims-builder/storage
```

Requirements:

- Path must match `STORAGE_DIR` in `.env` (use an **absolute** path).
- The user running `next start` (or the container user) must have **read/write** access.
- Plan disk capacity for PDFs, photos, and exports.
- Include this directory in **backup jobs separate from the database**.

The app validates writability at startup via `ensureStorageReady()`. Confirm with:

```bash
npm run staging:check
```

---

## 5. Build and deploy commands

### 5.1 Initial server preparation

```bash
# Clone or copy release artifact to server
cd /opt/claims-builder
git clone <repo-url> .          # or deploy CI artifact
git checkout <release-tag>

# Install dependencies (production + scripts needed for migrate/seed)
npm ci

# Place staging .env in project root (not in git)
# cp .env.example .env && edit .env
```

### 5.2 Build application

```bash
export NODE_ENV=production
npx prisma generate
npm run build
```

Build output: `.next/` (Next.js standalone not assumed — use `next start` from project root).

### 5.3 Start application

```bash
npm run start
# Listens on port 3000 by default; put reverse proxy in front for HTTPS
```

**systemd example** (adjust paths):

```ini
[Unit]
Description=Claims Builder Staging
After=network.target

[Service]
Type=simple
User=claims
WorkingDirectory=/opt/claims-builder
EnvironmentFile=/opt/claims-builder/.env
ExecStart=/usr/bin/npm run start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Configure reverse proxy so `NEXTAUTH_URL` matches the public HTTPS URL.

### 5.4 Deploy updates (subsequent releases)

```bash
cd /opt/claims-builder
git pull origin <branch-or-tag>   # or replace artifact
npm ci
npx prisma generate
npm run build
npm run db:migrate                # apply new migrations only
# npm run db:seed                 # only on fresh DB or intentional reset
sudo systemctl restart claims-builder
```

---

## 6. Prisma commands (first deploy)

Run from project root with staging `.env` loaded. Order matters.

```bash
# 1. Generate Prisma Client (also runs on postinstall)
npx prisma generate

# 2. Apply all pending migrations — NEVER db:push on staging
npm run db:migrate

# 3. Seed admin, OrgSettings, rules, parser certifications (first deploy / reset only)
npm run db:seed
```

One-shot alternative on first deploy:

```bash
npm run db    # migrate deploy && db seed
```

Confirm migrations:

```bash
npx prisma migrate status
```

Expected: `Database schema is up to date!`

---

## 7. Verification commands

Run on the **staging server** (or CI job pointed at staging `DATABASE_URL`) after migrate + seed:

```bash
# Automated staging prep (env, DB, seed rows, dashboard, storage)
npm run staging:check

# PostgreSQL smoke test
npm run test:pg

# Issue detection certification (must pass for production readiness path)
npm run certify:issues

# Confirm production build still succeeds
npm run build
```

Optional but recommended before sign-off:

```bash
npx prisma validate
npm run test          # full suite — 206 tests
```

Manual verification in browser:

1. Open `{NEXTAUTH_URL}/login` — admin login works.
2. Open `{NEXTAUTH_URL}/settings/production` — loads without SQLite warning.
3. Complete [STAGING_E2E_CHECKLIST.md](./STAGING_E2E_CHECKLIST.md).

---

## 8. Manual E2E checklist (required)

Automated checks do **not** replace hands-on workflow validation.

1. Print or open [STAGING_E2E_CHECKLIST.md](./STAGING_E2E_CHECKLIST.md).
2. Execute all 16 sections on the **staging URL** (dry-run claim through watermarked export).
3. Confirm `dryRunsReviewedCount` increments on `/settings/production`.
4. Attach completed checklist to the staging ticket.
5. Complete [staging launch sign-off](./STAGING.md#staging-launch-sign-off).

---

## 9. Backup requirements

Configure **before** declaring staging ready.

### PostgreSQL

| Item | Guidance |
|------|----------|
| Frequency | Daily minimum; more often during active testing |
| Method | Managed snapshots + PITR (preferred) or `pg_dump` cron |
| Retention | 7–30 days for staging |
| Test restore | Run at least one restore drill before production planning |

Example manual dump (if not using managed backups):

```bash
pg_dump "$DATABASE_URL" -Fc -f claims_builder_staging_$(date +%F).dump
```

### STORAGE_DIR

| Item | Guidance |
|------|----------|
| Frequency | Daily sync or snapshot |
| Method | rsync, blob sync, or volume snapshot — **separate job from DB** |
| Scope | Entire `STORAGE_DIR` tree |
| Test restore | Restore to empty directory and verify file download in app |

Document backup locations and restore contacts in your ops runbook.

---

## 10. Rollback steps

If a staging deploy fails or corrupts data:

### Application rollback

1. Stop the app service.
2. Deploy previous known-good git tag / artifact.
3. Run `npm ci`, `npx prisma generate`, `npm run build`.
4. **Do not** run `db:push`.
5. If the failed release did **not** add migrations, restart the app.
6. If a **bad migration** was applied, restore PostgreSQL from pre-deploy snapshot, then restart previous app version.

### Database rollback

1. Stop the app.
2. Restore PostgreSQL from snapshot or `pg_dump` taken before deploy.
3. Verify `_prisma_migrations` matches the rolled-back app version.
4. Restart app; run `npm run db:migrate` only when rolling **forward** again.

### Storage rollback

1. Stop the app if files may be inconsistent.
2. Restore `STORAGE_DIR` from backup.
3. Restart app.

### After rollback

- Re-run `npm run staging:check` and `npm run test:pg`.
- Log incident and block production promotion until root cause is resolved.

---

## 11. Production gate — do not proceed

**Do not deploy to production** until all of the following are true:

- [ ] This runbook completed on staging without unresolved blockers
- [ ] `npm run staging:check` passes on staging
- [ ] `npm run test:pg` passes on staging
- [ ] `npm run certify:issues` passes on staging
- [ ] `npm run build` passes
- [ ] [STAGING_E2E_CHECKLIST.md](./STAGING_E2E_CHECKLIST.md) signed
- [ ] [Staging launch sign-off](./STAGING.md#staging-launch-sign-off) completed
- [ ] Database **and** `STORAGE_DIR` backup/restore verified
- [ ] Staging `DATABASE_URL` confirmed PostgreSQL (not SQLite)

Production cutover follows [DEPLOYMENT.md](./DEPLOYMENT.md) only after staging sign-off.

---

## Quick reference — first staging deploy

```bash
# PostgreSQL ready (managed or docker compose up -d)
# .env configured with staging values
# STORAGE_DIR created and writable

cd /opt/claims-builder
npm ci
npx prisma generate
npm run db:migrate
npm run db:seed
npm run build
npm run staging:check
npm run test:pg
npm run certify:issues
npm run start    # or systemctl start claims-builder

# Then: manual E2E checklist + sign-off in STAGING.md
```
