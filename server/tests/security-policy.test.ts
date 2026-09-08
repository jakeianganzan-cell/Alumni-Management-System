import assert from "node:assert/strict";
import test from "node:test";
import { getPublicErrorMessage } from "../utils/safeError";
import { getSessionAccessDecision } from "../utils/sessionPolicy";
import { roleHasPermission } from "../middleware/rbac";
import { parseDataUrlUpload } from "../utils/fileUpload";

test("production errors never expose internal exception messages", () => {
  const error = new Error("Unknown column private_table.secret_value");

  assert.equal(getPublicErrorMessage(error, "Request failed", "production"), "Request failed");
  assert.equal(getPublicErrorMessage(error, "Request failed", "development"), "Request failed");
});

test("session verification fails closed when the session store is unavailable", () => {
  assert.deepEqual(getSessionAccessDecision("active"), { allowed: true, status: 200 });
  assert.deepEqual(getSessionAccessDecision("inactive"), { allowed: false, status: 403 });
  assert.deepEqual(getSessionAccessDecision("unavailable"), { allowed: false, status: 503 });
});

test("backend RBAC enforces least privilege", () => {
  assert.equal(roleHasPermission("admin", "settings.manage"), true);
  assert.equal(roleHasPermission("president", "settings.manage"), false);
  assert.equal(roleHasPermission("president", "projects.view"), false);
  assert.equal(roleHasPermission("appointed", "settings.manage"), false);
  assert.equal(roleHasPermission("treasurer", "donations.view"), true);
  assert.equal(roleHasPermission("treasurer", "alumni.edit"), false);
  assert.equal(roleHasPermission("chairman", "projects.view"), true);
  assert.equal(roleHasPermission("chairman", "projects.manage"), false);
  assert.equal(roleHasPermission("chairman", "alumni.view"), false);
  assert.equal(roleHasPermission("appointed", "tracer.view"), false);
});

test("unsafe upload types are rejected", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
  assert.throws(() => parseDataUrlUpload(`data:image/svg+xml;base64,${svg}`), /Only image, PDF, and Office document uploads are allowed/);

  const fakeMacroDocument = Buffer.from("PK[Content_Types].xml word/vbaProject.bin").toString("base64");
  assert.throws(
    () => parseDataUrlUpload(`data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${fakeMacroDocument}`),
    /macro-free/,
  );
});
