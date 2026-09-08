# Environment separation

The application uses four isolated environments. Never reuse a database, JWT secret, administrator password, email credential, upload store, or backup credential between them.

| Environment | `APP_ENV` | `DB_ENVIRONMENT` | Database example | Purpose |
| --- | --- | --- | --- | --- |
| Development | `development` | `development` | `sacc_alumni_dev` | Local development and sample data |
| Test | `test` | `test` | `sacc_alumni_test` | Automated tests only |
| Staging | `staging` | `staging` | `sacc_alumni_staging` | Release and recovery verification |
| Production | `production` | `production` | `sacc_alumni_prod` | Live institutional data only |

## Configuration rules

- The backend reads only `server/.env` during local execution. The root `.env` is frontend-only.
- Explicit process or hosting environment variables take precedence over local files.
- Staging and production require matching `APP_ENV` and `DB_ENVIRONMENT` values.
- Production refuses a localhost database.
- Database seeding, sample-data cleanup, and mutating smoke tests refuse to run in production.
- `RUNTIME_SCHEMA_SYNC` remains `false` in staging and production; reviewed migrations run before server startup.

## Deployment setup

Render has separate production and staging service definitions in `render.yaml`. Supply a different database and different secrets for each service. Do not clone production data into staging unless it has been properly anonymized and access-approved.

In Vercel, configure `VITE_API_BASE_URL` separately by scope:

- Development: local API URL
- Preview: staging API URL
- Production: production API URL

Set the matching public `VITE_APP_ENV` label in each Vercel scope as an additional deployment audit signal.

Never place database, JWT, SMTP, Brevo, administrator, or encryption secrets in a `VITE_*` variable because those values are delivered to browsers.

The encrypted backup workflow uses the protected GitHub environment `production-backup`. Store its backup-only database credentials and encryption key in that environment, and restrict who can approve or access it.

## Release sequence

1. Apply and test migrations against the isolated staging database.
2. Run staging smoke checks and validate the affected workflows.
3. Create and verify a production backup.
4. Deploy the reviewed revision to production.
5. Run non-mutating production health checks and monitor server logs.
