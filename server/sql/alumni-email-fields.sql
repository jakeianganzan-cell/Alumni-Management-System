ALTER TABLE users
  ADD COLUMN email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN email_sent_at DATETIME NULL,
  ADD COLUMN email_error TEXT NULL;

ALTER TABLE imported_alumni_records
  ADD COLUMN email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN email_error TEXT NULL;
