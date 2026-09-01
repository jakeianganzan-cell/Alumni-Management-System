import "../env.ts";

const target = new URL(process.env.LOAD_TEST_URL || "http://127.0.0.1:5000/api/health");
const requests = Math.max(1, Number(process.env.LOAD_TEST_REQUESTS || 500));
const concurrency = Math.min(200, Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 50)));
const timeoutMs = Math.max(1000, Number(process.env.LOAD_TEST_TIMEOUT_MS || 10000));
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);

if (!isLocal && process.env.LOAD_TEST_CONFIRM !== "true") {
  throw new Error("Set LOAD_TEST_CONFIRM=true before load-testing a non-local server.");
}

const durations = [];
const statuses = new Map();
let cursor = 0;
let failed = 0;
let authorization = "";

if (process.env.LOAD_TEST_AUTH === "true") {
  const loginUrl = new URL("/api/auth/login", target.origin);
  const loginResponse = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.LOAD_TEST_EMAIL || process.env.ADMIN_EMAIL,
      password: process.env.LOAD_TEST_PASSWORD || process.env.ADMIN_PASSWORD,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let loginPayload = await loginResponse.json();

  if (!loginResponse.ok) {
    throw new Error(`Load-test login failed with status ${loginResponse.status}.`);
  }

  if (loginPayload.requiresRoleSelection) {
    const selectedRole = loginPayload.roles.includes("president") ? "president" : loginPayload.roles[0];
    const roleResponse = await fetch(new URL("/api/auth/select-role", target.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginToken: loginPayload.loginToken, role: selectedRole }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    loginPayload = await roleResponse.json();
    if (!roleResponse.ok) throw new Error(`Load-test role selection failed with status ${roleResponse.status}.`);
  }

  if (!loginPayload.token) throw new Error("Load-test login did not return an access token.");
  authorization = `Bearer ${loginPayload.token}`;
}

const runWorker = async () => {
  while (cursor < requests) {
    cursor += 1;
    const startedAt = performance.now();

    try {
      const response = await fetch(target, {
        headers: authorization ? { Authorization: authorization } : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.arrayBuffer();
      durations.push(performance.now() - startedAt);
      statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
      if (!response.ok) failed += 1;
    } catch {
      durations.push(performance.now() - startedAt);
      failed += 1;
      statuses.set("network-error", (statuses.get("network-error") || 0) + 1);
    }
  }
};

const startedAt = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, runWorker));
const elapsedMs = performance.now() - startedAt;
const sorted = durations.toSorted((a, b) => a - b);
const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;

console.log(JSON.stringify({
  target: target.toString(),
  requests,
  concurrency,
  failed,
  statuses: Object.fromEntries(statuses),
  requestsPerSecond: Number((requests / (elapsedMs / 1000)).toFixed(2)),
  latencyMs: {
    average: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2)),
    maximum: Number((sorted.at(-1) || 0).toFixed(2)),
  },
}, null, 2));

if (failed > 0) process.exitCode = 1;
