import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import path from "node:path";
import { assertNonProductionOperation } from "../environment-policy.mjs";

if (process.env.SKIP_DOTENV !== "true") {
  dotenv.config({ path: path.resolve(import.meta.dirname, "..", ".env"), quiet: true });
}

assertNonProductionOperation("Edge-case API smoke tests");
const configuredDatabaseHost = String(process.env.DB_HOST || "127.0.0.1").trim().toLowerCase();
const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!localDatabaseHosts.has(configuredDatabaseHost) && !String(process.env.DB_ENVIRONMENT || "").trim()) {
  throw new Error("DB_ENVIRONMENT must explicitly identify a non-production remote database before edge smoke tests can run.");
}

const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:5107").replace(/\/+$/, "");
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const jwtSecret = process.env.JWT_SECRET;
const failures = [];
let passed = 0;

const request = async (method, route, options = {}) => {
  const isJson = options.body !== undefined;
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(isJson ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.rawBody ?? (isJson ? JSON.stringify(options.body) : undefined),
    duplex: options.rawBody instanceof Readable ? "half" : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 20_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
};

const expectStatus = async (label, method, route, expected, options = {}) => {
  try {
    const result = await request(method, route, options);
    const statuses = Array.isArray(expected) ? expected : [expected];
    if (!statuses.includes(result.response.status)) {
      failures.push(`${label}: expected ${statuses.join("/")}, received ${result.response.status}`);
    } else {
      passed += 1;
    }
    return result;
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const login = async (email, password, label) => {
  const result = await expectStatus(label, "POST", "/api/auth/login", 200, { body: { email, password } });
  if (!result) return "";
  if (!result.body?.requiresRoleSelection) return result.body?.token || "";
  const role = result.body.roles?.includes("admin") ? "admin" : result.body.roles?.[0];
  const selected = await expectStatus(`${label} role selection`, "POST", "/api/auth/select-role", 200, {
    body: { loginToken: result.body.loginToken, role },
  });
  return selected?.body?.token || "";
};

if (!adminEmail || !adminPassword || !jwtSecret || !process.env.DB_NAME) {
  throw new Error("Test admin credentials, JWT_SECRET, and DB_NAME are required.");
}

await expectStatus("health", "GET", "/api/health", 200);
await expectStatus("missing token", "GET", "/api/profiles", 401);
await expectStatus("malformed token", "GET", "/api/profiles", 403, { token: "not-a-valid-token" });

const adminToken = await login(adminEmail, adminPassword, "valid admin login");
if (!adminToken) failures.push("valid admin login did not return a token");

await expectStatus("empty login fields", "POST", "/api/auth/login", 401, { body: {} });
await expectStatus("wrong password", "POST", "/api/auth/login", 401, {
  body: { email: adminEmail, password: "DefinitelyWrongPassword123!" },
});

const additionalAdminToken = await login(adminEmail, adminPassword, "valid multiple-device admin login");
if (adminToken && additionalAdminToken) {
  await expectStatus("multiple-device primary session", "GET", "/api/auth/session", 200, { token: adminToken });
  await expectStatus("multiple-device additional session", "GET", "/api/auth/session", 200, { token: additionalAdminToken });
  await expectStatus("logout request", "POST", "/api/auth/logout", 200, { token: additionalAdminToken });
  await expectStatus("logout ends only the selected session", "GET", "/api/auth/session", 403, { token: additionalAdminToken });
  await expectStatus("primary session remains after other-device logout", "GET", "/api/auth/session", 200, { token: adminToken });
}

const terminatedAdminToken = await login(adminEmail, adminPassword, "valid session for termination");
if (adminToken && terminatedAdminToken) {
  const terminatedSessionToken = jwt.decode(terminatedAdminToken)?.sessionId;
  const terminationConnection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    ssl: false,
  });
  const [terminatedSessionRows] = await terminationConnection.execute(
    "SELECT id FROM user_sessions WHERE session_token = ? LIMIT 1",
    [terminatedSessionToken],
  );
  await terminationConnection.end();
  const terminatedSessionId = Array.isArray(terminatedSessionRows) ? terminatedSessionRows[0]?.id : null;

  if (!terminatedSessionId) {
    failures.push("terminated session lookup did not find the test session");
  } else {
    await expectStatus("terminate selected session", "POST", `/api/admin/sessions/${terminatedSessionId}/terminate`, 200, { token: adminToken });
    await expectStatus("terminated session is denied", "GET", "/api/auth/session", 403, { token: terminatedAdminToken });
    await expectStatus("administrator remains active after terminating another session", "GET", "/api/auth/session", 200, { token: adminToken });
  }
}

const slowPayload = JSON.stringify({ email: adminEmail, password: adminPassword });
const slowBody = Readable.from((async function* () {
  for (let offset = 0; offset < slowPayload.length; offset += 8) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    yield slowPayload.slice(offset, offset + 8);
  }
})());
await expectStatus("slow request body", "POST", "/api/auth/login", 200, {
  rawBody: slowBody,
  headers: { "content-type": "application/json" },
  timeoutMs: 30_000,
});

