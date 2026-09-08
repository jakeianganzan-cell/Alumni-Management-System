import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const serverRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(serverRoot, "..");

const read = (relativePath) => fs.readFileSync(path.resolve(projectRoot, relativePath), "utf8");

test("runtime schema sync is configurable and documented", () => {
  const config = read("server/config.ts");
  const serverEnvExample = read("server/.env.example");

  assert.match(config, /runtimeSchemaSyncEnabled:\s*process\.env\.RUNTIME_SCHEMA_SYNC\s*!==\s*"false"/);
  assert.match(serverEnvExample, /RUNTIME_SCHEMA_SYNC=/);
});

test("root env example is frontend-only", () => {
  const envExample = read(".env.example");

  assert.match(envExample, /VITE_API_BASE_URL=/);
  assert.doesNotMatch(envExample, /JWT_SECRET=/);
  assert.doesNotMatch(envExample, /DB_PASSWORD=/);
  assert.doesNotMatch(envExample, /ADMIN_PASSWORD=/);
});

test("Render production installs include compression declarations", () => {
  const packageJson = JSON.parse(read("server/package.json"));
  const packageLock = JSON.parse(read("server/package-lock.json"));

  assert.equal(packageJson.dependencies?.["@types/compression"], "^1.8.1");
  assert.equal(packageJson.devDependencies?.["@types/compression"], undefined);
  assert.equal(packageLock.packages?.[""]?.dependencies?.["@types/compression"], "^1.8.1");
  assert.notEqual(packageLock.packages?.["node_modules/@types/compression"]?.dev, true);
});

test("deployed security policies allow the configured Google Maps embed", () => {
  const vercel = read("vercel.json");
  const security = read("server/middleware/security.ts");

  for (const source of ["https://www.google.com", "https://maps.google.com"]) {
    assert.match(vercel, new RegExp(source.replaceAll(".", "\\.")));
    assert.match(security, new RegExp(source.replaceAll(".", "\\.")));
  }
});

test("development, staging, and production configuration stay separated", () => {
  const envLoader = read("server/env.ts");
  const migrationRunner = read("server/run-migration.mjs");
  const environmentPolicy = read("server/environment-policy.mjs");
  const render = read("render.yaml");
  const backupWorkflow = read(".github/workflows/database-backup.yml");
  const seed = read("server/seed.ts");

  assert.doesNotMatch(envLoader, /\.\.\/\.env/);
  assert.match(envLoader, /SKIP_DOTENV\s*!==\s*"true"/);
  assert.doesNotMatch(migrationRunner, /\.\.\/\.env/);
  assert.match(migrationRunner, /SKIP_DOTENV\s*!==\s*"true"/);
  assert.match(environmentPolicy, /DB_ENVIRONMENT/);
  assert.match(environmentPolicy, /Production cannot use a local database host/);
  assert.match(render, /name:\s*alumni-management-api-staging/);
  assert.match(render, /key:\s*APP_ENV[\s\S]*value:\s*staging/);
  assert.match(render, /key:\s*DB_ENVIRONMENT[\s\S]*value:\s*staging/);
  assert.match(backupWorkflow, /environment:\s*production-backup/);
  assert.match(seed, /assertNonProductionOperation\("Database seeding"\)/);
});

test("retired President login cannot be recreated by runtime configuration", () => {
  const config = read("server/config.ts");
  const checkEnv = read("server/scripts/check-env.mjs");

  assert.match(config, /The President login has been retired/);
  assert.match(checkEnv, /retiredAdminEmail/);
});

test("migration runner records applied checksums", () => {
  const runner = read("server/run-migration.mjs");

  assert.match(runner, /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.match(runner, /crypto\.createHash\("sha256"\)/);
  assert.match(runner, /Migration checksum changed after apply/);
  assert.match(runner, /file === "001_initial_schema\.sql"/);
  assert.match(runner, /isIgnorableLegacyEventsError/);
  assert.match(runner, /003_add_announcement_columns\.sql/);
  assert.match(runner, /\^ALTER TABLE events/);
  assert.match(runner, /INSERT INTO schema_migrations/);
});

test("critical migration files exist in order", () => {
  const migrationsDir = path.resolve(serverRoot, "migrations");
  const files = fs.readdirSync(migrationsDir).filter((file) => /^\d+_.+\.sql$/i.test(file)).sort();

  assert.deepEqual(files, [
    "001_initial_schema.sql",
    "002_add_profile_columns.sql",
    "003_add_announcement_columns.sql",
    "004_create_supporting_tables.sql",
    "005_covering_indexes.sql",
    "006_expand_about_us.sql",
    "007_about_staff_and_service_items.sql",
    "008_add_donation_anonymity.sql",
    "009_add_walk_in_donation_fields.sql",
    "010_add_google_link.sql",
    "011_database_integrity_hardening.sql",
    "012_expand_donations_to_contributions.sql",
    "013_normalize_contribution_categories.sql",
    "014_contribution_opportunities_and_submissions.sql",
    "015_president_organizational_governance.sql",
    "016_retire_president_access.sql",
  ]);
});

test("local env files are ignored by git rules", () => {
  const gitignore = read(".gitignore");

  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!server\/\.env\.example$/m);
});

