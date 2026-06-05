# Elevated Claims Builder

Phase 0 foundation for the internal claims supplement workflow: authentication, RBAC, workflow gates, audit logging, and org production safeguards.

## Prerequisites

- Node.js 20+
- npm
- [Docker](https://docs.docker.com/get-docker/) (optional, for local PostgreSQL during migration)

## Setup

1. Copy environment variables:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Edit `.env` and set at least:

   - `NEXTAUTH_SECRET` (long random string)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`

3. Install dependencies (if needed):

   ```powershell
   npm install
   ```

4. Start PostgreSQL (see [Local PostgreSQL](#local-postgresql) below).

5. Apply migrations and seed:

   ```powershell
   npx prisma generate
   npm run db:migrate
   npm run db:seed
   ```

   Or in one step after migrations are current: `npm run db` (migrate deploy + seed).

6. Verify PostgreSQL connectivity (optional):

   ```powershell
   npm run test:pg
   ```

7. Run tests:

   ```powershell
   npm run test
   ```

8. Start the dev server:

   ```powershell
   npm run dev
   ```

9. Sign in at [http://localhost:3000/login](http://localhost:3000/login) with the admin credentials from `.env`.

## Local PostgreSQL

Prisma schema uses **PostgreSQL**. Set `DATABASE_URL` and `DIRECT_URL` in `.env` (see `.env.example`).

### Option A — Docker Compose (recommended)

```powershell
docker compose up -d
docker compose ps   # wait for healthy
```

| Setting | Value |
| --- | --- |
| Host | `localhost` |
| Port | `5432` |
| Database | `claims_builder` |
| User / password | `claims` / `claims` |

```
postgresql://claims:claims@localhost:5432/claims_builder
```

Data persists in Docker volume `claims_builder_pgdata`.

### Option B — Embedded PostgreSQL (Docker unavailable)

```powershell
npx tsx scripts/start-embedded-postgres.ts
```

Run in a separate terminal; uses the same connection string on port `5432`. Data is stored in `.embedded-postgres/` (gitignored).

### Migration discipline

| Command | Use |
| --- | --- |
| `npm run db:migrate` | Apply pending migrations (`prisma migrate deploy`) — **staging, production, and local PG** |
| `npm run db:seed` | Seed admin, org settings, rules, parser certifications |
| `npm run db` | `db:migrate` then `db:seed` |
| `npm run db:push` | **Local dev only** — never use in staging or production |
| `npm run test:pg` | Smoke test: PG URL, Prisma connect, OrgSettings, production dashboard |
| `npm run staging:check` | Staging prep: env, DB, seed, dashboard, storage writability |

Staging checklist: [docs/STAGING.md](docs/STAGING.md). **Staging server deploy:** [docs/STAGING_DEPLOY_RUNBOOK.md](docs/STAGING_DEPLOY_RUNBOOK.md). Production checklist: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Legacy SQLite adapter

`src/lib/db/create-adapter.ts` still supports `file:` URLs for SQLite when using a sqlite schema provider. Current schema is `postgresql` — use PostgreSQL for local dev and tests.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run test` | Vitest unit/integration tests (206) |
| `npm run test:pg` | PostgreSQL smoke test (connection, OrgSettings, dashboard) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db` | Migrate deploy + seed |
| `npm run db:push` | Dev-only schema push — not for staging/production |
| `npm run db:seed` | Seed admin user, org settings, rules, banned phrases |
| `npm run db:studio` | Prisma Studio |
| `npm run staging:check` | Staging prep: env, DB, seed, dashboard, storage writability |

## Staging deployment

Deploy to a staging server using [docs/STAGING_DEPLOY_RUNBOOK.md](docs/STAGING_DEPLOY_RUNBOOK.md). Do not promote to production until [docs/STAGING.md](docs/STAGING.md) sign-off is complete.

## Phase 0 scope

- Credentials auth (NextAuth) with role on the session
- RBAC helpers for users, rules, claims, and export approval
- Generation gates `G1`–`G5` and export gates `E1`–`E5` (Prisma-backed blockers)
- Claim audit events (`ClaimEvent`)
- Non-production banner from `OrgSettings.productionReady`

## Phase 1 scope

- Claim CRUD API with RBAC (`/api/claims`, `/api/claims/[id]`, notes, workflow advance)
- Claims list, new claim intake, claim hub with locked workflow sidebar
- Overview readiness checklist (honest Phase placeholders)
- Claim notes with audit logging
- Dashboard claim metrics
- Audit events: `CLAIM_CREATE`, `CLAIM_UPDATE`, `NOTE_CREATE`, `WORKFLOW_ADVANCE`
- Workflow advancement via gate service (no direct stage skips)

## Phase 2A scope (upload infrastructure)

- Local storage adapter (`STORAGE_DIR`)
- Upload API with file type (PDF, JPG, PNG, DOCX, XLSX) and size limits
- Manual document classification on upload
- Document list, file viewer, metadata, soft-delete with rules
- `DocumentExtraction` model + provenance types (for Phase 2B parsers)
- `ParserCertification` registry — parsers uncertified until fixture accuracy met
- Audit: `UPLOAD`, `DOCUMENT_DELETE`
- **No parsing, AI, or extraction on upload**

## Phase 2B scope (parsing + human review)

- Text extraction: PDF (`unpdf`), DOCX (`mammoth`), XLSX (`xlsx`), plain text
- Heuristic parsers (no AI): carrier estimate, EagleView, HOVER, GAF, ITEL (framework stub)
- Every value persisted via `DocumentExtraction` with full provenance
- Confidence scoring + `ConfidenceReviewItem` queue for low-confidence / uncertified output
- Review UI: `/claims/[id]/parse`, `/claims/[id]/estimates`, `/claims/[id]/confidence-queue`
- Manual accept / reject / edit with `MANUAL_EDIT` audit events
- Parser fixture certification (`certifyParserFromFixtures`) — uncertified parsers force review
- Workflow gates: UPLOAD→PARSE (needs docs), PARSE→HUMAN_REVIEW (parse complete), HUMAN_REVIEW→MEASUREMENT_COMPARISON (reviews complete)
- Audit: `PARSE`, `MANUAL_EDIT`, `CONFIDENCE_RESOLVE`
- **Not included:** measurement comparison, rules, evidence matrix, OpenAI, generation, exports

## Phase 3 scope (measurement comparison)

- Deterministic calculator library (10 calculators with formula + explanation)
- Comparison engine using only accepted/edited parsed data (`getUsableParsedData`)
- `ComparisonResult` persistence (warnings only — no `RevisionItem` creation)
- Comparison UI at `/claims/[id]/comparison` with re-run and review sign-off
- Workflow gate: MEASUREMENT_COMPARISON→RULE_ISSUE_DETECTION requires `comparisonReviewedAt`
- Audit: `COMPARISON_RUN`, `COMPARISON_REVIEW`
- **Not included:** rule engine, revision items, evidence matrix, OpenAI, generation, exports

## Phase 4 scope (rule/issue detection)

- Deterministic rule engine + hard-rule enforcement (starter, OC+felt, inconsistencies)
- Issue detectors: omitted items, measurement deficiencies, installation insufficiency
- `RevisionItem` creation from accepted/edited parsed data + reviewed comparisons only
- Issues UI at `/claims/[id]/issues` with include/exclude/needs-evidence/edit + review sign-off
- Workflow gate: RULE_ISSUE_DETECTION→EVIDENCE_VALIDATION requires `issuesReviewedAt`
- Audit: `ISSUE_DETECTION_RUN`, `ISSUE_REVIEW`, `NO_ISSUES_FOUND`
- Re-running comparison clears `issuesReviewedAt`
- **Not included:** evidence matrix linking, OpenAI, generation, export

## Phase 4b scope (issue detection fixtures + certification)

- 15 golden claim fixtures with expected `RevisionItem` assertions
- Rule fixture matrix mapping seeded rules to golden scenarios
- `IssueDetectionCertification` model (100% accuracy required)
- `npm run test:fixtures` and `npm run certify:issues`
- Production readiness guard: parsers + issue detection + dry-runs (or admin override)
- Anonymized carrier corpus folder structure under `tests/fixtures/claims/`

## Storage

Uploaded files will use `STORAGE_DIR` (default `./storage`). Create the directory before enabling document upload in later phases.