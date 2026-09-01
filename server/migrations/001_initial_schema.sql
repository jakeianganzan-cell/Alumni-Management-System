CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    email_sent_at DATETIME NULL,
    email_error TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    student_id VARCHAR(50) UNIQUE,
    course VARCHAR(255),
    batch VARCHAR(10),
    bor_number VARCHAR(100),
    bor_date DATE,
    graduation_batch VARCHAR(100),
    academic_year VARCHAR(30),
    graduation_semester VARCHAR(50),
    advanced_studies_level VARCHAR(50),
    advanced_studies_status VARCHAR(50),
    advanced_studies_program VARCHAR(255),
    advanced_studies_school VARCHAR(255),
    advanced_studies_start_year VARCHAR(10),
    advanced_studies_expected_completion_year VARCHAR(10),
    contact_number VARCHAR(50),
    photo LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    role VARCHAR(50) NOT NULL,
    archived TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_user_roles_user_role (user_id, role),
    INDEX idx_user_roles_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    role_id VARCHAR(50) NOT NULL,
    session_token VARCHAR(128) NOT NULL UNIQUE,
    ip_address VARCHAR(100),
    browser VARCHAR(120),
    operating_system VARCHAR(120),
    device_type VARCHAR(60),
    login_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logout_time DATETIME NULL,
    last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    INDEX idx_user_sessions_user (user_id),
    INDEX idx_user_sessions_role (role_id),
    INDEX idx_user_sessions_status (status),
    INDEX idx_user_sessions_login_time (login_time),
    INDEX idx_user_sessions_last_activity (last_activity),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36),
    session_token VARCHAR(128),
    action VARCHAR(80) NOT NULL,
    description TEXT NOT NULL,
    role_used VARCHAR(50),
    device_used VARCHAR(120),
    browser_used VARCHAR(120),
    ip_address VARCHAR(100),
    metadata_json LONGTEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_logs_user (user_id),
    INDEX idx_activity_logs_action (action),
    INDEX idx_activity_logs_role (role_used),
    INDEX idx_activity_logs_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
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
    UNIQUE KEY uq_officer_school_year_range (start_year, end_year),
    INDEX idx_officer_school_year_current (is_current),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS officers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    school_year_id INT NOT NULL,
    alumni_id VARCHAR(36) DEFAULT NULL,
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (school_year_id) REFERENCES officer_school_year(id) ON DELETE CASCADE,
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_officers_school_year (school_year_id, display_order),
    INDEX idx_officers_alumni (alumni_id),
    INDEX idx_officers_position (position)
);

