# Staging environment — PostgreSQL readiness

Staging validates the PostgreSQL migration path before production cutover. **Staging must pass before production.**

See also:

- **[STAGING_DEPLOY_RUNBOOK.md](./STAGING_DEPLOY_RUNBOOK.md)** — step-by-step server deployment instructions
- [STAGING_E2E_CHECKLIST.md](./STAGING_E2E_CHECKLIST.md) — manual dry-run workflow
- [DEPLOYMENT.md](./DEPLOYMENT.md) — production checklist

## Staging requirements

| Requirement | Notes |
|-------------|-------|
| Database | **PostgreSQL only** — managed instance or Docker on a staging host |
| Migrations | **`prisma migrate deploy` only** — never `prisma db push` |
| `DIRECT_URL` | Set for CLI/migrations when using a connection pooler at runtime |
| Storage | `STORAGE_DIR` on persistent disk — **backed up separately from the database** |
| Secrets | Staging-specific `NEXTAUTH_SECRET`, admin password, and `OPENAI_API_KEY` |

## Forbidden in staging and production

- `npm run db:push` / `prisma db push` — bypasses migration history and is not allowed
- SQLite `DATABASE_URL` — schema provider is `postgresql`
- Skipping `migrate deploy` before app deploy

## Staging bootstrap

**For server deployment, follow [STAGING_DEPLOY_RUNBOOK.md](./STAGING_DEPLOY_RUNBOOK.md).**

Summary after PostgreSQL and `.env` are ready:

1. Apply migrations and seed:

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

   Or: `npm run db` (migrate deploy + seed).

2. Run automated validation:

   ```powershell
   npm run staging:check
   npm run test:pg
   ```

## Staging release gate (automated)

All commands must pass against the **staging** database and environment:

| # | Command / check | Required |
|---|-----------------|----------|
| 1 | `npx prisma validate` | Yes |
| 2 | `npm run db:migrate` | Yes |
| 3 | `npm run db:seed` | Yes (first deploy or after DB reset) |
| 4 | `npm run staging:check` | Yes |
| 5 | `npm run test:pg` | Yes |
| 6 | `npm run test` | Yes — **206 tests** |
| 7 | `npm run certify:issues` | Yes — issue detection certification green |
| 8 | `npm run build` | Yes |
| 9 | Manual E2E checklist | Yes — [STAGING_E2E_CHECKLIST.md](./STAGING_E2E_CHECKLIST.md) |
| 10 | `/settings/production` loads without SQLite warning | Yes |
| 11 | `STORAGE_DIR` backup job configured and tested | Yes |

## Staging launch sign-off

Complete after automated gates and manual E2E checklist pass. Attach to change record or ticket.

| Field | Verified (initial / date) |
|-------|---------------------------|
| **Signer** | |
| **Date** | |
| **Database URL verified as PostgreSQL** | [ ] `DATABASE_URL` uses `postgresql://` or `postgres://`; `staging:check` passed |
| **Migrations applied** | [ ] `npm run db:migrate` succeeded; no pending migrations |
| **Seed present** | [ ] `npm run db:seed` succeeded; OrgSettings + admin user confirmed |
| **Storage backup verified** | [ ] `STORAGE_DIR` backup/restore drill completed separately from DB |
| **OpenAI key verified** | [ ] `OPENAI_API_KEY` set for staging generation tests (or documented mock-only pilot) |
| **Dry-run export verified** | [ ] Watermarked export completed per E2E checklist §14 |
| **productionReady status verified** | [ ] Dashboard reflects expected blockers; dry-run counter increments per E2E §16 |
| **Manual E2E checklist** | [ ] [STAGING_E2E_CHECKLIST.md](./STAGING_E2E_CHECKLIST.md) signed |
| **Automated tests** | [ ] `npm run test` + `npm run certify:issues` + `npm run build` green |

**Approval to proceed toward production cutover planning:** ___________________________

---

## Staging vs production

| Item | Staging | Production |
|------|---------|------------|
| `DATABASE_URL` | Staging PostgreSQL URL | Production PostgreSQL URL |
| `migrate deploy` | Required before deploy | Required before deploy |
| `db:push` | Forbidden | Forbidden |
| `STORAGE_DIR` | Staging volume + backup | Production volume + backup |
| Backups | DB snapshots + storage sync | DB PITR + storage sync |

## Rollback

1. Revert application to previous build.
2. Restore PostgreSQL from snapshot if a bad migration was applied.
3. Restore `STORAGE_DIR` from backup if files were lost.
4. Re-run `npm run db:migrate` only when rolling forward again — do not use `db:push`.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production checklist and security notes.
