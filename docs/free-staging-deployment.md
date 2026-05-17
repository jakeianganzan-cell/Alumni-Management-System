# Free Staging Deployment Guide

Project: Alumni Management System Incorporating Engagement Metrics and Contribution Analysis for Salay Community College

Target staging stack:

- Frontend: Vercel, Vite static build
- Backend: Render web service, Express API
- Database: Aiven MySQL or Clever Cloud MySQL
- Email: Brevo transactional email API

## What Was Prepared

- Frontend API base now supports `VITE_API_URL`.
- Vite dev proxy now points to `VITE_API_PROXY_TARGET`, `VITE_API_URL`, or local `http://localhost:5000`.
- Backend now uses `process.env.PORT || 5000`.
- Backend CORS now allows only configured frontend origins, plus local development origins.
- Backend has `/api/health` for Render health checks.
- Old `/api/test` route is disabled unless `ENABLE_TEST_ROUTE=true`.
- Admin setup route is disabled unless `ENABLE_SETUP_ADMIN=true`.
- MySQL connections, seed script, init script, and migration script now support cloud DB env vars and SSL.
- `vercel.json`, `render.yaml`, `.env.example`, and `server/.env.example` are included.

## Local Verification Commands

Run from the project root:

```powershell
npm install
npm run build
```

Run backend checks:

```powershell
cd server
npm install
npm run build
npm start
```

In another terminal:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

## Required Environment Variables

Frontend on Vercel:

```env
VITE_API_URL=https://your-render-service.onrender.com
```

Backend on Render:

```env
NODE_ENV=production
HOST=0.0.0.0
FRONTEND_URL=https://your-vercel-site.vercel.app
APP_BASE_URL=https://your-render-service.onrender.com
ALLOWED_ORIGINS=https://your-vercel-site.vercel.app

DB_HOST=your-cloud-mysql-host
DB_PORT=your-cloud-mysql-port
DB_USER=your-cloud-mysql-user
DB_PASSWORD=your-cloud-mysql-password
DB_NAME=your-cloud-mysql-database
DB_SSL=true
DB_SSL_CA=optional-ca-certificate-text
DB_SSL_REJECT_UNAUTHORIZED=true

JWT_SECRET=generate-a-long-random-secret
ENABLE_SETUP_ADMIN=false
ENABLE_TEST_ROUTE=false

BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=Salay Community College
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
```

Do not commit real `.env` values.

## Database Backup and Import

Export local MySQL:

```powershell
mysqldump -h localhost -P 3306 -u root -p --databases ustp_alumni --routines --triggers --events > ustp_alumni_backup.sql
```

Import to cloud MySQL:

```powershell
mysql -h YOUR_DB_HOST -P YOUR_DB_PORT -u YOUR_DB_USER -p YOUR_DB_NAME --ssl-mode=REQUIRED < ustp_alumni_backup.sql
```

For a clean staging database with sample data:

```powershell
cd server
npm run seed
```

Only run `npm run seed` on a staging database you are willing to reset, because the seed script clears and recreates the demo data set.

## Vercel Frontend Setup

1. Push the repository to GitHub.
2. Create a Vercel project from the GitHub repository.
3. Use these settings:
   - Framework Preset: Vite
   - Root Directory: project root
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Add environment variable:
   - `VITE_API_URL=https://your-render-service.onrender.com`
5. Deploy.

`vercel.json` keeps React Router pages working after refresh by rewriting all paths to `index.html`.

## Render Backend Setup

1. Create a new Render Web Service from the same GitHub repository.
2. Use these settings:
   - Root Directory: `server`
   - Runtime: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
3. Add all backend environment variables listed above.
4. Deploy.
5. Verify:

```powershell
Invoke-RestMethod https://your-render-service.onrender.com/api/health
```

## GitHub Upload Process

```powershell
git status
git add .
git commit -m "Prepare staging deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

If the remote already exists:

```powershell
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

## Deployment-Ready Project Structure

```text
PROJECT - Copy/
  src/                    React/Vite frontend pages, layouts, hooks, API helper
  public/                 Static frontend assets
  server/                 Express API, MySQL access, routes, services, PDF/email utilities
    controllers/          Graduate tracer and export controllers
    middleware/           Authentication middleware
    routes/               Route modules
    services/             Brevo email service
    sql/                  Additive SQL scripts
    schema.sql            Full schema reset script for clean staging databases
    seed.ts               Sample data seeding script
    app.ts                Express app and API routes
    index.ts              Render entry point
  docs/                   Project and deployment documentation
  vercel.json             Vercel SPA routing/build configuration
  render.yaml             Render backend blueprint
  .env.example            Frontend env template
  package.json            Frontend dependencies and build scripts
```

## Staging Test Checklist

After both deployments are online:

- Open the Vercel URL on desktop and mobile.
- Log in as admin.
- Log in as alumni.
- Open admin dashboard charts and engagement metrics.
- Open alumni dashboard.
- Create, edit, archive, and restore announcements/events/surveys.
- Submit a survey response.
- Submit or preview Graduate Tracer data.
- Test admin tracer PDF preview and download.
- Test donations and contribution analytics.
- Test account settings and password change.
- Test alumni import preview and final import.
- Send a test Brevo email to a real inbox.
- Refresh `/admin`, `/admin/engagement`, `/alumni`, `/alumni/tracer`, and `/chairman`.
- Check browser console for CORS or failed API requests.

## Troubleshooting

- CORS error: set `FRONTEND_URL` and `ALLOWED_ORIGINS` on Render to the exact Vercel URL.
- Frontend cannot connect: set `VITE_API_URL` on Vercel to the Render backend root URL, not `/api`.
- Render port error: do not hardcode a port in Render. The server reads `process.env.PORT`.
- Database connection refused: verify DB host, port, username, password, database name, and SSL setting.
- Aiven SSL failure: copy the CA certificate text into `DB_SSL_CA`, preserving line breaks or using escaped `\n`.
- PDF generation failure: keep the server `postinstall` script that installs Puppeteer Chrome, redeploy with a cleared Render build cache, and set `PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer`.
- Emails show success but inbox is empty: check Brevo transactional logs, sender verification, and spam folder.
- Page refresh 404 on Vercel: confirm `vercel.json` is deployed from the project root.

## Production Improvements Before Final Release

- Replace default local admin/bootstrap credentials with controlled production onboarding.
- Rotate `JWT_SECRET` before production.
- Move uploaded media to persistent object storage if the system later stores files on disk.
- Add automated API smoke tests for auth, dashboard, tracer export, and email queue.
- Add database migration tooling for future schema changes instead of running broad SQL scripts manually.
- Add monitoring for Render uptime, Brevo failures, and MySQL connection saturation.

## References Checked

- Vercel Vite SPA deployment and rewrites: https://vercel.com/docs/frameworks/frontend/vite
- Render Web Services build/start settings: https://render.com/docs/web-services
- Render health checks: https://render.com/docs/health-checks
- Aiven MySQL migration/import: https://aiven.io/docs/products/mysql/howto/migrate-db-to-aiven-via-console
- Aiven MySQL CLI connection parameters: https://aiven.io/docs/products/mysql/howto/connect-from-cli