test("high-risk routes retain authentication and role gates", () => {
  const app = read("server/app.ts");
  const security = read("server/middleware/security.ts");
  const tracerController = read("server/controllers/tracer.controller.ts");
  const requiredPatterns = [
    /app\.post\("\/api\/auth\/login",\s*loginAccountRateLimiter/,
    /app\.get\("\/api\/profiles",\s*authenticateToken,\s*requirePermission\("alumni\.view"\)/,
    /app\.post\("\/api\/profiles",\s*authenticateToken,\s*requirePermission\("alumni\.edit"\)/,
    /app\.get\("\/api\/admin\/sessions",\s*authenticateToken,\s*requireAdmin/,
    /app\.get\("\/api\/donations",\s*authenticateToken,\s*requirePermission\("donations\.view"\)/,
    /app\.get\("\/api\/contributions\/analytics",\s*authenticateToken,\s*requirePermission\("donations\.view"\)/,
    /app\.get\("\/api\/alumni\/donations",\s*authenticateToken/,
    /app\.get\("\/api\/alumni\/contribution-submissions",\s*authenticateToken/,
    /app\.post\("\/api\/contribution-opportunities\/:id\/submissions",\s*authenticateToken/,
    /app\.patch\("\/api\/contribution-submissions\/:id\/withdraw",\s*authenticateToken/,
    /app\.get\("\/api\/admin\/contribution-submissions",\s*authenticateToken,\s*requirePermission\("donations\.view"\)/,
    /app\.patch\("\/api\/admin\/contribution-submissions\/:id\/status",\s*authenticateToken,\s*requirePermission\("donations\.verify"\)/,
    /app\.post\("\/api\/donations",\s*authenticateToken/,
    /app\.post\("\/api\/admin\/donations\/walk-in",\s*authenticateToken,\s*requirePermission\("donations\.verify"\)/,
    /app\.post\("\/api\/settings\/donation",\s*authenticateToken,\s*requireAdmin/,
    /app\.post\("\/api\/admin\/system-settings\/upload",\s*authenticateToken,\s*requireAdmin,\s*importRateLimiter/,
    /app\.get\("\/api\/admin\/about\/:contentType",\s*authenticateToken,\s*requireAdmin/,
    /app\.post\("\/api\/admin\/about\/:contentType",\s*authenticateToken,\s*requireAdmin/,
    /app\.put\("\/api\/admin\/about\/:contentType\/:id",\s*authenticateToken,\s*requireAdmin/,
    /app\.delete\("\/api\/admin\/about\/:contentType\/:id",\s*authenticateToken,\s*requireAdmin/,
    /app\.get\("\/api\/admin\/about\/services\/:serviceId\/items",\s*authenticateToken,\s*requireAdmin/,
    /app\.post\("\/api\/admin\/about\/services\/:serviceId\/items",\s*authenticateToken,\s*requireAdmin/,
    /app\.put\("\/api\/admin\/about\/services\/:serviceId\/items\/:itemId",\s*authenticateToken,\s*requireAdmin/,
    /app\.delete\("\/api\/admin\/about\/services\/:serviceId\/items\/:itemId",\s*authenticateToken,\s*requireAdmin/,
  ];

  for (const pattern of requiredPatterns) {
    assert.match(app, pattern);
  }
  assert.doesNotMatch(app, /registerPresidentRoutes/);
  assert.match(app, /AND role <> 'president'/);
  assert.match(app, /getRoleForUser\(req\.user\.id, req\.user\.role\)/);
  assert.match(security, /keyGenerator:\s*identifierKey/);
  assert.match(tracerController, /requireTracerAdmin\(req\.user\.role\)/);
});

test("new logins create additive browser sessions", () => {
  const app = read("server/app.ts");
  const start = app.indexOf("const createAuthenticatedSession");
  const end = app.indexOf("const normalizeInterestStatus", start);
  const createSession = app.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(createSession, /INSERT INTO user_sessions/);
  assert.doesNotMatch(createSession, /(?:UPDATE|DELETE FROM) user_sessions/);
});

test("production 500 responses do not use raw exception messages", () => {
  const app = read("server/app.ts");
  const rbac = read("server/middleware/rbac.ts");
  const errorHandler = read("server/middleware/errorHandler.ts");

  assert.doesNotMatch(app, /res\.status\(500\).*getErrorMessage/);
  assert.doesNotMatch(app, /res\.status\((?:400|500)\).*json\(\{ error: getErrorMessage/);
  assert.doesNotMatch(rbac, /res\.status\(500\).*getErrorMessage/);
  assert.doesNotMatch(errorHandler, /stack:\s*err\.stack/);
  assert.doesNotMatch(errorHandler, /status\(500\)[\s\S]{0,200}error:\s*err\.message/);
  assert.match(app, /getPublicErrorMessage/);
});

test("session-store failures deny access instead of failing open", () => {
  const auth = read("server/middleware/auth.ts");

  assert.match(auth, /return "unavailable"/);
  assert.match(auth, /status\(503\)/);
  assert.doesNotMatch(auth, /catch\s*\{\s*return true/);
});

test("local account notes are excluded from commits", () => {
  const gitignore = read(".gitignore");

  assert.match(gitignore, /^Accounts\.md$/m);
});

test("database backups are encrypted, scheduled, and restored only into a disposable target", () => {
  const backup = read("server/scripts/backup-database.mjs");
  const restore = read("server/scripts/restore-database.mjs");
  const workflow = read(".github/workflows/database-backup.yml");
  const recovery = read("server/RECOVERY.md");

  assert.match(backup, /aes-256-gcm/);
  assert.match(backup, /createGzip/);
  assert.match(backup, /sha256/);
  assert.doesNotMatch(backup, /--password=/);
  assert.match(restore, /ALLOW_DATABASE_RESTORE/);
  assert.match(restore, /target matches the configured source database/);
  assert.match(restore, /target database is not empty/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /retention-days:\s*30/);
  assert.match(recovery, /quarterly/i);
  assert.match(recovery, /never restore over/i);
});
