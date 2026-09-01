# Database Migrations

This directory contains one-time database migration scripts.

## How to Run

1. Ensure your `.env` file has the correct database configuration
2. Run the migration script:

```bash
cd server
npx tsx run-migration.mjs
```

## Migration Files

- `001_initial_schema.sql` - Base schema
- `002_add_profile_columns.sql` - Advanced studies & BOR columns
- `003_add_announcement_columns.sql` - Duration & audience fields
- `004_create_supporting_tables.sql` - Sessions, logs, notifications, etc.
- `005_covering_indexes.sql` - Query performance indexes
- `006_expand_about_us.sql` - About Us settings and configurable institutional content
- `007_about_staff_and_service_items.sql` - Staff categories and normalized Frontline Service items
- `008_add_donation_anonymity.sql` - Anonymous donation visibility
- `009_add_walk_in_donation_fields.sql` - Admin-recorded walk-in donor information
- `010_add_google_link.sql` - Admin-managed Google link for the public About Us page
