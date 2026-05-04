-- Database upgrade script
-- 1. Rename legacy events table to announcements when needed
-- 2. Add announcement type support
-- 3. Remove legacy jobs tables
-- 4. Create new officer bundle and import history tables

RENAME TABLE events TO announcements;

ALTER TABLE announcements
  ADD COLUMN type TEXT DEFAULT 'announcement';

ALTER TABLE announcements
  ADD COLUMN google_form_link TEXT NULL;

ALTER TABLE announcements
  ADD COLUMN approval_status VARCHAR(50) NOT NULL DEFAULT 'approved';

ALTER TABLE announcements
  ADD COLUMN created_by VARCHAR(36) NULL;

ALTER TABLE announcements
  ADD COLUMN approved_by VARCHAR(36) NULL;

ALTER TABLE announcements
  ADD COLUMN rejection_reason TEXT NULL;

UPDATE announcements
SET type = 'event'
WHERE type IS NULL OR type = '';

DROP TABLE IF EXISTS job_applications;
DROP TABLE IF EXISTS jobs;

CREATE TABLE IF NOT EXISTS officer_school_year (
  id INT AUTO_INCREMENT PRIMARY KEY,
  start_year SMALLINT NOT NULL,
  end_year SMALLINT NOT NULL,
  label VARCHAR(25) NOT NULL,
  is_current TINYINT(1) DEFAULT 0,
  created_by VARCHAR(36) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_officer_school_year_label (label),
  UNIQUE KEY uq_officer_school_year_range (start_year, end_year)
);

CREATE TABLE IF NOT EXISTS officers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_year_id INT NOT NULL,
  alumni_id VARCHAR(36) NOT NULL,
  position VARCHAR(100) NOT NULL,
  custom_position VARCHAR(255) DEFAULT NULL,
  display_order INT DEFAULT 0,
  snapshot_name VARCHAR(255) NOT NULL,
  snapshot_email VARCHAR(255) DEFAULT NULL,
  snapshot_course VARCHAR(255) DEFAULT NULL,
  snapshot_batch VARCHAR(50) DEFAULT NULL,
  snapshot_contact_number VARCHAR(50) DEFAULT NULL,
  snapshot_photo LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imported_alumni_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  import_batch_id VARCHAR(36) NOT NULL,
  imported_profile_id VARCHAR(36) DEFAULT NULL,
  full_name VARCHAR(255) NOT NULL,
  graduation_year VARCHAR(10) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  contact_number VARCHAR(50) DEFAULT NULL,
  generated_alumni_id VARCHAR(50) DEFAULT NULL,
  status VARCHAR(50) DEFAULT 'imported',
  imported_by VARCHAR(36) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE donations
  ADD COLUMN reviewed_at DATETIME NULL;

ALTER TABLE donations
  ADD COLUMN reviewed_by VARCHAR(36) NULL;

ALTER TABLE donations
  ADD COLUMN review_notes TEXT NULL;

CREATE TABLE IF NOT EXISTS achievement_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  achievement_id INT NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievement_reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  achievement_id INT NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  reaction_type VARCHAR(20) NOT NULL DEFAULT 'like',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_achievement_reactions_user (achievement_id, user_id)
);
