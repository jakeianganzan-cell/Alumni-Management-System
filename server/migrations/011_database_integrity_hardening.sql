DELETE n
FROM user_notifications n
LEFT JOIN users u ON u.id = n.user_id
WHERE u.id IS NULL;

UPDATE user_notifications n
LEFT JOIN users actor ON actor.id = n.actor_id
SET n.actor_id = NULL
WHERE n.actor_id IS NOT NULL
  AND actor.id IS NULL;

ALTER TABLE user_notifications
    ADD CONSTRAINT fk_user_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_notifications
    ADD CONSTRAINT fk_user_notifications_actor
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE email_queue
    ADD CONSTRAINT fk_email_queue_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE donations
    ADD CONSTRAINT chk_donations_amount_positive CHECK (amount > 0);

ALTER TABLE alumni_fee_types
    ADD CONSTRAINT chk_alumni_fee_types_amount_positive CHECK (amount > 0);

ALTER TABLE alumni_fee_payments
    ADD CONSTRAINT chk_alumni_fee_payments_amount_positive CHECK (amount_paid > 0);

ALTER TABLE alumni_projects
    ADD CONSTRAINT chk_alumni_projects_date_range
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date);

CREATE INDEX idx_user_notifications_user_created
    ON user_notifications (user_id, created_at);

CREATE INDEX idx_user_sessions_status_activity
    ON user_sessions (status, last_activity);
