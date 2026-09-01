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

test("migration runner records applied checksums", () => {
  const runner = read("server/run-migration.mjs");

  assert.match(runner, /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.match(runner, /crypto\.createHash\("sha256"\)/);
  assert.match(runner, /Migration checksum changed after apply/);
  assert.match(runner, /file === "001_initial_schema\.sql"/);
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
  const requiredPatterns = [
    /app\.post\("\/api\/auth\/login",\s*authRateLimiter/,
    /app\.get\("\/api\/profiles",\s*authenticateToken/,
    /app\.post\("\/api\/profiles",\s*authenticateToken,\s*requireAdmin/,
    /app\.get\("\/api\/admin\/sessions",\s*authenticateToken,\s*requireAdmin/,
    /app\.get\("\/api\/donations",\s*authenticateToken,\s*requireAdmin/,
    /app\.post\("\/api\/admin\/donations\/walk-in",\s*authenticateToken,\s*requireAdmin/,
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
});

test("production 500 responses do not use raw exception messages", () => {
  const app = read("server/app.ts");
  const rbac = read("server/middleware/rbac.ts");

  assert.doesNotMatch(app, /res\.status\(500\).*getErrorMessage/);
  assert.doesNotMatch(rbac, /res\.status\(500\).*getErrorMessage/);
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
