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
- `011_database_integrity_hardening.sql` - Foreign-key, uniqueness, and data-integrity safeguards
- `012_expand_donations_to_contributions.sql` - Contribution types, verification details, hours, quantities, and recorded values
- `013_normalize_contribution_categories.sql` - Active Donation, Volunteer Service, and Project Support categories
- `014_contribution_opportunities_and_submissions.sql` - Announcement opportunities, alumni registrations/offers, lifecycle tracking, and verified-record linkage
- `015_president_organizational_governance.sql` - Administrator/President role separation, targets, MOAs, accomplishment reports, private documents, and project links
- `016_retire_president_access.sql` - Retire President login access, end affected sessions, and retain the shared user as System Administrator
