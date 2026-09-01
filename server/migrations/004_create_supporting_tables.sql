CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'notification',
    status VARCHAR(50) DEFAULT 'sent',
    recipients TEXT,
    recipient_count INT DEFAULT 0,
    sent_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(36) DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS email_logs (
    id VARCHAR(36) PRIMARY KEY,
    alumni_id VARCHAR(36) DEFAULT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    email_purpose VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message LONGTEXT NOT NULL,
    status VARCHAR(30) NOT NULL,
    error_message TEXT NULL,
    sent_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(36) DEFAULT NULL,
    provider_message_id VARCHAR(255) DEFAULT NULL,
    INDEX idx_email_logs_alumni (alumni_id),
    INDEX idx_email_logs_purpose (email_purpose),
    INDEX idx_email_logs_created (created_at),
    INDEX idx_email_logs_duplicate_guard (alumni_id, email_purpose, created_at)
);

CREATE TABLE IF NOT EXISTS user_notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(80) NOT NULL DEFAULT 'general',
    link_url TEXT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_notifications_user (user_id),
    INDEX idx_user_notifications_read (user_id, is_read),
    INDEX idx_user_notifications_created (created_at)
);

CREATE TABLE IF NOT EXISTS email_queue_settings (
    id TINYINT PRIMARY KEY DEFAULT 1,
    daily_email_limit INT NOT NULL DEFAULT 300,
    batch_size_per_send_cycle INT NOT NULL DEFAULT 50,
    send_interval_minutes INT NOT NULL DEFAULT 60,
    queue_processing_enabled TINYINT(1) NOT NULL DEFAULT 1,
    reminder_priority_level VARCHAR(20) NOT NULL DEFAULT 'normal',
    last_processed_at DATETIME NULL,
    last_daily_check_at DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_queue (
    id VARCHAR(36) PRIMARY KEY,
    alumni_id VARCHAR(36) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255) NULL,
    email_purpose VARCHAR(100) NOT NULL,
    reminder_stage VARCHAR(20) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    subject VARCHAR(255) NOT NULL,
    message LONGTEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    scheduled_for DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    last_attempt_at DATETIME NULL,
    sent_at DATETIME NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(36) NULL,
    INDEX idx_email_queue_status_schedule (status, scheduled_for),
    INDEX idx_email_queue_alumni_purpose (alumni_id, email_purpose),
    INDEX idx_email_queue_created (created_at)
);

ALTER TABLE donations ADD COLUMN receipt_url LONGTEXT NULL;
ALTER TABLE donations ADD COLUMN reviewed_at DATETIME NULL;
ALTER TABLE donations ADD COLUMN reviewed_by VARCHAR(36) NULL;
ALTER TABLE donations ADD COLUMN review_notes TEXT NULL;
ALTER TABLE user_roles ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN email_status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN email_sent_at DATETIME NULL;
ALTER TABLE users ADD COLUMN email_error TEXT NULL;
ALTER TABLE freedom_wall_posts ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'Discussion';
ALTER TABLE concerns ADD COLUMN reporter_name VARCHAR(255) NULL;
ALTER TABLE concerns ADD COLUMN reporter_email VARCHAR(255) NULL;
ALTER TABLE concerns MODIFY COLUMN alumni_id VARCHAR(36) NULL;
ALTER TABLE officers MODIFY COLUMN alumni_id VARCHAR(36) NULL;
