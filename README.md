# USTP Alumni Portal - Unified Announcements & Surveys

## Quick Start (Updated for Backend API)

```bash
# Install root deps + server deps
npm install
cd server && npm install && cd ..

# Dev (frontend 8080 + API 3001)
npm run dev

# Build (production)
npm run build
```

## Architecture

**Frontend**: Vite + React 18 + TypeScript + Tailwind + shadcn/ui + React Router
**Backend API**: Express (server/index.ts) → SQLite (database/db.js + schema.sql)
**Proxy**: Vite proxies /api → localhost:3001

## API Endpoints (/api) - Refactored for Announcements
- GET /announcements?status=upcoming&limit=10
- GET /announcements/:id ( + /rsvps, /comments, /metrics)
- POST /announcements (create)
- POST /announcements/:id/rsvp, /comments
- GET /announcements/recommendations/:alumniId
- POST /alumni/:alumniId/contribution
- GET /engagement (admin), /health

## Database
SQLite `database/alumni.db` auto-created from schema.sql.
Sample events included.

## Scripts
- `npm run dev` → concurrent server + frontend
- `npm run dev:frontend` → Vite only (API separate)
- `npm run dev:server` → API only (cd server && npm run dev)

## Troubleshooting
- API not starting? `cd server && npm i && npm run dev`
- Build errors? All direct db imports removed.
- DB empty? Restart server (schema auto-runs).

Enjoy the fixed build! 🎉
