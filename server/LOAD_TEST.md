# Local load test

The load test defaults to the database-backed health endpoint and refuses to
target a non-local host unless `LOAD_TEST_CONFIRM=true` is explicitly set.

```powershell
npm run load:test --prefix server
```

To exercise authenticated profile pagination, start the API locally and run:

```powershell
$env:LOAD_TEST_URL="http://127.0.0.1:5000/api/profiles?paginated=true&role=alumni&page=1&pageSize=15"
$env:LOAD_TEST_AUTH="true"
$env:LOAD_TEST_REQUESTS="500"
$env:LOAD_TEST_CONCURRENCY="50"
npm run load:test --prefix server
```

`LOAD_TEST_AUTH=true` reads the admin credentials from `server/.env`. Tokens and
passwords are never included in the report. Use a dedicated test account in a
staging environment for larger tests.