CREATE TABLE IF NOT EXISTS alumni_officers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    legacy_officer_id INT DEFAULT NULL,
    alumni_id VARCHAR(36) DEFAULT NULL,
    full_name VARCHAR(255) NOT NULL,
    position VARCHAR(100) NOT NULL,
    custom_position VARCHAR(255) DEFAULT NULL,
    batch_year VARCHAR(20) DEFAULT NULL,
    department_id VARCHAR(100) DEFAULT NULL,
    program_id VARCHAR(150) DEFAULT NULL,
    contact_number VARCHAR(50) DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    photo LONGTEXT DEFAULT NULL,
    term_start DATE DEFAULT NULL,
    term_end DATE DEFAULT NULL,
    status ENUM('Active', 'Inactive', 'Completed') NOT NULL DEFAULT 'Active',
    remarks TEXT DEFAULT NULL,
    is_archived TINYINT(1) NOT NULL DEFAULT 0,
    archived_at DATETIME DEFAULT NULL,
    archived_by VARCHAR(36) DEFAULT NULL,
    created_by VARCHAR(36) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_alumni_officers_legacy (legacy_officer_id),
    INDEX idx_alumni_officers_alumni (alumni_id),
    INDEX idx_alumni_officers_status (status, is_archived),
    INDEX idx_alumni_officers_term (term_start, term_end),
    INDEX idx_alumni_officers_position (position),
    INDEX idx_alumni_officers_batch (batch_year),
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS imported_alumni_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    import_batch_id VARCHAR(36) NOT NULL,
    imported_profile_id VARCHAR(36) DEFAULT NULL,
    full_name VARCHAR(255) NOT NULL,
    graduation_year VARCHAR(10) NOT NULL,
    email_address VARCHAR(255) NOT NULL,
    contact_number VARCHAR(50) DEFAULT NULL,
    bor_number VARCHAR(100) DEFAULT NULL,
    bor_date DATE DEFAULT NULL,
    graduation_batch VARCHAR(100) DEFAULT NULL,
    academic_year VARCHAR(30) DEFAULT NULL,
    graduation_semester VARCHAR(50) DEFAULT NULL,
    advanced_studies_level VARCHAR(50) DEFAULT NULL,
    advanced_studies_status VARCHAR(50) DEFAULT NULL,
    advanced_studies_program VARCHAR(255) DEFAULT NULL,
    advanced_studies_school VARCHAR(255) DEFAULT NULL,
    advanced_studies_start_year VARCHAR(10) DEFAULT NULL,
    advanced_studies_expected_completion_year VARCHAR(10) DEFAULT NULL,
    generated_alumni_id VARCHAR(50) DEFAULT NULL,
    status VARCHAR(50) DEFAULT 'imported',
    email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    email_error TEXT NULL,
    imported_by VARCHAR(36) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_imported_alumni_batch (import_batch_id),
    INDEX idx_imported_alumni_profile (imported_profile_id),
    INDEX idx_imported_alumni_email (email_address),
    FOREIGN KEY (imported_profile_id) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    date DATE,
    time TIME,
    venue VARCHAR(255),
    type VARCHAR(100),
    google_form_link TEXT,
    organizer VARCHAR(255),
    image_url LONGTEXT,
    status VARCHAR(50) DEFAULT 'upcoming',
    approval_status VARCHAR(50) NOT NULL DEFAULT 'approved',
    created_by VARCHAR(36) DEFAULT NULL,
    approved_by VARCHAR(36) DEFAULT NULL,
    rejection_reason TEXT,
    audience_scope VARCHAR(20) NOT NULL DEFAULT 'all',
    audience_value VARCHAR(255) DEFAULT NULL,
    capacity INT DEFAULT 0,
    views INT DEFAULT 0,
    success_score INT DEFAULT 0,
    interest_enabled TINYINT(1) NOT NULL DEFAULT 0,
    start_datetime DATETIME NULL,
    end_datetime DATETIME NULL,
    auto_archive_at DATETIME NULL,
    archived_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS event_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    alumni_id VARCHAR(36) NOT NULL,
    status VARCHAR(50) DEFAULT 'registered',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_event_registration_event_user (event_id, alumni_id)
);

CREATE TABLE IF NOT EXISTS event_interests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    alumni_id VARCHAR(36) NOT NULL,
    status ENUM('Interested', 'Verified', 'Cancelled') NOT NULL DEFAULT 'Interested',
    verified_by VARCHAR(36) DEFAULT NULL,
    verified_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_event_interests_event_alumni (event_id, alumni_id),
    FOREIGN KEY (event_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_event_interests_event (event_id, status),
    INDEX idx_event_interests_alumni (alumni_id)
);

CREATE TABLE IF NOT EXISTS announcement_interests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    announcement_id INT NOT NULL,
    alumni_id VARCHAR(36) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'interested',
    interested_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_announcement_interest_alumni (announcement_id, alumni_id),
    INDEX idx_announcement_interests_announcement (announcement_id, status),
    INDEX idx_announcement_interests_alumni (alumni_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_rsvps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    alumni_id VARCHAR(36) NOT NULL,
    response_status ENUM('Going','Interested','Not Going') NOT NULL,
    attendance_status ENUM('Pending','Attended','Absent') DEFAULT 'Pending',
    verification_status ENUM('Pending','Verified','Not Verified') DEFAULT 'Pending',
    checked_in_at DATETIME NULL,
    engagement_awarded TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_event_alumni (event_id, alumni_id),
    FOREIGN KEY (event_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcement_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    announcement_id INT NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    content TEXT NOT NULL,
    status ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
    moderated_by VARCHAR(36) DEFAULT NULL,
    moderated_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_announcement_comments_announcement (announcement_id, status, created_at),
    INDEX idx_announcement_comments_user (user_id)
);

CREATE TABLE IF NOT EXISTS announcement_comment_replies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comment_id INT NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    content TEXT NOT NULL,
    status ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
    moderated_by VARCHAR(36) DEFAULT NULL,
    moderated_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES announcement_comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_announcement_comment_replies_comment (comment_id, status, created_at),
    INDEX idx_announcement_comment_replies_user (user_id)
);

