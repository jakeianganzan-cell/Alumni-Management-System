CREATE DATABASE IF NOT EXISTS ustp_alumni;
USE ustp_alumni;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS survey_answers;
DROP TABLE IF EXISTS survey_questions;
DROP TABLE IF EXISTS surveys;
DROP TABLE IF EXISTS reactions;
DROP TABLE IF EXISTS freedom_wall_comments;
DROP TABLE IF EXISTS freedom_wall_posts;
DROP TABLE IF EXISTS imported_alumni_records;
DROP TABLE IF EXISTS officers;
DROP TABLE IF EXISTS officer_school_year;
DROP TABLE IF EXISTS achievements;
DROP TABLE IF EXISTS job_applications;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS donation_settings;
DROP TABLE IF EXISTS tracer_audit_logs;
DROP TABLE IF EXISTS tracer_reports;
DROP TABLE IF EXISTS tracer_referrals;
DROP TABLE IF EXISTS tracer_trainings;
DROP TABLE IF EXISTS tracer_professional_exams;
DROP TABLE IF EXISTS tracer_education;
DROP TABLE IF EXISTS tracer_drafts;
DROP TABLE IF EXISTS tracer_form;
DROP TABLE IF EXISTS graduate_tracer;
DROP TABLE IF EXISTS tracer_responses;
DROP TABLE IF EXISTS event_comments;
DROP TABLE IF EXISTS event_registrations;
DROP TABLE IF EXISTS donations;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS alumni_profiles;
DROP TABLE IF EXISTS engagement_logs;
DROP TABLE IF EXISTS event_participations;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    student_id VARCHAR(50) UNIQUE,
    course VARCHAR(255),
    batch VARCHAR(10),
    contact_number VARCHAR(50),
    photo LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id VARCHAR(36) PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    archived TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (school_year_id) REFERENCES officer_school_year(id) ON DELETE CASCADE,
    FOREIGN KEY (alumni_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_officers_school_year (school_year_id, display_order),
    INDEX idx_officers_alumni (alumni_id),
    INDEX idx_officers_position (position)
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
    opens_at DATETIME DEFAULT NULL,
    closes_at DATETIME DEFAULT NULL,
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

CREATE TABLE IF NOT EXISTS survey_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL,
    question_id INT NOT NULL,
    respondent_id VARCHAR(36) DEFAULT NULL,
    event_registration_id INT DEFAULT NULL,
    answer_text TEXT,
    answer_value VARCHAR(255),
    answer_json JSON DEFAULT NULL,
    rating_value DECIMAL(5,2) DEFAULT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
