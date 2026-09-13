CREATE TABLE IF NOT EXISTS graduation_batches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_year INT NOT NULL,
    school_year VARCHAR(30) NOT NULL,
    board_resolution_no VARCHAR(100) NULL,
    graduation_date DATE NULL,
    document_url LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_graduation_batches_batch_year (batch_year)
);

ALTER TABLE profiles
    ADD COLUMN graduation_batch_id BIGINT NULL AFTER batch;

CREATE INDEX idx_profiles_graduation_batch ON profiles (graduation_batch_id);

ALTER TABLE profiles
    ADD CONSTRAINT fk_profiles_graduation_batch
    FOREIGN KEY (graduation_batch_id) REFERENCES graduation_batches(id)
    ON DELETE SET NULL;

INSERT INTO graduation_batches (batch_year, school_year, board_resolution_no)
SELECT
    p.inferred_batch_year,
    COALESCE(
        NULLIF(MAX(NULLIF(TRIM(p.academic_year), '')), ''),
        CONCAT(p.inferred_batch_year - 1, '–', p.inferred_batch_year)
    ),
    NULLIF(MAX(NULLIF(TRIM(p.bor_number), '')), '')
FROM (
    SELECT
        source_profile.*,
        CASE
            WHEN TRIM(COALESCE(source_profile.batch, '')) REGEXP '^[0-9]{4}$'
                THEN CAST(TRIM(source_profile.batch) AS UNSIGNED)
            WHEN TRIM(COALESCE(source_profile.academic_year, '')) REGEXP '[0-9]{4}$'
                THEN CAST(RIGHT(TRIM(source_profile.academic_year), 4) AS UNSIGNED)
            WHEN TRIM(COALESCE(source_profile.graduation_batch, '')) REGEXP '[0-9]{4}$'
                THEN CAST(RIGHT(TRIM(source_profile.graduation_batch), 4) AS UNSIGNED)
            ELSE NULL
        END AS inferred_batch_year
    FROM profiles source_profile
) p
WHERE p.inferred_batch_year BETWEEN 1900 AND 2100
GROUP BY p.inferred_batch_year
ON DUPLICATE KEY UPDATE
    school_year = COALESCE(NULLIF(graduation_batches.school_year, ''), VALUES(school_year)),
    board_resolution_no = COALESCE(NULLIF(graduation_batches.board_resolution_no, ''), VALUES(board_resolution_no));

UPDATE profiles p
INNER JOIN graduation_batches gb ON gb.batch_year = CASE
    WHEN TRIM(COALESCE(p.batch, '')) REGEXP '^[0-9]{4}$'
        THEN CAST(TRIM(p.batch) AS UNSIGNED)
    WHEN TRIM(COALESCE(p.academic_year, '')) REGEXP '[0-9]{4}$'
        THEN CAST(RIGHT(TRIM(p.academic_year), 4) AS UNSIGNED)
    WHEN TRIM(COALESCE(p.graduation_batch, '')) REGEXP '[0-9]{4}$'
        THEN CAST(RIGHT(TRIM(p.graduation_batch), 4) AS UNSIGNED)
    ELSE NULL
END
SET p.graduation_batch_id = gb.id
WHERE p.graduation_batch_id IS NULL;
