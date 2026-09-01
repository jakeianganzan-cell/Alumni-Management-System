import dotenv from "dotenv";
import path from "node:path";

const serverRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(serverRoot, "..");

dotenv.config({ path: path.resolve(projectRoot, ".env") });
dotenv.config({ path: path.resolve(serverRoot, ".env"), override: true });

const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const runMutatingChecks = process.env.SMOKE_MUTATING === "true";

const failures = [];

const requestJson = async (method, path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body };
};

const expectStatus = async (label, method, path, expectedStatuses, options) => {
  try {
    const result = await requestJson(method, path, options);
    if (!expectedStatuses.includes(result.response.status)) {
      failures.push(`${label}: expected ${expectedStatuses.join("/")} got ${result.response.status}`);
    }
    return result;
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

await expectStatus("health", "GET", "/api/health", [200]);
await expectStatus("profiles reject missing token", "GET", "/api/profiles", [401]);
await expectStatus("profiles reject invalid token", "GET", "/api/profiles", [403], { token: "invalid-smoke-token" });
await expectStatus("admin sessions reject missing token", "GET", "/api/admin/sessions", [401]);

let token = "";
if (adminEmail && adminPassword) {
  const login = await expectStatus("admin login", "POST", "/api/auth/login", [200], {
    body: { email: adminEmail, password: adminPassword },
  });

  if (login?.body?.requiresRoleSelection) {
    const role = Array.isArray(login.body.roles) && login.body.roles.includes("admin") ? "admin" : login.body.roles?.[0];
    const selected = await expectStatus("role selection", "POST", "/api/auth/select-role", [200], {
      body: { loginToken: login.body.loginToken, role },
    });
    token = selected?.body?.token || "";
  } else {
    token = login?.body?.token || "";
  }
} else {
  failures.push("admin login: SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD or ADMIN_EMAIL/ADMIN_PASSWORD not set");
}

if (token) {
  await expectStatus("auth session", "GET", "/api/auth/session", [200], { token });
  await expectStatus("alumni profiles", "GET", "/api/profiles", [200], { token });
  await expectStatus("announcements", "GET", "/api/announcements", [200], { token });
  await expectStatus("donations", "GET", "/api/donations", [200], { token });
  await expectStatus("admin sessions", "GET", "/api/admin/sessions", [200], { token });
  await expectStatus("mailing logs pagination", "GET", "/api/admin/mailing/logs?page=1&pageSize=5", [200], { token });
  await expectStatus("email queue pagination", "GET", "/api/admin/email-queue?page=1&pageSize=5", [200], { token });

  if (runMutatingChecks) {
    await expectStatus("upload validation", "POST", "/api/admin/system-settings/upload", [400], {
      token,
      body: { fileName: "smoke-test.txt", dataUrl: "not-a-data-url" },
    });
  }
}

if (failures.length) {
  console.error("Smoke checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Smoke checks passed against ${baseUrl}`);
}
