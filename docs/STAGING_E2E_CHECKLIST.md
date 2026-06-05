# Staging manual E2E checklist — dry-run claim workflow

Complete this checklist on the **staging** environment after automated gates pass (`npm run staging:check`, `npm run test:pg`, `npm run certify:issues`, etc.). Use an **admin or manager** account unless a step requires a specific role.

Record the staging base URL: `________________________________`

Record the dry-run claim ID when created: `________________________________`

---

## Preconditions

- [ ] Staging `DATABASE_URL` is PostgreSQL (not SQLite).
- [ ] `npm run db:migrate` and `npm run db:seed` completed on staging.
- [ ] `STORAGE_DIR` is writable and included in backup scope.
- [ ] Test fixtures available locally for upload (carrier estimate PDF, EagleView/HOVER measurement report, or project test fixtures under `tests/fixtures/`).

---

## 1. Login

| Step | Action | Pass |
|------|--------|------|
| 1.1 | Open `{STAGING_URL}/login` | [ ] |
| 1.2 | Sign in with staging admin credentials from `.env` | [ ] |
| 1.3 | Confirm redirect to `/dashboard` or `/claims` without error | [ ] |

---

## 2. Create dry-run claim

| Step | Action | Pass |
|------|--------|------|
| 2.1 | Open `/claims/new` | [ ] |
| 2.2 | Complete intake (customer, address, carrier, claim number, date of loss, state, city, claim type **ROOF**) | [ ] |
| 2.3 | Submit and land on `/claims/{claimId}` hub | [ ] |
| 2.4 | Mark claim as dry-run — UI form does not expose `isDryRun`; use API after create: `PATCH /api/claims/{claimId}` with body `{"isDryRun": true}` (authenticated session) | [ ] |
| 2.5 | Confirm claim hub shows **Dry run** badge | [ ] |
| 2.6 | Note `dryRunsReviewedCount` before review (from `/settings/production` or dashboard): `________` | [ ] |

---

## 3. Upload documents

| Step | Action | Pass |
|------|--------|------|
| 3.1 | Open `/claims/{claimId}/upload` | [ ] |
| 3.2 | Upload **carrier estimate** (PDF) — classify as `CARRIER_ESTIMATE` | [ ] |
| 3.3 | Upload **measurement report** (PDF) — classify as `EAGLEVIEW` or `HOVER` | [ ] |
| 3.4 | Confirm both documents appear in document list with `PENDING` or `COMPLETE` parse status | [ ] |
| 3.5 | Advance workflow to **PARSE** if gate allows (sidebar / workflow advance) | [ ] |

---

## 4. Parse documents

| Step | Action | Pass |
|------|--------|------|
| 4.1 | Open `/claims/{claimId}/parse` | [ ] |
| 4.2 | Run parse on carrier estimate document | [ ] |
| 4.3 | Run parse on measurement report document | [ ] |
| 4.4 | Confirm parse status moves to `COMPLETE` (or `NEEDS_REVIEW` with items in queue) | [ ] |

---

## 5. Review parsed data

| Step | Action | Pass |
|------|--------|------|
| 5.1 | Open `/claims/{claimId}/estimates` — review carrier line items | [ ] |
| 5.2 | Accept or edit low-confidence items as needed | [ ] |
| 5.3 | Open `/claims/{claimId}/confidence-queue` — resolve any blocking items | [ ] |
| 5.4 | Open `/claims/{claimId}/review` — complete measurement / line-item review sign-off | [ ] |
| 5.5 | Advance workflow to **HUMAN_REVIEW** complete → **MEASUREMENT_COMPARISON** | [ ] |

---

## 6. Run comparison

| Step | Action | Pass |
|------|--------|------|
| 6.1 | Open `/claims/{claimId}/comparison` | [ ] |
| 6.2 | Run comparison | [ ] |
| 6.3 | Confirm comparison results render (warnings acceptable) | [ ] |

---

## 7. Review comparison

