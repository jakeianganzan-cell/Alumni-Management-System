ALTER TABLE system_settings ADD COLUMN programs_json LONGTEXT AFTER login_slideshow_enabled;
ALTER TABLE system_settings ADD COLUMN philosophy TEXT AFTER history;
ALTER TABLE system_settings ADD COLUMN institutional_goal TEXT AFTER philosophy;
ALTER TABLE system_settings ADD COLUMN alumni_portal_description TEXT AFTER institutional_goal;
ALTER TABLE system_settings ADD COLUMN about_cover_image_path LONGTEXT AFTER alumni_portal_description;
ALTER TABLE system_settings ADD COLUMN map_url TEXT AFTER about_cover_image_path;
ALTER TABLE system_settings ADD COLUMN office_hours VARCHAR(255) AFTER map_url;

CREATE TABLE IF NOT EXISTS institution_content_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    content_type VARCHAR(30) NOT NULL,
    year_label VARCHAR(30) NULL,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255) NULL,
    description TEXT NULL,
    organization VARCHAR(255) NULL,
    department VARCHAR(255) NULL,
    credentials VARCHAR(255) NULL,
    image_url LONGTEXT NULL,
    icon VARCHAR(100) NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_institution_content_public (content_type, is_active, display_order)
);
