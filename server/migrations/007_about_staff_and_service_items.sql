ALTER TABLE institution_content_items ADD COLUMN category VARCHAR(100) NULL AFTER credentials;

CREATE TABLE IF NOT EXISTS institution_service_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    service_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_institution_service_items_public (service_id, is_active, display_order),
    FOREIGN KEY (service_id) REFERENCES institution_content_items(id) ON DELETE CASCADE
);
