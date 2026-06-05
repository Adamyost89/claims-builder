# Elevated Claims Builder — Deployment Checklist

## Staging before production

**Staging must pass before production.** Complete the [staging release gate](./STAGING.md) and [staging deploy runbook](./STAGING_DEPLOY_RUNBOOK.md) on a PostgreSQL staging database before any production deploy.

- **`prisma migrate deploy` must succeed in staging** before production `migrate deploy`.
- **`prisma db push` is forbidden** for staging and production — use versioned migrations only (`npm run db:migrate`).
- **`STORAGE_DIR` must be backed up separately** from the database; uploaded documents and exports are not in PostgreSQL.

## Required environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | PostgreSQL URL for staging/production; SQLite (`file:`) is legacy local-only with dual adapter support |
| `DIRECT_URL` | Staging/prod with pooler | Prisma CLI migration URL when `DATABASE_URL` uses a pooler (Prisma 7: set in `prisma.config.ts`) |
| `NEXTAUTH_URL` | Yes | Public app URL |
| `NEXTAUTH_SECRET` | Yes | Long random string (min 8 chars) |
| `ADMIN_EMAIL` | Yes | Seed admin account |
| `ADMIN_PASSWORD` | Yes | Change before production |
| `ADMIN_NAME` | Yes | Display name for seed admin |
| `STORAGE_DIR` | Yes | Writable directory for uploaded documents |
| `MAX_UPLOAD_SIZE_MB` | Yes | Upload size limit |
| `OPENAI_API_KEY` | Production generation | Required for carrier-ready generation outside dev/test mock |
| `OPENAI_MODEL` | Optional | Defaults to `gpt-4o-mini` |

## Database provider (staging and production)

- **Staging and production must use PostgreSQL** (or a managed equivalent: RDS, Cloud SQL, Supabase, Neon).
- **SQLite is not supported** for staging or production deploys. The dual SQLite adapter remains for legacy local workflows only.
- **Carrier-ready export must not be enabled on SQLite.** The production dashboard shows a red warning when `DATABASE_URL` points at SQLite.
- Use automated backups and point-in-time recovery on the managed PostgreSQL database.
- **`STORAGE_DIR` is independent of the database** — schedule separate backup/sync for uploaded files.

## Database migration steps (staging and production)

1. Copy `.env.example` to environment config and set PostgreSQL `DATABASE_URL` (and `DIRECT_URL` if pooled).
2. Run `npx prisma generate`.
3. Run **`npm run db:migrate`** (`prisma migrate deploy`) — **do not use `db:push`**.
4. On first deploy or after intentional reset, run **`npm run db:seed`** (or `npm run db` for migrate + seed).
5. Run **`npm run test:pg`** to verify connection, `OrgSettings`, and production dashboard data.
6. Verify schema includes hardening fields: `productionOverrideRevokedAt`, `exportedAt`, `dryRunReviewedAt`, etc.

### Forbidden commands (staging / production)

| Command | Why |
|---------|-----|
| `npm run db:push` | Bypasses migration history; dev-only |
| `prisma db push` | Same — not for shared environments |

## Seed steps

1. Run `npm run db:seed` after `db:migrate` on a fresh database.
2. Log in as admin and verify `/settings/production`.
3. Run parser fixture certification and `npm run certify:issues` before expecting productionReady.

## Backup guidance

- Back up PostgreSQL on a schedule (snapshots + point-in-time recovery where available).
- **Back up `STORAGE_DIR` separately** — uploaded PDFs, photos, and exports are not stored in the database.
- Export `ClaimEvent` audit rows periodically for compliance review.
- Before major releases, confirm staging `migrate deploy` and storage backup restore drills succeed.

## Storage directory requirements

- `STORAGE_DIR` must exist and be writable by the app process.
- Use absolute paths in production.
- Plan disk capacity for carrier estimates, measurement reports, and photos.

## OpenAI key requirement

- Development/test uses deterministic mock generation when `OPENAI_API_KEY` is unset.
- **Production (`NODE_ENV=production`) fails closed without `OPENAI_API_KEY`** — mock generation is impossible in production.
- Mock-generated carrier-ready outputs cannot be approved or exported unless `claim.isDryRun = true`.

## Production readiness process

1. Certify all parsers (fixture tests).
2. Certify issue detection at 100% (`npm run certify:issues`).
3. Complete required dry-run claim reviews via `/settings/production`.
4. Confirm `OrgSettings.productionReady = true` on the production dashboard.
5. **Do not enable carrier-ready export until the production dashboard is green or a documented admin override exists.**

## Production override expiration and revocation

1. Admin applies override on `/settings/production` with a required note.
2. Optionally set **expiration** (`productionOverrideExpiresAt`) via the dashboard datetime field.
3. **Active** override (unexpired, not revoked) permits carrier-ready export despite blockers.
4. **Expired** overrides display as expired on the dashboard and no longer permit carrier export.
5. **Revoked** overrides require a revoke note, log `PRODUCTION_OVERRIDE_REVOKE`, and immediately block carrier export.
6. Re-apply a new override after expiry or revocation if a documented pilot is still needed.

## Export audit logging

- Successful exports log `EXPORT` with output metadata (no file contents).
- **Failed export attempts log `EXPORT_BLOCKED`** with `outputId`, `format`, `blockers`, `userId`, and `reason` (RBAC denial, missing output, production guard, etc.).
- Review `ClaimEvent` rows for export compliance investigations.

## Dry-run process

1. Mark claims `isDryRun = true` during practice workflows.
2. Complete full workflow through approved export (watermarked).
3. Manager or admin reviews the dry run on the production dashboard.
4. Each claim counts once toward `dryRunsReviewedCount`.

## Rollback notes

- Revert application build artifact to previous version.
- Restore PostgreSQL from snapshot if a migration or deploy caused data issues.
- Restore `STORAGE_DIR` from backup if document files were affected.
- Revoke production override via `/settings/production` (logs `PRODUCTION_OVERRIDE_REVOKE`) if override was applied in error.
- Re-run `refreshProductionReadiness` after rollback.
- Roll forward with `npm run db:migrate` when redeploying — do not use `db:push`.

## Security notes

- Change default admin password immediately.
- Restrict `/settings/production` to Manager and Admin roles.
- Admin override requires a note and logs `PRODUCTION_OVERRIDE`; optional expiration is stored on `OrgSettings.productionOverrideExpiresAt`.
- Revoke requires a note and logs `PRODUCTION_OVERRIDE_REVOKE`.
- Failed exports log `EXPORT_BLOCKED` — never file contents.
- `STORAGE_DIR` is validated writable at startup; path traversal on stored keys is blocked.
- Never commit `.env` or API keys.
- Viewers cannot mutate data; supplement writers cannot approve, export, or override production.

## Pre-launch verification

- [ ] [Staging deploy runbook](./STAGING_DEPLOY_RUNBOOK.md) completed
- [ ] [Staging release gate](./STAGING.md) and E2E checklist signed
- [ ] `npm run db:migrate` succeeded in staging before production
- [ ] `npm run test:pg` passes in staging
- [ ] `npm run test` passes (206 tests)
- [ ] `npm run build` passes
- [ ] Production dashboard shows parser + issue certification status
- [ ] Dry-run counter meets `dryRunsRequired`
- [ ] Carrier export blocked when productionReady is false (unless override or dry-run watermark)
- [ ] `STORAGE_DIR` backup restore tested
