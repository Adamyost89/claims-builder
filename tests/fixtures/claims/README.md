# Claim fixtures

Controlled claim fixtures for parser, comparison, and issue detection certification.

## Layout

| Folder | Purpose |
|--------|---------|
| `golden/` | Programmatic golden claim definitions (`src/lib/issues/fixtures/golden/`) |
| `carrier-corpus/` | Anonymized real-world carrier estimate samples (add PDF/TXT here) |
| `measurement-reports/` | Anonymized EagleView/HOVER/GAF measurement samples |
| `expected/` | Optional JSON snapshots of expected `RevisionItem` sets for corpus files |

## Adding anonymized carrier samples

1. Remove all PII (insured name, address, claim number, policy number, adjuster contact).
2. Save as `carrier-corpus/<vendor>-<scenario>.txt` or `.pdf`.
3. Add a matching entry in `expected/<same-name>.json` with expected detection keys.
4. Run `npm run test:fixtures` after updating parsers or line matchers.

Do not commit non-anonymized carrier documents.