| Step | Action | Pass |
|------|--------|------|
| 7.1 | Review comparison output on same page | [ ] |
| 7.2 | Submit comparison review sign-off | [ ] |
| 7.3 | Confirm `comparisonReviewedAt` set (workflow gate unblocks issue detection) | [ ] |
| 7.4 | Advance workflow to **RULE_ISSUE_DETECTION** | [ ] |

---

## 8. Run issue detection

| Step | Action | Pass |
|------|--------|------|
| 8.1 | Open `/claims/{claimId}/issues` | [ ] |
| 8.2 | Run issue detection | [ ] |
| 8.3 | Confirm revision items created or explicit no-issues path logged | [ ] |

---

## 9. Review issues

| Step | Action | Pass |
|------|--------|------|
| 9.1 | Include/exclude/edit issues as needed | [ ] |
| 9.2 | Submit issues review sign-off | [ ] |
| 9.3 | Advance workflow toward **EVIDENCE_VALIDATION** | [ ] |

---

## 10. Link evidence

| Step | Action | Pass |
|------|--------|------|
| 10.1 | Open `/claims/{claimId}/evidence-matrix` | [ ] |
| 10.2 | Link evidence to revision items (photos, measurements, code, etc.) | [ ] |
| 10.3 | Confirm links show as satisfied where required | [ ] |

---

## 11. Review evidence

| Step | Action | Pass |
|------|--------|------|
| 11.1 | Complete evidence validation review on evidence matrix or review API | [ ] |
| 11.2 | Confirm `evidenceReviewedAt` set on claim | [ ] |
| 11.3 | Advance workflow through **GENERATION** gate | [ ] |

---

## 12. Generate draft

| Step | Action | Pass |
|------|--------|------|
| 12.1 | Open `/claims/{claimId}/generate` | [ ] |
| 12.2 | Generate **FULL_SUPPLEMENT** (or carrier-ready mode used in staging pilot) | [ ] |
| 12.3 | Confirm draft output created; tone lint and unsupported-claims state acceptable | [ ] |
| 12.4 | Advance workflow to **HUMAN_APPROVAL** | [ ] |

---

## 13. Approve draft

| Step | Action | Pass |
|------|--------|------|
| 13.1 | Open `/claims/{claimId}/approve` (manager or admin) | [ ] |
| 13.2 | Approve generated output | [ ] |
| 13.3 | Confirm output status **APPROVED** on `/claims/{claimId}/outputs` | [ ] |

---

## 14. Export watermarked dry-run output

| Step | Action | Pass |
|------|--------|------|
| 14.1 | Open `/claims/{claimId}/export` | [ ] |
| 14.2 | Export approved output (DOCX or PDF per UI) | [ ] |
| 14.3 | Confirm export succeeds despite `productionReady = false` (dry-run watermark path) | [ ] |
| 14.4 | Open downloaded file — confirm **dry-run watermark** text present | [ ] |
| 14.5 | Confirm `ClaimEvent` type `EXPORT` logged (optional: Prisma Studio / admin audit review) | [ ] |

---

## 15. Review dry-run claim (production dashboard)

| Step | Action | Pass |
|------|--------|------|
| 15.1 | Open `/settings/production` as admin | [ ] |
| 15.2 | Locate pending dry-run claim in dry-run review list | [ ] |
| 15.3 | Submit dry-run review with note | [ ] |
| 15.4 | Confirm claim `dryRunReviewedAt` set | [ ] |

---

## 16. Confirm dry-run counter increment

| Step | Action | Pass |
|------|--------|------|
| 16.1 | Return to `/settings/production` | [ ] |
| 16.2 | Confirm `dryRunsReviewedCount` increased by **1** from value noted in step 2.6 | [ ] |
| 16.3 | Dashboard shows PostgreSQL (no SQLite warning banner) | [ ] |

---

## Sign-off (copy to staging launch record)

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Staging URL | |
| Claim ID exercised | |
| dryRunsReviewedCount before → after | → |
| Export watermark verified | Yes / No |
| Blockers found | |

---

## Failure notes

Document any gate blocks, RBAC denials, or missing fixtures here:

```
```
