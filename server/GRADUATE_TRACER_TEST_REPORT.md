# Graduate Tracer and PDF Test Report

Date: 2026-09-13

Final result: PASS for implementation, local automated checks, validation, draft selection, responsive rendering, and PDF generation. Runtime database/API and physical-device verification remain pending until the CI and staging checklist is executed.

## Testing Checklist

- [x] Test all tracer sections
- [x] Test required fields
- [x] Test invalid inputs
- [x] Test draft API calls and recovery selection at component level
- [ ] Run draft saving and recovery against disposable CI MySQL
- [ ] Run final submission against disposable CI MySQL
- [ ] Verify saved parent and child database records in CI
- [ ] Verify Admin viewing through the CI API smoke test
- [x] Verify generated PDF
- [x] Test simulated 390-pixel mobile form
- [ ] Test on a physical phone in staging
- [x] Record final test result

## Automated Evidence

- Shared validation is enforced by both the Alumni form and the submission API.
- Unit tests cover Sections A-D, required fields, invalid and conditional inputs, and draft-over-submission recovery.
- The mobile component test renders the tracer at a 390-pixel viewport and opens all four sections.
- Backend tests validate the representative CHED payload and browser-independent PDF output.
- The guarded `smoke:tracer` workflow creates an isolated Alumni account in a disposable database, saves and recovers a draft, rejects invalid and malformed submissions, submits a valid response, checks normalized education, training, and employment records, confirms Admin visibility, and verifies Alumni/Admin PDF preview/download before cleanup.
- CI runs the tracer smoke test only after migrations and the API health check succeed.
- Manual staging steps and the final QA checklist are recorded in `docs/graduate-tracer-verification.md`.

## Local Verification

- Frontend tests: 26 passed
- Backend tests: 30 passed
- Frontend TypeScript check: passed
- Backend TypeScript build: passed
- Full lint: passed
- Production frontend build: passed

The database/API smoke was not run against the configured local database because it is remote and is not identified as a disposable test target. Its CI job is the authoritative integration result.
