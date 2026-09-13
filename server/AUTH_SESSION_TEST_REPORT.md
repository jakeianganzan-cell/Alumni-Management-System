# Authentication and Session Test Report

Date: 2026-09-12

Result: PASS for the automated local test suites. The guarded API edge smoke test is implemented for a confirmed non-production database.

## Testing Checklist

- [x] Valid login: bcrypt password verification accepts the correct password.
- [x] Invalid login: missing and incorrect credentials are rejected with the same public message.
- [x] Logout: the server ends only the authenticated session and the browser clears active and remembered tokens.
- [x] Session expiration: expired JWTs are rejected and their session record is ended.
- [x] Terminated session: inactive or force-ended sessions are denied.
- [x] Multiple-device sessions: new logins insert independent sessions without ending existing sessions.
- [x] Role-based login: only currently assigned Admin, Alumni, and Department Chairman roles can be selected.
- [x] Unauthorized access: missing, malformed, and insufficient-role requests are rejected.
- [x] Error handling: public authentication errors remain sanitized and session-store failures fail closed.
- [x] Final automated result recorded: 26 server tests and 12 frontend tests passed.

## Verification Commands

```powershell
npm test --prefix server
npm test -- --run
npm run build --prefix server
npx tsc -p tsconfig.app.json --noEmit
```

## Non-production API lifecycle smoke test

`npm run smoke:edge --prefix server` verifies the live route lifecycle for valid and invalid login, logout, independent device sessions, force termination, expiration, role selection, unauthorized access, and sanitized errors.

This smoke test creates test sessions and a temporary test alumnus. Run it only against a confirmed development or staging database. It must not be run against production.
