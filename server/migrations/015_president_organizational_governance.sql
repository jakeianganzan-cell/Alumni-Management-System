INSERT IGNORE INTO user_roles (user_id, role, archived)
SELECT user_id, 'admin', 0
FROM user_roles
WHERE role = 'president' AND COALESCE(archived, 0) = 0;

UPDATE user_roles admin_role
JOIN user_roles president_role ON president_role.user_id = admin_role.user_id
SET admin_role.archived = 0
WHERE admin_role.role = 'admin'
  AND president_role.role = 'president'
  AND COALESCE(president_role.archived, 0) = 0;

CREATE TABLE IF NOT EXISTS organizational_targets (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    category VARCHAR(80) NOT NULL,
    target_value DECIMAL(14,2) NOT NULL,
    unit VARCHAR(80) NOT NULL,
    calculation_method VARCHAR(20) NOT NULL DEFAULT 'Manual',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    responsible_person VARCHAR(255) NOT NULL,
    related_project_id BIGINT NULL,
    related_announcement_id INT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Active',
    supporting_notes TEXT NULL,
    archived_at DATETIME NULL,
    created_by VARCHAR(36) NULL,
    updated_by VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_organizational_targets_status_dates (status, start_date, end_date),
    INDEX idx_organizational_targets_category (category),
    FOREIGN KEY (related_project_id) REFERENCES alumni_projects(id) ON DELETE SET NULL,
    FOREIGN KEY (related_announcement_id) REFERENCES announcements(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS organizational_target_progress (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_id BIGINT NOT NULL,
    progress_value DECIMAL(14,2) NOT NULL,
    progress_date DATE NOT NULL,
    explanation TEXT NOT NULL,
    evidence_note TEXT NULL,
    recorded_by VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_target_progress_target_date (target_id, progress_date),
    FOREIGN KEY (target_id) REFERENCES organizational_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS moa_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    partner_organization VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    reference_number VARCHAR(120) NULL,
    effective_date DATE NOT NULL,
    expiration_date DATE NULL,
    responsible_person VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Active',
    description TEXT NULL,
    archived_at DATETIME NULL,
    created_by VARCHAR(36) NULL,
    updated_by VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_moa_reference_number (reference_number),
    INDEX idx_moa_partner_status (partner_organization, status),
    INDEX idx_moa_dates (effective_date, expiration_date),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS moa_documents (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    moa_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT NOT NULL,
    file_data LONGBLOB NOT NULL,
    uploaded_by VARCHAR(36) NULL,
    archived_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_moa_documents_moa (moa_id, archived_at),
    FOREIGN KEY (moa_id) REFERENCES moa_records(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS accomplishment_reports (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    reporting_period_start DATE NOT NULL,
    reporting_period_end DATE NOT NULL,
    related_project_id BIGINT NULL,
    related_announcement_id INT NULL,
    objectives TEXT NOT NULL,
    activities_accomplished TEXT NOT NULL,
    actual_results TEXT NOT NULL,
    beneficiaries TEXT NULL,
    challenges_recommendations TEXT NULL,
    prepared_by VARCHAR(255) NOT NULL,
    date_prepared DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    review_notes TEXT NULL,
    created_by VARCHAR(36) NULL,
    reviewed_by VARCHAR(36) NULL,
    submitted_at DATETIME NULL,
    reviewed_at DATETIME NULL,
    archived_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_accomplishment_reports_status_period (status, reporting_period_start, reporting_period_end),
    INDEX idx_accomplishment_reports_project (related_project_id),
    FOREIGN KEY (related_project_id) REFERENCES alumni_projects(id) ON DELETE SET NULL,
    FOREIGN KEY (related_announcement_id) REFERENCES announcements(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS accomplishment_report_contributions (
    report_id BIGINT NOT NULL,
    contribution_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (report_id, contribution_id),
    FOREIGN KEY (report_id) REFERENCES accomplishment_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (contribution_id) REFERENCES donations(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS accomplishment_report_documents (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    report_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT NOT NULL,
    file_data LONGBLOB NOT NULL,
    uploaded_by VARCHAR(36) NULL,
    archived_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_accomplishment_documents_report (report_id, archived_at),
    FOREIGN KEY (report_id) REFERENCES accomplishment_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE alumni_projects ADD COLUMN objectives TEXT NULL AFTER description;
ALTER TABLE alumni_projects ADD COLUMN responsible_person VARCHAR(255) NULL AFTER organization_name;
ALTER TABLE alumni_projects ADD COLUMN related_target_id BIGINT NULL AFTER related_contribution_id;
ALTER TABLE alumni_projects ADD COLUMN related_moa_id BIGINT NULL AFTER related_target_id;
ALTER TABLE alumni_projects ADD COLUMN evidence_notes TEXT NULL AFTER accomplishments;
ALTER TABLE alumni_projects ADD INDEX idx_alumni_projects_target (related_target_id);
ALTER TABLE alumni_projects ADD INDEX idx_alumni_projects_moa (related_moa_id);
ALTER TABLE alumni_projects ADD CONSTRAINT fk_alumni_projects_target FOREIGN KEY (related_target_id) REFERENCES organizational_targets(id) ON DELETE SET NULL;
ALTER TABLE alumni_projects ADD CONSTRAINT fk_alumni_projects_moa FOREIGN KEY (related_moa_id) REFERENCES moa_records(id) ON DELETE SET NULL;

ALTER TABLE organizational_targets ADD CONSTRAINT chk_organizational_target_value CHECK (target_value > 0);
ALTER TABLE organizational_targets ADD CONSTRAINT chk_organizational_target_dates CHECK (end_date >= start_date);
ALTER TABLE organizational_target_progress ADD CONSTRAINT chk_organizational_progress_value CHECK (progress_value >= 0);
ALTER TABLE moa_records ADD CONSTRAINT chk_moa_date_range CHECK (expiration_date IS NULL OR expiration_date >= effective_date);
ALTER TABLE accomplishment_reports ADD CONSTRAINT chk_accomplishment_report_period CHECK (reporting_period_end >= reporting_period_start);
