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

SET @allow_multiple_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'surveys'
      AND COLUMN_NAME = 'allow_multiple_responses'
);
SET @allow_multiple_sql = IF(
    @allow_multiple_exists = 0,
    'ALTER TABLE surveys ADD COLUMN allow_multiple_responses TINYINT(1) NOT NULL DEFAULT 0 AFTER is_anonymous',
    'SELECT ''surveys.allow_multiple_responses already exists'' AS migration_note'
);
PREPARE allow_multiple_stmt FROM @allow_multiple_sql;
EXECUTE allow_multiple_stmt;
DEALLOCATE PREPARE allow_multiple_stmt;

SET @survey_answer_response_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'survey_answers'
      AND COLUMN_NAME = 'response_id'
);
SET @survey_answer_response_sql = IF(
    @survey_answer_response_exists = 0,
    'ALTER TABLE survey_answers ADD COLUMN response_id INT DEFAULT NULL AFTER id',
    'SELECT ''survey_answers.response_id already exists'' AS migration_note'
);
PREPARE survey_answer_response_stmt FROM @survey_answer_response_sql;
EXECUTE survey_answer_response_stmt;
DEALLOCATE PREPARE survey_answer_response_stmt;

SET @survey_answer_updated_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'survey_answers'
      AND COLUMN_NAME = 'updated_at'
);
SET @survey_answer_updated_sql = IF(
    @survey_answer_updated_exists = 0,
    'ALTER TABLE survey_answers ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    'SELECT ''survey_answers.updated_at already exists'' AS migration_note'
);
PREPARE survey_answer_updated_stmt FROM @survey_answer_updated_sql;
EXECUTE survey_answer_updated_stmt;
DEALLOCATE PREPARE survey_answer_updated_stmt;

SET @survey_answer_response_fk_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_survey_answers_response'
);
SET @survey_answer_response_fk_sql = IF(
    @survey_answer_response_fk_exists = 0,
    'ALTER TABLE survey_answers ADD CONSTRAINT fk_survey_answers_response FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE',
    'SELECT ''fk_survey_answers_response already exists'' AS migration_note'
);
PREPARE survey_answer_response_fk_stmt FROM @survey_answer_response_fk_sql;
EXECUTE survey_answer_response_fk_stmt;
DEALLOCATE PREPARE survey_answer_response_fk_stmt;
