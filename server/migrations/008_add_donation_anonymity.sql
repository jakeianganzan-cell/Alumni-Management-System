ALTER TABLE donations ADD COLUMN is_anonymous TINYINT(1) NOT NULL DEFAULT 0 AFTER receipt_url;
