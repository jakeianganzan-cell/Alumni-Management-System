UPDATE donations
SET contribution_type = 'Project Support'
WHERE LOWER(TRIM(contribution_type)) IN ('project / program participation', 'project involvement');

UPDATE donations
SET contribution_type = 'Other Support'
WHERE LOWER(TRIM(contribution_type)) IN ('other', 'other contribution');
