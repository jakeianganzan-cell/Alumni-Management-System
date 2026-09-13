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

test("automated tests can connect only to clearly named disposable databases", async () => {
  const { assertDatabaseEnvironment, getApplicationEnvironment } = await import("../environment-policy.mjs");
  const serverEnvExample = read("server/.env.example");
  const baseEnvironment = {
    NODE_ENV: "test",
    APP_ENV: "test",
    DB_ENVIRONMENT: "test",
    DB_HOST: "127.0.0.1",
  };

  assert.equal(getApplicationEnvironment({ NODE_ENV: "test" }), "test");

  for (const databaseName of ["alumni_management", "alumni_production", "ustp_alumni"]) {
    assert.throws(
      () => assertDatabaseEnvironment({ ...baseEnvironment, DB_NAME: databaseName }),
      /Unsafe test database detected\. Automated tests cannot use the production database\./,
    );
  }

  for (const databaseName of ["alumni_management_test", "alumni_management_ci", "alumni_management_staging"]) {
    assert.doesNotThrow(() => assertDatabaseEnvironment({ ...baseEnvironment, DB_NAME: databaseName }));
  }

  assert.match(serverEnvExample, /NODE_ENV=test[\s\S]{0,80}_test[\s\S]{0,40}_ci[\s\S]{0,40}_staging/);
});

test("public and API health endpoints remain available without exposing credentials", () => {
  const app = read("server/app.ts");

  assert.match(app, /app\.get\("\/health"[\s\S]{0,140}status:\s*"ok"/);
  assert.match(app, /app\.get\("\/api\/health"/);
  assert.doesNotMatch(app.slice(app.indexOf('app.get("/health"'), app.indexOf('if (process.env.ENABLE_TEST_ROUTE')), /DB_PASSWORD|JWT_SECRET/);
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
    "017_graduation_batches.sql",
  ]);
});

