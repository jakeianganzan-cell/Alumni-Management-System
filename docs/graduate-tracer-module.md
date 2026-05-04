# Graduate Tracer Module Deployment Guide

## Scope

This module adds:

- alumni draft/save/submit graduate tracer flow
- completed-form locking with admin reopen support
- accomplished CHED export endpoints for `pdf` and `docx`
- admin analytics, batch export, and CSV/Excel/printable report export
- normalized tracer child tables plus audit/report tables

## Database

1. Run `server/schema.sql` against the `ustp_alumni` database for a clean install.
2. For an existing database, start the backend once. The tracer controller creates missing tracer tables and columns at runtime.
3. Legacy `graduate_tracer` rows are copied into `tracer_form` when `tracer_form` is empty for that user.

## Backend

1. Start the API from `server/` with `npm run dev`.
2. Required environment assumptions:
   - MySQL available at `localhost`
   - database `ustp_alumni`
   - local Chrome or Edge installed for Puppeteer PDF rendering
   - Word COM automation available only if you still want backend-generated `docx`
3. Main tracer endpoints:
   - `GET /api/tracer`
   - `PUT /api/tracer/draft`
   - `POST /api/tracer/submit`
   - `GET /api/tracer/export/me?format=pdf`
   - `GET /api/admin/tracer/:id/pdf`
   - `GET /api/tracer/admin/records`
   - `GET /api/tracer/admin/analytics`
   - `POST /api/tracer/admin/:userId/reopen`
   - `GET /api/tracer/admin/export/:userId`
   - `GET /api/tracer/admin/export/all`
   - `GET /api/tracer/admin/reports/export?format=csv|excel|pdf`

## Frontend

1. Start the Vite app from the repo root with `npm run dev`.
2. Alumni users are redirected to `/alumni/tracer` until they submit the tracer form.
3. Admin users manage tracer operations at `/admin/tracer`.

## Export Notes

- PDF exports now render an HTML tracer form through Puppeteer, so the downloaded PDF is based on saved tracer data instead of direct DOCX text replacement.
- The exact admin PDF download route is `GET /api/admin/tracer/:id/pdf`.
- DOCX exports still use `server/templates/CHED-Graduate-Tracer-Study.docx` plus `server/scripts/fill-tracer-template.ps1`.
- Printable analytics "PDF" export is an HTML print view intended for browser `Print to PDF`.
