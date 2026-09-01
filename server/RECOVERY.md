# Database recovery procedure

Use this procedure only against a disposable staging database during routine drills. Never restore over the active production database.

## Before deployment

1. Create a provider snapshot or a consistent `mysqldump` backup.
2. Record the deployed application revision and the latest row in `schema_migrations`.
3. Run `npm run migrate` before starting the new server revision.
4. Verify `/api/health`, authentication, profile pagination, donations, announcements, and admin sessions.

## Recovery

1. Stop application writes or place the application in maintenance mode.
2. Create a new empty recovery database; do not overwrite the failed database.
3. Restore the last known-good backup into the recovery database.
4. Compare table counts and `schema_migrations` between the backup metadata and the restored database.
5. Point a staging server at the recovery database and run the non-destructive smoke suite.
6. Switch production only after verification, retaining the failed database for investigation.

Migrations are forward-only. Rollback is performed by restoring a pre-deployment backup into a new database and switching the application after verification. The CI workflow repeats migrations to prove idempotency and restores a dump into `ustp_alumni_restore_ci` on every run.
