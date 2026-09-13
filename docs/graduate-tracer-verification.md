# Graduate Tracer Verification

Feature status may be marked **100% Verified** only after the CI workflow is green and every applicable staging check below has passed.

## Safety boundary

- Use the disposable `ustp_alumni_ci` MySQL service in GitHub Actions or a dedicated staging/test database.
- Never run migrations, seeds, cleanup, smoke tests, or test SQL against production.
- With `NODE_ENV=test`, `DB_NAME` must end in `_test`, `_ci`, or `_staging`; the server refuses other database names before creating a connection.
- Keep staging frontend, backend, database, JWT secret, Admin credentials, and allowed origins separate from production.
- Do not paste credentials into tickets, screenshots, command history, or CI logs.

## Automated CI verification

Push to `main` or `master`, or open a pull request, then open **GitHub Actions > CI > build**. Confirm these named steps pass:

- Run database migrations
- Verify migration idempotency
- Run server hardening tests
- Run frontend tests
- Build server
- Build frontend
- Start API server
- Smoke test Graduate Tracer workflow

The tracer smoke step must finish with exactly:

```text
Graduate Tracer smoke checks passed: validation, drafts, submission, database rows, Admin viewing, and PDF output.
```

## A. Draft recovery

1. Sign in to staging as a clearly identified test Alumni.
2. Open `/alumni/tracer` and enter recognizable values in Sections A-D.
3. Select **Save Draft** and confirm the success message.
4. Log out and close the browser.
5. Sign in again, preferably in another browser or device.
6. Reopen `/alumni/tracer` and compare every saved value.

Pass: the exact server-saved draft is restored; it is not dependent on the first browser's local storage.

## B. Validation

Verify each case is blocked and displays a message beside the related field:

- Empty required fields
- Invalid email address
- Invalid Philippine mobile number
- Invalid or impossible birthday date/year
- Future graduation year
- Incomplete education row
- Partially completed training row
- Missing conditional employment information
- Any **Others** choice without its specification
- Malformed final payload returns HTTP 400 with structured `fields`

After an error, verify previously valid answers remain unchanged.

## C. Final submission

1. Complete Sections A-D with valid test information.
2. Select **Submit CHED Tracer Form**.
3. Confirm the success response and submitted date.
4. Refresh the page, then log out and back in.
5. Confirm the completed response remains and can be edited according to the existing resubmission rule.

Pass: one `tracer_form` exists for the test Alumni, its status is `completed`, `submitted_at` is populated, and no draft remains.

## D. Read-only database verification

Run only against the staging/test database. Replace the uppercase placeholders; do not modify or delete records.

```sql
SELECT tf.id, tf.user_id, tf.submission_status, tf.submitted_at
FROM tracer_form tf
JOIN profiles p ON p.id = tf.user_id
WHERE p.email = 'TEST_ALUMNI_EMAIL';

SELECT degree_specialization, school, year_graduated
FROM tracer_education
WHERE tracer_form_id = TRACER_FORM_ID
ORDER BY row_order;

SELECT title, duration_credits, institution
FROM tracer_trainings
WHERE tracer_form_id = TRACER_FORM_ID
ORDER BY row_order;

SELECT gtf.form_status, gtf.submitted_at, ted.employment_status
FROM graduate_tracer_forms gtf
LEFT JOIN tracer_employment_data ted ON ted.form_id = gtf.id
WHERE gtf.alumni_id = 'TEST_ALUMNI_USER_ID';

SELECT COUNT(*) AS remaining_drafts
FROM tracer_drafts
WHERE user_id = 'TEST_ALUMNI_USER_ID';
```

Pass: the parent and child values match the form, both status/date fields show a completed submission, and `remaining_drafts` is `0`.

## E. Admin verification

1. Sign in to staging as Admin and open `/admin/tracer`.
2. Search by the test Alumni's exact name, then exact email.
3. Confirm the completed record appears with submission status and date.
4. Open the record and compare all saved values in Sections A-D with the Alumni form.

Pass: Admin sees the database-backed completed submission and cannot see a stale draft in its place.

## F. PDF verification

As the test Alumni, use **Preview PDF** and **Download PDF** on `/alumni/tracer`. As Admin, preview and download the same record on `/admin/tracer`.

Pass for all four operations:

- HTTP response is `application/pdf`.
- The file is non-empty and opens as a PDF.
- Sections A-D are present.
- Alumni name and submitted values match the database record.
- No internal server error or local-only file URL is displayed.

## G. Physical phone verification

On a real phone using the staging URL:

1. Open all four tracer sections.
2. Confirm controls fit the viewport, long labels/errors wrap, and the page has no horizontal overflow.
3. Confirm Next, Previous, Save Draft, Submit, Preview PDF, and Download PDF remain accessible.
4. Save a draft, reload or sign in on another mobile browser, and confirm recovery.
5. Submit, preview, and download the completed PDF.

## QA checklist

- [ ] CI database migrations passed
- [ ] Backend automated tests passed
- [ ] Frontend automated tests passed
- [ ] Graduate Tracer smoke test passed
- [ ] Frontend build passed
- [ ] Backend build passed
- [ ] Draft saves successfully
- [ ] Draft restores after logout
- [ ] Draft restores on another device
- [ ] Required-field validation passed
- [ ] Email validation passed
- [ ] Mobile validation passed
- [ ] Year and birthday-date validation passed
- [ ] Education validation passed
- [ ] Training validation passed
- [ ] Others validation passed
- [ ] Final submission successful
- [ ] Completed tracer persists after login
- [ ] Parent tracer database record verified
- [ ] Related tracer records verified
- [ ] Admin can locate Alumni tracer by name and email
- [ ] Admin sections show correct information, status, and date
- [ ] Alumni PDF preview works
- [ ] Alumni PDF download works
- [ ] Admin PDF preview works
- [ ] Admin PDF download works
- [ ] Desktop view passed
- [ ] Physical mobile device passed
- [ ] No horizontal overflow

Record the staging URL, CI run link, test date, tester, test Alumni identifier, browser/device names, and any evidence references with the completed checklist. Never record passwords or tokens.
