ALTER TABLE donations MODIFY COLUMN user_id VARCHAR(36) NULL;
ALTER TABLE donations ADD COLUMN donor_name VARCHAR(255) NULL AFTER is_anonymous;
ALTER TABLE donations ADD COLUMN donor_email VARCHAR(255) NULL AFTER donor_name;
ALTER TABLE donations ADD COLUMN donor_student_id VARCHAR(100) NULL AFTER donor_email;
ALTER TABLE donations ADD COLUMN donor_batch VARCHAR(100) NULL AFTER donor_student_id;
ALTER TABLE donations ADD COLUMN donor_course VARCHAR(255) NULL AFTER donor_batch;