CREATE TABLE IF NOT EXISTS dashboard_slides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    caption TEXT,
    media_type VARCHAR(30) NOT NULL DEFAULT 'image',
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

CREATE TABLE IF NOT EXISTS alumni_login_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alumni_login_events_user (user_id),
    INDEX idx_alumni_login_events_logged_at (logged_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS engagement_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_id INT NOT NULL,
    points INT NOT NULL,
    reason VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_engagement_source (user_id, source_type, source_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS engagement_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumni_id VARCHAR(36) NOT NULL,
    event_points INT NOT NULL DEFAULT 0,
    survey_points INT NOT NULL DEFAULT 0,
    achievement_points INT NOT NULL DEFAULT 0,
    freedom_wall_points INT NOT NULL DEFAULT 0,
    reaction_points INT NOT NULL DEFAULT 0,
    comment_points INT NOT NULL DEFAULT 0,
    total_score INT NOT NULL DEFAULT 0,
    engagement_level VARCHAR(50) NOT NULL DEFAULT 'Emerging',
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_engagement_metrics_alumni (alumni_id),
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    alumni_id VARCHAR(36) NOT NULL,
    parent_id INT DEFAULT NULL,
    content TEXT NOT NULL,
    likes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES event_comments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS graduate_tracer (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    employment_status VARCHAR(100),
    company VARCHAR(255),
    industry VARCHAR(255),
    work_location VARCHAR(255),
    job_title VARCHAR(255),
    salary_range VARCHAR(100),
    is_first_job TINYINT(1) DEFAULT NULL,
    relevance VARCHAR(100),
    years_to_land_job VARCHAR(100),
    further_studies VARCHAR(100),
    certifications TEXT,
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_graduate_tracer_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_form (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    employment_status VARCHAR(100) NULL,
    company VARCHAR(255) NULL,
    industry VARCHAR(255) NULL,
    work_location VARCHAR(255) NULL,
    job_title VARCHAR(255) NULL,
    income VARCHAR(100) NULL,
    relevance VARCHAR(100) NULL,
    time_to_job VARCHAR(100) NULL,
    further_studies VARCHAR(100) NULL,
    certifications TEXT NULL,
    comments TEXT NULL,
    submission_status VARCHAR(50) NOT NULL DEFAULT 'completed',
    allow_resubmission TINYINT(1) NOT NULL DEFAULT 0,
    admin_reopened_at DATETIME NULL,
    admin_reopened_by VARCHAR(36) NULL,
    pdf_generated_at DATETIME NULL,
    ched_payload LONGTEXT NULL,
    submitted_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tracer_form_user_id (user_id),
    INDEX idx_tracer_form_status (submission_status),
    INDEX idx_tracer_form_submitted (submitted_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_reopened_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tracer_drafts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    ched_payload LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tracer_drafts_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_education (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracer_form_id INT NOT NULL,
    row_order INT NOT NULL DEFAULT 0,
    degree_specialization VARCHAR(255) NULL,
    school VARCHAR(255) NULL,
    year_graduated VARCHAR(10) NULL,
    honors_awards VARCHAR(255) NULL,
    INDEX idx_tracer_education_form (tracer_form_id, row_order),
    FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_professional_exams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracer_form_id INT NOT NULL,
    row_order INT NOT NULL DEFAULT 0,
    exam_name VARCHAR(255) NULL,
    date_taken VARCHAR(100) NULL,
    rating VARCHAR(100) NULL,
    INDEX idx_tracer_exams_form (tracer_form_id, row_order),
    FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_trainings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracer_form_id INT NOT NULL,
    row_order INT NOT NULL DEFAULT 0,
    title VARCHAR(255) NULL,
    duration_credits VARCHAR(255) NULL,
    institution VARCHAR(255) NULL,
    INDEX idx_tracer_trainings_form (tracer_form_id, row_order),
    FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_referrals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracer_form_id INT NOT NULL,
    row_order INT NOT NULL DEFAULT 0,
    referral_name VARCHAR(255) NULL,
    referral_address VARCHAR(255) NULL,
    referral_contact_number VARCHAR(100) NULL,
    INDEX idx_tracer_referrals_form (tracer_form_id, row_order),
    FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_type VARCHAR(100) NOT NULL,
    generated_by VARCHAR(36) NULL,
    filters_json LONGTEXT NULL,
    file_name VARCHAR(255) NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tracer_reports_type (report_type, generated_at),
    FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tracer_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id VARCHAR(36) NULL,
    tracer_user_id VARCHAR(36) NULL,
    action VARCHAR(100) NOT NULL,
    details_json LONGTEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tracer_audit_actor (actor_user_id),
    INDEX idx_tracer_audit_target (tracer_user_id),
    INDEX idx_tracer_audit_action (action, created_at),
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (tracer_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS graduate_tracer_forms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracer_form_id INT NULL,
    alumni_id VARCHAR(36) NOT NULL,
    form_status VARCHAR(50) NOT NULL DEFAULT 'Draft',
    submitted_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_graduate_tracer_forms_alumni (alumni_id),
    INDEX idx_graduate_tracer_forms_status (form_status),
    INDEX idx_graduate_tracer_forms_submitted (submitted_at),
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tracer_form_id) REFERENCES tracer_form(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tracer_personal_info (
    form_id INT PRIMARY KEY,
    full_name VARCHAR(255) NULL,
    email VARCHAR(255) NULL,
    contact_number VARCHAR(100) NULL,
    payload_json LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_educational_background (
    form_id INT PRIMARY KEY,
    payload_json LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_employment_data (
    form_id INT PRIMARY KEY,
    employment_status VARCHAR(100) NULL,
    job_title VARCHAR(255) NULL,
    company VARCHAR(255) NULL,
    payload_json LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_training_data (
    form_id INT PRIMARY KEY,
    payload_json LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_feedback (
    form_id INT PRIMARY KEY,
    comments TEXT NULL,
    payload_json LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES graduate_tracer_forms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracer_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    employment_status VARCHAR(100),
    company VARCHAR(255),
    work_location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS donations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    method VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending_review',
    purpose VARCHAR(255),
    ref_number VARCHAR(100),
    message TEXT,
    receipt_url LONGTEXT,
    reviewed_at DATETIME DEFAULT NULL,
    reviewed_by VARCHAR(36) DEFAULT NULL,
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS alumni_projects (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    category VARCHAR(100) NOT NULL,
    batch_year VARCHAR(20) NULL,
    lead_officer_id VARCHAR(36) NULL,
    lead_alumni_id VARCHAR(36) NULL,
    organization_name VARCHAR(255) NULL,
    alumni_group VARCHAR(255) NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Planned',
    beneficiaries TEXT NULL,
    estimated_value DECIMAL(14,2) NULL,
    funding_source VARCHAR(255) NULL,
    related_contribution_id VARCHAR(100) NULL,
    contribution_record_id VARCHAR(100) NULL,
    accomplishments TEXT NULL,
    remarks TEXT NULL,
    created_by VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_alumni_projects_status (status),
    INDEX idx_alumni_projects_category (category),
    INDEX idx_alumni_projects_batch (batch_year),
    INDEX idx_alumni_projects_dates (start_date),
    FOREIGN KEY (lead_officer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (lead_alumni_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS alumni_project_files (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path LONGTEXT NOT NULL,
    file_type VARCHAR(120) NULL,
    file_url LONGTEXT NULL,
    file_category VARCHAR(100) NOT NULL DEFAULT 'Project File',
    uploaded_by VARCHAR(36) NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alumni_project_files_project (project_id),
    FOREIGN KEY (project_id) REFERENCES alumni_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS alumni_fee_types (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    fee_name VARCHAR(150) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT NULL,
    applicable_batch_year VARCHAR(20) NULL,
    applicable_program_id VARCHAR(255) NULL,
    due_date DATE NULL,
    assigned_officer_id VARCHAR(36) NULL,
    is_required TINYINT(1) NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL DEFAULT 'Active',
    created_by VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_alumni_fee_types_status (status, is_required),
    INDEX idx_alumni_fee_types_scope (applicable_batch_year, applicable_program_id),
    INDEX idx_alumni_fee_types_officer (assigned_officer_id),
    FOREIGN KEY (assigned_officer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS alumni_fee_payments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    alumni_id VARCHAR(36) NOT NULL,
    fee_type_id BIGINT NOT NULL,
    amount_paid DECIMAL(12, 2) NOT NULL,
    paid_date DATE NOT NULL,
    received_by VARCHAR(36) NULL,
    payment_note TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Paid',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_alumni_fee_payment (alumni_id, fee_type_id),
    INDEX idx_alumni_fee_payments_alumni (alumni_id),
    INDEX idx_alumni_fee_payments_fee (fee_type_id),
    INDEX idx_alumni_fee_payments_status (status),
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (fee_type_id) REFERENCES alumni_fee_types(id) ON DELETE CASCADE,
    FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumni_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    achievement_date DATE,
    category VARCHAR(100),
    organization VARCHAR(255),
    image_url LONGTEXT,
    certificate_url LONGTEXT,
    featured TINYINT(1) DEFAULT 0,
    status ENUM('pending', 'approved', 'rejected', 'archived') DEFAULT 'pending',
    approved_by VARCHAR(36) DEFAULT NULL,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_achievements_alumni (alumni_id),
    INDEX idx_achievements_status (status),
    INDEX idx_achievements_featured (featured),
    INDEX idx_achievements_date (achievement_date)
);

CREATE TABLE IF NOT EXISTS achievement_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    achievement_id INT NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_achievement_comments_achievement (achievement_id, created_at),
    INDEX idx_achievement_comments_user (user_id)
);

CREATE TABLE IF NOT EXISTS achievement_reactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    achievement_id INT NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    reaction_type VARCHAR(20) NOT NULL DEFAULT 'heart',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_achievement_reactions_user (achievement_id, user_id),
    INDEX idx_achievement_reactions_achievement (achievement_id),
    INDEX idx_achievement_reactions_user (user_id)
);

CREATE TABLE IF NOT EXISTS freedom_wall_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    content TEXT NOT NULL,
    image_url LONGTEXT,
    visibility ENUM('public', 'alumni_only', 'private') DEFAULT 'alumni_only',
    status ENUM('published', 'hidden', 'reported', 'deleted') DEFAULT 'published',
    is_pinned TINYINT(1) DEFAULT 0,
    pinned_by VARCHAR(36) DEFAULT NULL,
    report_count INT DEFAULT 0,
    edited_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_wall_posts_user (user_id),
    INDEX idx_wall_posts_status (status),
    INDEX idx_wall_posts_pinned (is_pinned),
    INDEX idx_wall_posts_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS freedom_wall_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    parent_id INT DEFAULT NULL,
    content TEXT NOT NULL,
    status ENUM('published', 'hidden', 'reported', 'deleted') DEFAULT 'published',
    edited_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES freedom_wall_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES freedom_wall_comments(id) ON DELETE CASCADE,
    INDEX idx_wall_comments_post (post_id),
    INDEX idx_wall_comments_user (user_id),
    INDEX idx_wall_comments_parent (parent_id)
);

CREATE TABLE IF NOT EXISTS reactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    target_type ENUM('freedom_wall_post', 'freedom_wall_comment') NOT NULL,
    target_id INT NOT NULL,
    reaction_type ENUM('heart') DEFAULT 'heart',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_reactions_user_target (user_id, target_type, target_id),
    INDEX idx_reactions_target (target_type, target_id),
    INDEX idx_reactions_user (user_id)
);

CREATE TABLE IF NOT EXISTS surveys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    survey_type ENUM('before_event', 'after_event', 'general') NOT NULL,
    status ENUM('draft', 'published', 'closed', 'archived') DEFAULT 'draft',
    target_audience ENUM('all_alumni', 'registered_attendees', 'event_attendees', 'selected_batch') DEFAULT 'all_alumni',
    is_anonymous TINYINT(1) DEFAULT 0,
    allow_multiple_responses TINYINT(1) NOT NULL DEFAULT 0,
    opens_at DATETIME DEFAULT NULL,
    closes_at DATETIME DEFAULT NULL,
    start_datetime DATETIME NULL,
    end_datetime DATETIME NULL,
    auto_archive_at DATETIME NULL,
    archived_at DATETIME NULL,
    created_by VARCHAR(36) DEFAULT NULL,
    updated_by VARCHAR(36) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES announcements(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_surveys_event (event_id),
    INDEX idx_surveys_type (survey_type),
    INDEX idx_surveys_status (status)
);

CREATE TABLE IF NOT EXISTS survey_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM('short_text', 'long_text', 'single_choice', 'multiple_choice', 'rating', 'yes_no') NOT NULL,
    question_order INT NOT NULL DEFAULT 1,
    is_required TINYINT(1) DEFAULT 1,
    options_json JSON DEFAULT NULL,
    min_rating TINYINT DEFAULT NULL,
    max_rating TINYINT DEFAULT NULL,
    placeholder VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    INDEX idx_survey_questions_survey (survey_id, question_order)
);

CREATE TABLE IF NOT EXISTS survey_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    option_label VARCHAR(255) NOT NULL,
    option_value VARCHAR(255) DEFAULT NULL,
    option_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
    INDEX idx_survey_options_question (question_id, option_order)
);

CREATE TABLE IF NOT EXISTS survey_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    respondent_id VARCHAR(36) DEFAULT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    FOREIGN KEY (respondent_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_survey_responses_survey (survey_id, submitted_at),
    INDEX idx_survey_responses_respondent (respondent_id)
);

CREATE TABLE IF NOT EXISTS survey_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT DEFAULT NULL,
    survey_id INT NOT NULL,
    question_id INT NOT NULL,
    respondent_id VARCHAR(36) DEFAULT NULL,
    event_registration_id INT DEFAULT NULL,
    answer_text TEXT,
    answer_value VARCHAR(255),
    answer_json JSON DEFAULT NULL,
    rating_value DECIMAL(5,2) DEFAULT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (respondent_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (event_registration_id) REFERENCES event_registrations(id) ON DELETE SET NULL,
    INDEX idx_survey_answers_survey (survey_id),
    INDEX idx_survey_answers_question (question_id),
    INDEX idx_survey_answers_respondent (respondent_id),
    INDEX idx_survey_answers_submitted (submitted_at)
);

CREATE TABLE IF NOT EXISTS donation_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    gcash_name VARCHAR(255),
    gcash_number VARCHAR(50),
    gcash_qr LONGTEXT,
    personal_personnel VARCHAR(255),
    personal_contact VARCHAR(100),
    personal_office VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    system_name VARCHAR(255),
    system_short_name VARCHAR(100),
    institution_name VARCHAR(255),
    institution_address TEXT,
    institution_email VARCHAR(255),
    institution_contact VARCHAR(100),
    website_url TEXT,
    footer_copyright_text TEXT,
    logo_path LONGTEXT,
    login_logo_path LONGTEXT,
    favicon_path LONGTEXT,
    login_background_path LONGTEXT,
    login_backgrounds_json LONGTEXT,
    login_slideshow_enabled TINYINT(1) NOT NULL DEFAULT 0,
    primary_color VARCHAR(20),
    secondary_color VARCHAR(20),
    sidebar_color VARCHAR(20),
    header_color VARCHAR(20),
    button_color VARCHAR(20),
    card_color VARCHAR(20),
    welcome_message VARCHAR(255),
    login_subtitle TEXT,
    about_content TEXT,
    mission TEXT,
    vision TEXT,
    history TEXT,
    facebook_link TEXT,
    twitter_link TEXT,
    instagram_link TEXT,
    theme_mode ENUM('light', 'dark', 'auto', 'custom') DEFAULT 'light',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'email',
    status VARCHAR(50) DEFAULT 'sent',
    recipients VARCHAR(100) DEFAULT 'all',
    recipient_count INT DEFAULT 0,
    sent_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(36) DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS email_logs (
    id VARCHAR(36) PRIMARY KEY,
    alumni_id VARCHAR(36) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    email_purpose VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    error_message TEXT NULL,
    sent_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(36) NULL,
    provider_message_id VARCHAR(255) NULL,
    INDEX idx_email_logs_alumni (alumni_id),
    INDEX idx_email_logs_purpose (email_purpose),
    INDEX idx_email_logs_created (created_at),
    INDEX idx_email_logs_duplicate_guard (alumni_id, email_purpose, created_at),
    FOREIGN KEY (alumni_id) REFERENCES profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
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

INSERT IGNORE INTO email_queue_settings
    (id, daily_email_limit, batch_size_per_send_cycle, send_interval_minutes, queue_processing_enabled, reminder_priority_level)
VALUES (1, 300, 50, 60, 1, 'normal');

CREATE TABLE IF NOT EXISTS email_queue (
    id VARCHAR(36) PRIMARY KEY,
    alumni_id VARCHAR(36) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255) NULL,
    email_purpose VARCHAR(100) NOT NULL,
    reminder_stage VARCHAR(30) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    scheduled_for DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    last_attempt_at DATETIME NULL,
    sent_at DATETIME NULL,
    provider_message_id VARCHAR(255) NULL,
    error_message TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(36) NULL,
    INDEX idx_email_queue_status_schedule (status, scheduled_for),
    INDEX idx_email_queue_alumni_purpose (alumni_id, email_purpose),
    INDEX idx_email_queue_created (created_at),
    FOREIGN KEY (alumni_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'general',
    link_url VARCHAR(255) DEFAULT NULL,
    is_read TINYINT(1) DEFAULT 0,
    actor_id VARCHAR(36) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_notifications_user (user_id),
    INDEX idx_user_notifications_read (user_id, is_read),
    INDEX idx_user_notifications_created (created_at)
);

CREATE TABLE IF NOT EXISTS concerns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumni_id VARCHAR(36) NULL,
    reporter_name VARCHAR(255) NULL,
    reporter_email VARCHAR(255) NULL,
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending',
    admin_reply TEXT NULL,
    replied_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_concerns_alumni (alumni_id),
    INDEX idx_concerns_status (status),
    INDEX idx_concerns_created (created_at),
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS user_settings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    resume_url LONGTEXT,
    privacy_profile_visibility ENUM('public', 'alumni_only', 'private') DEFAULT 'alumni_only',
    privacy_employment_visibility ENUM('public', 'alumni_only', 'private') DEFAULT 'alumni_only',
    allow_event_alerts TINYINT(1) DEFAULT 1,
    allow_survey_reminders TINYINT(1) DEFAULT 1,
    allow_community_notifications TINYINT(1) DEFAULT 1,
    allow_email_notifications TINYINT(1) DEFAULT 1,
    allow_in_app_notifications TINYINT(1) DEFAULT 1,
    theme_preference ENUM('system', 'light', 'dark') DEFAULT 'system',
    language_preference VARCHAR(20) DEFAULT 'en',
    timezone VARCHAR(100) DEFAULT 'Asia/Manila',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_settings_user (user_id)
);


