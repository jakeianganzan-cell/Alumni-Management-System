CREATE TABLE IF NOT EXISTS dashboard_slides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    caption TEXT,
    image_url LONGTEXT NOT NULL,
    link_url TEXT,
    is_highlighted TINYINT(1) NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_by VARCHAR(36) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_dashboard_slides_visible (status, is_highlighted, display_order)
);

SET @event_rsvps_verification_status_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_rsvps'
      AND COLUMN_NAME = 'verification_status'
);

SET @event_rsvps_verification_status_sql = IF(
    @event_rsvps_verification_status_exists = 0,
    'ALTER TABLE event_rsvps ADD COLUMN verification_status ENUM(''Pending'',''Verified'',''Not Verified'') DEFAULT ''Pending''',
    'SELECT ''event_rsvps.verification_status already exists'' AS migration_note'
);

PREPARE event_rsvps_verification_status_stmt FROM @event_rsvps_verification_status_sql;
EXECUTE event_rsvps_verification_status_stmt;
DEALLOCATE PREPARE event_rsvps_verification_status_stmt;
