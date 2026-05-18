Update the Alumni Management System with the following features and improvements:

## 1. Alumni Records – Import File Feature

Add an **Import Alumni Records** function inside Alumni Records Management.

### Requirements:

* Admin can upload **only one file at a time**.
* Accepted file types: CSV / Excel.
* Once uploaded, system scans and reads the file automatically.
* Extract only required fields:

  * Full Name
  * Graduation Year
  * Email Address
  * Contact Number
* Prevent duplicate uploads and email spam.
* After first file is completed/imported, admin can upload another file. 
* Validate rows before importing.
* Show preview before final import.
* Show success / failed rows summary.

### Purpose:

This is for importing past alumni records directly into database without manually encoding each alumni.

---

## 2. Remove Jobs Module Completely

Delete all job-related features from both Admin and Alumni side.

### Remove:

* Job Posting
* Job Applications
* Job Tables in database
* Job Navigation Menus
* Job API Routes
* Job Notifications
* Job Connections / References

System must be clean with no broken links.

---

## 3. Update `announcements.tsx`

Redesign announcement page.

### New Structure:

Do not separate:

* Survey
* Events

Instead combine all into one horizontal card layout.

### Card Types:

* Announcement
* Event
* Survey

Each card displays:

* Title
* Type Badge
* Short Description
* Date Posted

When clicked:
Open modal / detail page showing:

* Full content
* Event details
* Survey instructions
* Attached files/images if any

### Add Button:

Use only **one + Add button** for all content.

When admin clicks Add:
Form includes Type Selector:

* Announcement
* Event
* Survey

Then dynamic fields based on selected type.

---

## 4. Officer Management Upgrade

### Add Officers in Bundle

Allow admin to add multiple officers in one submission.

Example:
School Year: 2025 - 2026

Then add:

* President
* Vice President
* Secretary
* Treasurer
* Auditor
* PIO
* Board Members

All saved in one submit.

### Archive by School Year

Show officer history by school year.

Example:

* 2023 - 2024
* 2024 - 2025
* 2025 - 2026

When clicked:
View all officers in that batch with:

* Full Name
* Position
* Course
* Year Graduated
* Contact Info
* Photo

---

## 5. UI / UX Redesign

Make overall system:

### Style:

* Elegant
* Modern
* Smooth Animations
* Professional University Theme
* Responsive Mobile + Desktop

### Improve:

* Better spacing
* Rounded cards
* Soft shadows
* Hover effects
* Loading skeletons
* Clean typography
* Better sidebar navigation
* Better tables
* Search + Filter tools
* Fast modal forms

### Theme Suggestion:

SaCC(Salay Community College)-inspired colors:

* Maroon
* White
* Gray

---

## 6. Database Updates

Create / Update tables for:

* imported_alumni_records
* announcements
* officers
* officer_school_year

Remove:

* jobs
* job_applications
* related foreign keys

---

## 7. Final Goal

System must feel like a premium real-world Alumni Management Platform:
Clean, fast, organized, modern, and easy for admin and alumni users.