if (adminToken) {
  await expectStatus("empty alumni fields", "POST", "/api/profiles", 400, { token: adminToken, body: {} });

  const settings = await expectStatus("system settings", "GET", "/api/system-settings", 200);
  const programEntry = settings?.body?.programs?.[0];
  const program = typeof programEntry === "string" ? programEntry : programEntry?.code;
  const batchList = await expectStatus("graduation batches", "GET", "/api/graduation-batches", 200, { token: adminToken });
  let smokeBatch = Array.isArray(batchList?.body) ? batchList.body.find((item) => item.batchYear === 2026) : null;
  if (!smokeBatch) {
    const createdBatch = await expectStatus("create graduation batch", "POST", "/api/graduation-batches", 201, {
      token: adminToken,
      body: { batchYear: 2026, schoolYear: "2025–2026", boardResolutionNo: "EDGE-2026", graduationDate: "2026-06-15" },
    });
    smokeBatch = createdBatch?.body;
  }
  const unique = Date.now();
  const alumniEmail = `codex-edge-${unique}@gmail.com`;
  const alumniPassword = "CodexEdgeAlumni123!";
  const alumniBody = {
    name: "Codex Edge Alumni",
    email: alumniEmail,
    course: program,
    graduationBatchId: smokeBatch?.id,
    studentId: `EDGE-${unique}`,
    sendEmail: false,
  };

  await expectStatus("create alumni account", "POST", "/api/profiles", 201, { token: adminToken, body: alumniBody });
  await expectStatus("duplicate alumni email and ID", "POST", "/api/profiles", 409, { token: adminToken, body: alumniBody });

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    ssl: false,
  });
  const passwordHash = await bcrypt.hash(alumniPassword, 4);
  await connection.execute("UPDATE users SET password_hash = ? WHERE email = ?", [passwordHash, alumniEmail]);
  await connection.execute(
    "INSERT IGNORE INTO user_roles (user_id, role) SELECT id, 'chairman' FROM users WHERE email = ?",
    [alumniEmail],
  );
  await connection.end();

  const roleLogin = await expectStatus("multi-role Alumni and Chairman login", "POST", "/api/auth/login", 200, {
    body: { email: alumniEmail, password: alumniPassword },
  });
  const assignedRoles = Array.isArray(roleLogin?.body?.roles) ? roleLogin.body.roles : [];
  if (!roleLogin?.body?.requiresRoleSelection || !assignedRoles.includes("alumni") || !assignedRoles.includes("chairman")) {
    failures.push("role-based login did not offer both Alumni and Department Chairman roles");
  } else {
    passed += 1;
  }

  await expectStatus("unassigned role selection", "POST", "/api/auth/select-role", 403, {
    body: { loginToken: roleLogin?.body?.loginToken, role: "admin" },
  });
  const alumniSelection = await expectStatus("role-based alumni login", "POST", "/api/auth/select-role", 200, {
    body: { loginToken: roleLogin?.body?.loginToken, role: "alumni" },
  });
  const chairmanSelection = await expectStatus("role-based chairman login", "POST", "/api/auth/select-role", 200, {
    body: { loginToken: roleLogin?.body?.loginToken, role: "chairman" },
  });
  const alumniToken = alumniSelection?.body?.token || "";
  const chairmanToken = chairmanSelection?.body?.token || "";

  if (alumniToken) {
    await expectStatus("alumni session restoration", "GET", "/api/auth/session", 200, { token: alumniToken });
    await expectStatus("alumni role-authorized dashboard", "GET", "/api/alumni/dashboard", 200, { token: alumniToken });
    await expectStatus("alumni denied profiles administration", "GET", "/api/profiles", 403, { token: alumniToken });
    await expectStatus("alumni denied session monitoring", "GET", "/api/admin/sessions", 403, { token: alumniToken });
  }
  if (chairmanToken) {
    await expectStatus("chairman session restoration", "GET", "/api/auth/session", 200, { token: chairmanToken });
    await expectStatus("chairman role-authorized alumni view", "GET", "/api/chairman/alumni", 200, { token: chairmanToken });
    await expectStatus("chairman denied session monitoring", "GET", "/api/admin/sessions", 403, { token: chairmanToken });
  }

  const malformedWorkbook = Buffer.from("not an xlsx workbook");
  const malformed = await expectStatus("malformed import server failure", "POST", "/api/profiles/import", 500, {
    token: adminToken,
    rawBody: malformedWorkbook,
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": "malformed.xlsx",
      "x-graduation-batch-id": String(smokeBatch?.id || ""),
    },
  });
  if (typeof malformed?.body?.error !== "string" || /sql|stack|select|insert/i.test(malformed.body.error)) {
    failures.push("malformed import exposed an unsafe or missing public error");
  } else {
    passed += 1;
  }

  await expectStatus("oversized alumni import", "POST", "/api/profiles/import", 413, {
    token: adminToken,
    rawBody: Buffer.alloc(16 * 1024 * 1024),
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": "oversized.xlsx",
      "x-graduation-batch-id": String(smokeBatch?.id || ""),
    },
    timeoutMs: 30_000,
  });

  const concurrentResults = await Promise.all(
    Array.from({ length: 60 }, () => request("GET", "/api/profiles?paginated=true&role=alumni&page=1&pageSize=15", { token: adminToken })),
  );
  const concurrentFailures = concurrentResults.filter(({ response }) => response.status !== 200);
  if (concurrentFailures.length > 0) {
    failures.push(`simultaneous authenticated requests: ${concurrentFailures.length}/60 failed`);
  } else {
    passed += 1;
  }

  const decoded = jwt.decode(adminToken);
  const expiredToken = jwt.sign({
    id: decoded?.id,
    email: decoded?.email,
    role: decoded?.role,
    sessionId: decoded?.sessionId,
    nonce: randomUUID(),
  }, jwtSecret, { expiresIn: -1 });
  await expectStatus("expired JWT", "GET", "/api/auth/session", 403, { token: expiredToken });
  await expectStatus("session ended after expired-token cleanup", "GET", "/api/auth/session", 403, { token: adminToken });
}

if (failures.length > 0) {
  console.error(`Edge-case API checks failed (${passed} passed):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Edge-case API checks passed: ${passed}`);
}
