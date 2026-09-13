import bcrypt from "bcrypt";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertNonProductionOperation } from "../environment-policy.mjs";

const serverRoot = path.resolve(import.meta.dirname, "..");
dotenv.config({ path: path.resolve(serverRoot, ".env"), quiet: true });
assertNonProductionOperation("Graduate Tracer workflow smoke test");

const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const testId = randomUUID();
const testEmail = `tracer-smoke-${testId}@example.test`;
const testPassword = "Tracer-Smoke-Password-123!";
const testName = `Tracer Smoke ${testId.slice(0, 8)}`;

if (!adminEmail || !adminPassword) {
  throw new Error("SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD are required.");
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ustp_alumni_ci",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
});

const failures = [];

const request = async (method, pathname, { token, body } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
};

const readJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
};

const expectStatus = async (label, response, expected) => {
  if (response.status !== expected) {
    const body = await readJson(response);
    failures.push(`${label}: expected ${expected}, received ${response.status} (${JSON.stringify(body)})`);
    return false;
  }
  return true;
};

const expectPdf = async (label, response) => {
  if (!await expectStatus(label, response, 200)) return;
  const pdf = Buffer.from(await response.arrayBuffer());
  if (!String(response.headers.get("content-type") || "").includes("application/pdf")) failures.push(`${label}: content type was not application/pdf`);
  if (pdf.length <= 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") failures.push(`${label}: response was empty or was not a PDF file`);
};

const login = async (email, password, expectedRole) => {
  const response = await request("POST", "/api/auth/login", { body: { email, password } });
  if (!await expectStatus(`${expectedRole} login`, response, 200)) return "";
  const body = await readJson(response);
  if (!body?.requiresRoleSelection) return body?.token || "";

  const selected = await request("POST", "/api/auth/select-role", {
    body: { loginToken: body.loginToken, role: expectedRole },
  });
  if (!await expectStatus(`${expectedRole} role selection`, selected, 200)) return "";
  return (await readJson(selected))?.token || "";
};

const validPayload = {
  fullName: testName,
  permanentAddress: "Smoke Test City",
  email: testEmail,
  telephoneNumber: "",
  mobileNumber: "+63 912 345 6789",
  civilStatus: "Single",
  sex: "Female",
  birthdayMonth: "January",
  birthdayDay: "15",
  birthdayYear: "2000",
  regionOfOrigin: "Region 10",
  province: "Misamis Oriental",
  residenceType: "City",
  educationalAttainments: [{ degreeSpecialization: "BSIT", school: "Salay Community College", yearGraduated: "2026", honorsAwards: "" }],
  professionalExams: [],
  reasonsForCourse: ["Prospect for immediate employment"],
  reasonsForCourseOther: "",
  trainings: [{
    title: "Tracer Smoke Career Training",
    durationCredits: "8 hours",
    institution: "Salay Community College",
    advancedStudiesLevel: "",
    advancedStudiesStatus: "",
  }],
  advanceStudyReason: "",
  advanceStudyReasonOther: "",
  presentlyEmployed: "Not Employed",
  unemploymentReasons: ["Family concern"],
  unemploymentReasonsOther: "",
  presentEmploymentStatus: "",
  selfEmployedSkills: "",
  presentOccupation: "",
  companyNameAddress: "",
  industry: "",
  workLocation: "",
  firstJobAfterCollege: "",
  reasonsForStaying: [],
  reasonsForStayingOther: "",
  firstJobRelatedToCourse: "",
  reasonsForAcceptingJob: [],
  reasonsForAcceptingJobOther: "",
  reasonsForChangingJob: [],
  reasonsForChangingJobOther: "",
  firstJobDuration: "",
  firstJobDurationOther: "",
  firstJobFindingWays: [],
  firstJobFindingWaysOther: "",
  timeToLandFirstJob: "",
  timeToLandFirstJobOther: "",
  jobLevelFirstJob: "",
  jobLevelCurrentJob: "",
  initialGrossMonthlyEarning: "",
  curriculumRelevantToFirstJob: "",
  usefulCompetencies: [],
  usefulCompetenciesOther: "",
  curriculumSuggestions: "Smoke-tested tracer response",
  referrals: [],
};

try {
  const health = await request("GET", "/health");
  if (await expectStatus("API health", health, 200)) {
    const body = await readJson(health);
    if (body?.status !== "ok") failures.push("API health response did not report status ok");
  }

  const passwordHash = await bcrypt.hash(testPassword, 4);
  await connection.beginTransaction();
  await connection.execute(
    "INSERT INTO users (id, email, password_hash, email_status) VALUES (?, ?, ?, 'sent')",
    [testId, testEmail, passwordHash],
  );
  await connection.execute(
    "INSERT INTO profiles (id, name, email, student_id, course, batch) VALUES (?, ?, ?, ?, ?, ?)",
    [testId, testName, testEmail, `SMOKE-${testId.slice(0, 8)}`, "BSIT", "2026"],
  );
  await connection.execute("INSERT INTO user_roles (user_id, role, archived) VALUES (?, 'alumni', 0)", [testId]);
  await connection.commit();

  const alumniToken = await login(testEmail, testPassword, "alumni");
  const adminToken = await login(adminEmail, adminPassword, "admin");
  if (!alumniToken) failures.push("alumni authentication did not return a token");
  if (!adminToken) failures.push("admin authentication did not return a token");

  if (alumniToken) {
    const draftPayload = { ...validPayload, fullName: `${testName} Draft` };
    const draftResponse = await request("POST", "/api/tracer/save-draft", { token: alumniToken, body: { ched_payload: draftPayload } });
    await expectStatus("save draft", draftResponse, 200);

    const recoveredDraft = await request("GET", "/api/tracer/my-form", { token: alumniToken });
    if (await expectStatus("recover draft", recoveredDraft, 200)) {
      const body = await readJson(recoveredDraft);
      if (body?.draft?.ched_payload?.fullName !== draftPayload.fullName) failures.push("saved draft was not recovered from the database");
    }

    const invalidSubmission = await request("POST", "/api/tracer/submit", { token: alumniToken, body: { ched_payload: { fullName: "" } } });
    await expectStatus("reject invalid final submission", invalidSubmission, 400);

    const malformedSubmission = await request("POST", "/api/tracer/submit", { token: alumniToken, body: { ched_payload: "not-a-tracer-object" } });
    await expectStatus("reject malformed tracer payload", malformedSubmission, 400);

    const unauthorizedAdminList = await request("GET", "/api/admin/tracer?page=1&pageSize=10", { token: alumniToken });
    await expectStatus("deny Alumni access to Admin tracer records", unauthorizedAdminList, 403);

    const submitted = await request("POST", "/api/tracer/submit", { token: alumniToken, body: { ched_payload: validPayload } });
    await expectStatus("final submission", submitted, 200);

    const [formRows] = await connection.execute(
      "SELECT id, submission_status, submitted_at, ched_payload FROM tracer_form WHERE user_id = ?",
      [testId],
    );
    const savedForm = formRows[0];
    if (!savedForm || savedForm.submission_status !== "completed") failures.push("completed tracer_form row was not saved");
    if (!savedForm?.submitted_at) failures.push("completed tracer_form submitted_at was not populated");
    if (savedForm && JSON.parse(savedForm.ched_payload || "{}").fullName !== testName) failures.push("saved tracer payload did not match the submitted data");

    const [educationRows] = await connection.execute(
      "SELECT degree_specialization, school, year_graduated FROM tracer_education WHERE tracer_form_id = ?",
      [savedForm?.id || 0],
    );
    if (educationRows.length !== 1 || educationRows[0].year_graduated !== "2026") failures.push("tracer education child rows were not saved");

    const [trainingRows] = await connection.execute(
      "SELECT title, duration_credits, institution FROM tracer_trainings WHERE tracer_form_id = ?",
      [savedForm?.id || 0],
    );
    if (trainingRows.length !== 1 || trainingRows[0].title !== validPayload.trainings[0].title) failures.push("tracer training child rows were not saved");

    const [namedFormRows] = await connection.execute(
      "SELECT id, form_status, submitted_at FROM graduate_tracer_forms WHERE alumni_id = ?",
      [testId],
    );
    const namedForm = namedFormRows[0];
    if (!namedForm || namedForm.form_status !== "Submitted" || !namedForm.submitted_at) failures.push("submitted Graduate Tracer form status or date was not synchronized");

    const [employmentRows] = await connection.execute(
      "SELECT employment_status, payload_json FROM tracer_employment_data WHERE form_id = ?",
      [namedForm?.id || 0],
    );
    if (employmentRows.length !== 1 || employmentRows[0].employment_status !== validPayload.presentlyEmployed) failures.push("tracer employment child record was not saved");

    const [draftRows] = await connection.execute("SELECT id FROM tracer_drafts WHERE user_id = ?", [testId]);
    if (draftRows.length !== 0) failures.push("server draft was not cleared after final submission");

    const persistedSubmission = await request("GET", "/api/tracer/my-form", { token: alumniToken });
    if (await expectStatus("retrieve completed Alumni tracer", persistedSubmission, 200)) {
      const body = await readJson(persistedSubmission);
      if (body?.submission?.ched_payload?.fullName !== testName) failures.push("Alumni could not retrieve the completed tracer payload");
      if (body?.draft !== null) failures.push("completed Alumni tracer still returned a server draft");
    }

    await expectPdf("Alumni PDF preview", await request("GET", "/api/tracer/my-pdf/preview", { token: alumniToken }));
    await expectPdf("Alumni PDF download", await request("GET", "/api/tracer/my-pdf/download", { token: alumniToken }));
  }

  if (adminToken) {
    const adminList = await request("GET", `/api/admin/tracer?search=${encodeURIComponent(testEmail)}&page=1&pageSize=10`, { token: adminToken });
    if (await expectStatus("Admin tracer viewing", adminList, 200)) {
      const body = await readJson(adminList);
      if (!body?.rows?.some((row) => row.user_id === testId)) failures.push("submitted tracer was not visible to Admin");
    }

    const adminRecord = await request("GET", `/api/admin/tracer/${testId}`, { token: adminToken });
    if (await expectStatus("Admin tracer detail", adminRecord, 200)) {
      const body = await readJson(adminRecord);
      if (body?.ched_payload?.fullName !== testName || body?.submission_status !== "completed" || !body?.submitted_at) {
        failures.push("Admin tracer detail did not contain the completed submission and date");
      }
    }

    await expectPdf("Admin PDF preview", await request("GET", `/api/admin/tracer/${testId}/pdf/preview`, { token: adminToken }));
    await expectPdf("Admin PDF download", await request("GET", `/api/admin/tracer/${testId}/pdf/download`, { token: adminToken }));
  }
} catch (error) {
  await connection.rollback().catch(() => undefined);
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await connection.execute("DELETE FROM users WHERE id = ?", [testId]).catch((error) => {
    failures.push(`test account cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  await connection.end();
}

if (failures.length > 0) {
  console.error("Graduate Tracer smoke checks failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Graduate Tracer smoke checks passed: validation, drafts, submission, database rows, Admin viewing, and PDF output.");
}