test("graduation batches centralize BOR data and backfill existing alumni", () => {
  const migration = read("server/migrations/017_graduation_batches.sql");
  const schema = read("server/schema.sql");
  const app = read("server/app.ts");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS graduation_batches/);
  assert.match(migration, /ADD COLUMN graduation_batch_id BIGINT NULL/);
  assert.match(migration, /FOREIGN KEY \(graduation_batch_id\) REFERENCES graduation_batches\(id\)/);
  assert.match(migration, /source_profile\.academic_year/);
  assert.match(migration, /source_profile\.graduation_batch/);
  assert.match(migration, /UPDATE profiles p[\s\S]*SET p\.graduation_batch_id = gb\.id/);
  assert.match(schema, /DROP TABLE IF EXISTS graduation_batches/);
  assert.match(app, /LEFT JOIN graduation_batches gb ON gb\.id = p\.graduation_batch_id/);
  assert.match(app, /graduationBatchId: Number\(selectedGraduationBatch\.id\)/);
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
    /app\.get\("\/api\/graduation-batches",\s*authenticateToken,\s*requirePermission\("alumni\.view"\)/,
    /app\.post\("\/api\/graduation-batches",\s*authenticateToken,\s*requirePermission\("alumni\.edit"\)/,
    /app\.put\("\/api\/graduation-batches\/:id",\s*authenticateToken,\s*requirePermission\("alumni\.edit"\)/,
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

test("user-submitted files retain signature and macro validation", () => {
  const app = read("server/app.ts");
  const fileUpload = read("server/utils/fileUpload.ts");
  const imageOptimizer = read("server/utils/imageOptimizer.ts");

  assert.match(imageOptimizer, /hasValidFileSignature\(buffer, mimeType\)/);
  assert.match(fileUpload, /assertValidFileContents\(buffer, mimeType\)/);
  assert.match(fileUpload, /vbaProject\\\.bin/);
  assert.match(fileUpload, /OPENXML_PACKAGE_MARKER_BY_MIME/);
  assert.match(app, /const normalizeSubmittedEvidence[\s\S]{0,500}parseDataUrlUpload\(dataUrl, maxBytes\)/);
  assert.match(app, /assertValidFileContents\([\s\S]{0,200}spreadsheetml\.sheet/);
  assert.match(app, /normalizeSubmittedMedia\(image_url\)/);
  assert.match(app, /normalizeSubmittedMedia\(proofImage\)/);
  assert.match(app, /normalizeSubmittedMedia\(photo\)/);
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

test("authentication and session lifecycle controls remain wired end to end", () => {
  const app = read("server/app.ts");
  const auth = read("server/middleware/auth.ts");
  const authHook = read("src/hooks/useAuth.tsx");
  const edgeSmoke = read("server/scripts/edge-smoke-api.mjs");

  assert.match(app, /app\.post\("\/api\/auth\/login",\s*loginAccountRateLimiter/);
  assert.match(app, /verifyLoginPassword\(normalizedPassword, user\.password_hash\)/);
  assert.match(app, /Invalid credentials\./);
  assert.match(app, /app\.post\("\/api\/auth\/select-role",\s*authRateLimiter/);
  assert.match(app, /isRoleAssigned\(roles, selectedRole\)/);
  assert.match(app, /isRoleAssigned\(liveRoles, selectedRole\)/);
  assert.match(app, /app\.post\("\/api\/auth\/logout",\s*authenticateToken/);
  assert.match(app, /UPDATE user_sessions SET status = 'Ended'/);
  assert.match(auth, /err\.name === "TokenExpiredError"/);
  assert.match(auth, /await endExpiredSession\(token\)/);
  assert.match(auth, /Session ended/);
  assert.match(authHook, /await fetch\(`\$\{API_URL\}\/auth\/logout`/);
  assert.match(authHook, /clearAuthToken\(\);[\s\S]{0,100}clearAuthState\(\);/);

  for (const check of [
    "valid admin login",
    "wrong password",
    "multiple-device primary session",
    "logout ends only the selected session",
    "terminated session is denied",
    "expired JWT",
    "role-based alumni login",
    "role-based chairman login",
    "missing token",
    "malformed token",
    "malformed import exposed an unsafe or missing public error",
  ]) {
    assert.match(edgeSmoke, new RegExp(check.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
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

test("announcements, events, and surveys archive when their configured end time arrives", () => {
  const app = read("server/app.ts");
  const adminAnnouncements = read("src/pages/admin/Announcements.tsx");
  const surveyStudio = read("src/components/admin/SurveyStudio.tsx");
  const archiveJob = app.slice(
    app.indexOf("const autoArchiveExpiredContent"),
    app.indexOf("const normalizeEventRsvpStatus"),
  );

  assert.doesNotMatch(archiveJob, /DATE_ADD\(end_datetime, INTERVAL 7 DAY\)/);
  assert.doesNotMatch(archiveJob, /type, 'announcement'.*<> 'announcement'/s);
  assert.equal((archiveJob.match(/COALESCE\(end_datetime,[^\n]+\) <= \?/g) || []).length, 3);
  assert.match(app, /end && now\.getTime\(\) >= end\.getTime\(\)[\s\S]{0,80}computedStatus = "Archived"/);
  assert.match(app, /setInterval\(run, 30 \* 1000\)/);
  assert.match(adminAnnouncements, /refetchInterval:\s*15_000/);
  assert.match(adminAnnouncements, /function contentUsesDuration\([^)]*\)\s*\{\s*return true;/);
  assert.match(surveyStudio, /setInterval\([\s\S]{0,120}loadSurveys\(false\)[\s\S]{0,80}15_000/);
});

test("Graduate Tracer validation and end-to-end test controls stay connected", () => {
  const controller = read("server/controllers/tracer.controller.ts");
  const tracerForm = read("src/components/alumni/TracerForm.tsx");
  const tracerApiTests = read("src/test/tracer-form-api.test.tsx");
  const browserSmoke = read("server/scripts/browser-smoke.mjs");
  const tracerSmoke = read("server/scripts/tracer-smoke-api.mjs");
  const verificationGuide = read("docs/graduate-tracer-verification.md");
  const ci = read(".github/workflows/ci.yml");

  assert.match(controller, /validateTracerPayload\(payload\)/);
  assert.match(controller, /status\(400\)\.json\([\s\S]{0,180}fields: validationErrors/);
  assert.match(controller, /p\.name LIKE \? OR p\.email LIKE \? OR p\.student_id LIKE \?/);
  assert.match(controller, /beginTransaction\(\)[\s\S]*syncChildRows\([\s\S]*DELETE FROM tracer_drafts[\s\S]*commit\(\)/);
  assert.match(tracerForm, /selectTracerFormPayload\(envelope\?\.submission, envelope\?\.draft\)/);
  assert.match(tracerForm, /getServerTracerErrors\(error\)[\s\S]{0,350}setErrors/);
  assert.match(tracerApiTests, /populates a server draft and saves the current form through the draft API/);
  assert.match(tracerApiTests, /shows structured server validation beside the rejected field/);
  assert.match(browserSmoke, /\/alumni\/tracer[\s\S]{0,250}checkLayout\("mobile alumni tracer form"\)/);
  assert.match(tracerSmoke, /assertNonProductionOperation\("Graduate Tracer workflow smoke test"\)/);
  assert.match(tracerSmoke, /"\/health"/);
  assert.match(tracerSmoke, /reject invalid final submission/);
  assert.match(tracerSmoke, /reject malformed tracer payload/);
  assert.match(tracerSmoke, /deny Alumni access to Admin tracer records/);
  assert.match(tracerSmoke, /saved tracer payload did not match/);
  assert.match(tracerSmoke, /submitted_at was not populated/);
  assert.match(tracerSmoke, /tracer training child rows were not saved/);
  assert.match(tracerSmoke, /tracer employment child record was not saved/);
  assert.match(tracerSmoke, /retrieve completed Alumni tracer/);
  assert.match(tracerSmoke, /Admin tracer detail/);
  assert.match(tracerSmoke, /Alumni PDF download/);
  assert.match(tracerSmoke, /Admin PDF download/);
  assert.match(tracerSmoke, /submitted tracer was not visible to Admin/);
  assert.match(tracerSmoke, /response was empty or was not a PDF file/);
  assert.match(tracerSmoke, /Graduate Tracer smoke checks passed: validation, drafts, submission, database rows, Admin viewing, and PDF output\./);
  assert.match(verificationGuide, /100% Verified/);
  assert.match(verificationGuide, /Physical phone verification/);
  assert.match(ci, /NODE_ENV:\s*test/);
  assert.match(ci, /DB_NAME:\s*ustp_alumni_ci/);
  assert.match(ci, /Smoke test Graduate Tracer workflow[\s\S]{0,120}npm run smoke:tracer/);
});
