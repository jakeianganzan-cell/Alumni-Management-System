import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import ExcelJS from "exceljs";
import { getPublicErrorMessage } from "../utils/safeError";
import { getSessionAccessDecision } from "../utils/sessionPolicy";
import { roleHasPermission } from "../middleware/rbac";
import { assertValidFileContents, parseDataUrlUpload } from "../utils/fileUpload";
import { parseImageDataUrl } from "../utils/imageOptimizer";
import { generateTracerPortablePdfBuffer, renderTracerPdfHtml } from "../utils/tracerPdf";
import { isLoginInputWithinLimits, isRoleAssigned, verifyLoginPassword } from "../utils/authPolicy";
import { validateTracerPayload } from "../../shared/tracerValidation";

test("valid and invalid login credentials use bcrypt verification", async () => {
  const password = "Correct-Test-Password-123!";
  const passwordHash = await bcrypt.hash(password, 4);

  assert.equal(isLoginInputWithinLimits("admin@example.test", password), true);
  assert.equal(isLoginInputWithinLimits("", password), false);
  assert.equal(isLoginInputWithinLimits("admin@example.test", ""), false);
  assert.equal(await verifyLoginPassword(password, passwordHash), true);
  assert.equal(await verifyLoginPassword("Incorrect-Test-Password-123!", passwordHash), false);
});

test("role selection accepts only roles assigned to the account", () => {
  const roles = ["admin", "alumni", "chairman"];

  assert.equal(isRoleAssigned(roles, "admin"), true);
  assert.equal(isRoleAssigned(roles, "alumni"), true);
  assert.equal(isRoleAssigned(roles, "chairman"), true);
  assert.equal(isRoleAssigned(roles, "treasurer"), false);
  assert.equal(isRoleAssigned(roles, ""), false);
});

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
  assert.equal(roleHasPermission("chairman", "tracer.view"), true);
  assert.equal(roleHasPermission("appointed", "tracer.view"), false);
  assert.equal(roleHasPermission("alumni", "settings.manage"), false);
  assert.equal(roleHasPermission("chairman", "settings.manage"), false);
  assert.equal(roleHasPermission("chairman", "sessions.manage"), false);
});

test("unsafe upload types are rejected", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
  assert.throws(() => parseDataUrlUpload(`data:image/svg+xml;base64,${svg}`), /Only image, PDF, and Office document uploads are allowed/);

  assert.throws(
    () => parseImageDataUrl(`data:image/jpeg;base64,${svg}`),
    /does not match the declared file type/,
  );

  const invalidPdf = Buffer.from("This is not a PDF file.").toString("base64");
  assert.throws(
    () => parseDataUrlUpload(`data:application/pdf;base64,${invalidPdf}`),
    /does not match the declared file type/,
  );

  const fakeMacroDocument = Buffer.from("PK[Content_Types].xml word/vbaProject.bin").toString("base64");
  assert.throws(
    () => parseDataUrlUpload(`data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${fakeMacroDocument}`),
    /macro-free/,
  );

  const disguisedSpreadsheet = Buffer.from("PK[Content_Types].xml word/document.xml").toString("base64");
  assert.throws(
    () => parseDataUrlUpload(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${disguisedSpreadsheet}`),
    /correctly typed/,
  );
});

test("valid macro-free alumni spreadsheets pass content validation", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Alumni").addRow(["Name", "Email", "Program"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  assert.doesNotThrow(() => assertValidFileContents(
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ));
});

test("graduate tracer has a browser-independent PDF fallback", () => {
  const chedPayload = {
    fullName: "Sample Alumni",
    permanentAddress: "Test City",
    email: "sample@example.test",
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
    reasonsForCourse: [],
    reasonsForCourseOther: "",
    trainings: [],
    advanceStudyReason: "",
    advanceStudyReasonOther: "",
    presentlyEmployed: "Not Employed",
    unemploymentReasons: ["Family concern"],
    referrals: [],
  };
  assert.deepEqual(validateTracerPayload(chedPayload), {});

  const html = renderTracerPdfHtml({ id: 1, name: "Sample Alumni", ched_payload: chedPayload });
  for (const section of ["A. GENERAL INFORMATION", "B. EDUCATIONAL BACKGROUND", "C. TRAININGS / ADVANCE STUDIES", "D. EMPLOYMENT DATA"]) {
    assert.match(html, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const pdf = generateTracerPortablePdfBuffer({
    id: 1,
    name: "Sample Alumni",
    ched_payload: chedPayload,
  });

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 500);
});
