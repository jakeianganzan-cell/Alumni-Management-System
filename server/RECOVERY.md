# Database backup and recovery plan

This plan protects the MySQL data independently of the application deployment. Never restore over the active production database. Restore into a new, empty database, verify it, and switch the application only after approval.

## Recovery objectives

- Target recovery point (RPO): no more than 24 hours of data loss.
- Target recovery time (RTO): restore and validate service within 4 hours.
- Minimum retention: 30 daily encrypted backups. When the database provider supports snapshots, also retain weekly and monthly snapshots according to institutional policy.
- Run a staging recovery drill at least quarterly and before a high-risk migration.

Provider-native automatic snapshots are the primary backup layer because they are closest to the database. The scheduled GitHub workflow in `.github/workflows/database-backup.yml` is an encrypted, off-database secondary layer. A successful workflow is not a successful recovery drill; both layers must be tested.

## Enable automatic encrypted backups

The scheduled workflow runs daily at 02:17 Asia/Taipei (18:17 UTC) and retains each encrypted artifact for 30 days. Configure these GitHub Actions secrets:

- `BACKUP_DB_HOST`, `BACKUP_DB_PORT`, `BACKUP_DB_USER`, `BACKUP_DB_PASSWORD`, and `BACKUP_DB_NAME`
- `BACKUP_DB_SSL` (`true` for the hosted database) and, when required, `BACKUP_DB_SSL_CA`
- `BACKUP_ENCRYPTION_KEY`, exactly 64 hexadecimal characters generated from 32 cryptographically random bytes

Use a separate least-privilege database account that can read all application tables and dump views, triggers, routines, and events, but cannot modify application data. Restrict its network access when the provider supports it. Keep the encryption key outside the database provider and Git repository; losing it makes the backups unrecoverable.

After adding the secrets, manually run **Encrypted database backup** once. Confirm the workflow created both the `.sql.gz.enc` artifact and its `.json` integrity metadata. Enable provider-native daily snapshots separately in the database host dashboard and confirm its retention settings there.

## Create an operator backup

With database variables and `BACKUP_ENCRYPTION_KEY` provided through a secure environment, run:

```powershell
npm run backup --prefix server
```

The command uses a consistent transaction, compresses the dump, encrypts it with AES-256-GCM, writes a SHA-256 integrity record, and removes temporary credential files. Backup files are ignored by Git. Store the encrypted file and its adjacent `.json` file together.

## Restore into a disposable database

1. Select an encrypted backup and its matching metadata file.
2. Create a new, empty staging database. Do not use the production database name.
3. Set `BACKUP_FILE`, `BACKUP_ENCRYPTION_KEY`, the `RESTORE_DB_*` variables, and set `RESTORE_CONFIRM_DATABASE` to exactly the disposable database name.
4. Set `ALLOW_DATABASE_RESTORE=YES` only for the duration of the approved drill.
5. Run `npm run restore --prefix server`.

The restore tool verifies the encrypted file checksum, refuses a target matching the configured source database, and refuses a non-empty target. It then authenticates and decrypts the stream before importing it.

## Validate before recovery cutover

1. Compare table counts and the complete `schema_migrations` ledger with the source backup record.
2. Point a staging server at the restored database.
3. Verify `/api/health`, sign-in and role restrictions, profile pagination and edits, tracer data, events, surveys, donations, announcements, uploads, and admin session controls.
4. Confirm recent expected records are present and record the actual backup age and recovery time.
5. Record results using `server/recovery-drills/TEMPLATE.md`. Treat any failed check as a failed drill and correct the backup process before relying on it.

## Production recovery

1. Declare the incident and stop application writes or place the application in maintenance mode.
2. Preserve the failed database for investigation.
3. Restore the latest verified backup into a new database using the procedure above.
4. Complete all validation checks against a staging instance.
5. Obtain recovery approval, switch the production database configuration, run the non-destructive smoke checks, and monitor errors.
6. Retain the previous database until the incident owner approves its removal.

Migrations are forward-only. Rollback means restoring a verified pre-deployment backup into a new database and switching after validation; never edit or falsify the `schema_migrations` ledger.
