UPDATE user_sessions sessions
JOIN user_roles roles ON roles.user_id = sessions.user_id
SET sessions.status = 'Ended',
    sessions.logout_time = COALESCE(sessions.logout_time, NOW()),
    sessions.last_activity = NOW()
WHERE roles.role = 'president'
  AND sessions.status = 'Active';

UPDATE user_roles
SET archived = 1
WHERE role = 'president'
  AND COALESCE(archived, 0) = 0;

UPDATE users
SET email = 'system.admin@saccalumni.local'
WHERE LOWER(email) = 'admin.president@saccalumni.local';

UPDATE profiles
SET email = 'system.admin@saccalumni.local'
WHERE LOWER(email) = 'admin.president@saccalumni.local';

UPDATE admin_users
SET email = 'system.admin@saccalumni.local'
WHERE LOWER(email) = 'admin.president@saccalumni.local';
