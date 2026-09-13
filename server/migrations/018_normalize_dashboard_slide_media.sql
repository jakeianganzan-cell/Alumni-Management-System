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
    INDEX idx_dashboard_slides_visible (status, is_highlighted, display_order),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE dashboard_slides
    ADD COLUMN media_type VARCHAR(30) NOT NULL DEFAULT 'image' AFTER caption;

UPDATE dashboard_slides
SET media_type = CASE
    WHEN image_url REGEXP 'youtube\\.com|youtu\\.be' THEN 'youtube'
    WHEN image_url REGEXP '\\.(mp4|webm|ogg|mov)(\\?.*)?$'
         OR image_url LIKE 'data:video/%' THEN 'video'
    ELSE 'image'
END
WHERE COALESCE(media_type, '') = ''
   OR (
       media_type = 'image'
       AND (
           image_url REGEXP 'youtube\\.com|youtu\\.be'
           OR image_url REGEXP '\\.(mp4|webm|ogg|mov)(\\?.*)?$'
           OR image_url LIKE 'data:video/%'
       )
   );
