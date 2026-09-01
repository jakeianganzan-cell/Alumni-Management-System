import assert from "node:assert/strict";
import test from "node:test";
import { getPublicErrorMessage } from "../utils/safeError";
import { getSessionAccessDecision } from "../utils/sessionPolicy";

test("production errors never expose internal exception messages", () => {
  const error = new Error("Unknown column private_table.secret_value");

  assert.equal(getPublicErrorMessage(error, "Request failed", "production"), "Request failed");
  assert.equal(getPublicErrorMessage(error, "Request failed", "development"), error.message);
});

test("session verification fails closed when the session store is unavailable", () => {
  assert.deepEqual(getSessionAccessDecision("active"), { allowed: true, status: 200 });
  assert.deepEqual(getSessionAccessDecision("inactive"), { allowed: false, status: 403 });
  assert.deepEqual(getSessionAccessDecision("unavailable"), { allowed: false, status: 503 });
});

