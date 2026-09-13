import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import { assertNonProductionOperation } from "../environment-policy.mjs";

assertNonProductionOperation("Contribution API smoke tests");

const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:5110").replace(/\/+$/, "");
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const failures = [];
let passed = 0;

const request = async (method, route, { token, body } = {}) => {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, body: payload };
};

const expect = async (label, method, route, status, options = {}) => {
  const result = await request(method, route, options);
  if (result.status !== status) failures.push(`${label}: expected ${status}, received ${result.status} (${JSON.stringify(result.body)})`);
  else passed += 1;
  return result;
};

const login = async (email, password) => {
  const result = await request("POST", "/api/auth/login", { body: { email, password } });
  if (result.status !== 200) return "";
  if (!result.body?.requiresRoleSelection) return result.body?.token || "";
  const role = result.body.roles?.includes("admin") ? "admin" : result.body.roles?.[0];
  const selected = await request("POST", "/api/auth/select-role", { body: { loginToken: result.body.loginToken, role } });
  return selected.body?.token || "";
};

if (!adminEmail || !adminPassword || !process.env.DB_NAME) throw new Error("Test admin credentials and DB_NAME are required.");

await expect("analytics requires authentication", "GET", "/api/contributions/analytics", 401);
const adminToken = await login(adminEmail, adminPassword);
if (!adminToken) throw new Error("Admin login failed.");
const baselineAnalytics = await expect("load baseline contribution analytics", "GET", "/api/contributions/analytics", 200, { token: adminToken });
const baselineVolunteerAnalytics = await expect("load baseline volunteer analytics", "GET", "/api/contributions/analytics?type=Volunteer%20Service", 200, { token: adminToken });

const settings = await expect("load program settings", "GET", "/api/system-settings", 200);
const programEntry = settings.body?.programs?.[0];
const program = typeof programEntry === "string" ? programEntry : programEntry?.code;
const batchList = await expect("load graduation batches", "GET", "/api/graduation-batches", 200, { token: adminToken });
let graduationBatch = Array.isArray(batchList.body) ? batchList.body[0] : null;
if (!graduationBatch) {
  graduationBatch = (await expect("create graduation batch", "POST", "/api/graduation-batches", 201, {
    token: adminToken,
    body: { batchYear: 2026, schoolYear: "2025–2026", boardResolutionNo: "SMOKE-2026", graduationDate: "2026-06-15" },
  })).body;
}
const unique = Date.now();
const alumniEmail = `contribution-${unique}@gmail.com`;
const alumniPassword = "ContributionTest123!";
const studentId = `CON-${unique}`;

await expect("create alumni contributor", "POST", "/api/profiles", 201, {
  token: adminToken,
  body: { name: "Contribution Test Alumni", email: alumniEmail, studentId, course: program, graduationBatchId: graduationBatch?.id, sendEmail: false },
});

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  ssl: false,
});
await connection.execute("UPDATE users SET password_hash = ? WHERE email = ?", [await bcrypt.hash(alumniPassword, 4), alumniEmail]);
await connection.execute(
  "INSERT INTO tracer_form (user_id, submission_status, submitted_at) SELECT id, 'completed', NOW() FROM users WHERE email = ?",
  [alumniEmail],
);
await connection.end();

const alumniToken = await login(alumniEmail, alumniPassword);
if (!alumniToken) throw new Error("Alumni login failed.");

const today = new Date().toISOString().slice(0, 10);
await expect("financial amount required", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "Financial", contribution_date: today, purpose: "Scholarship", method: "Personal" } });
await expect("volunteer hours required", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "Volunteer Service", contribution_date: today, purpose: "Career mentoring" } });
await expect("in-kind quantity required", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "In-Kind", contribution_date: today, purpose: "Laboratory support" } });
await expect("project name required", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "Project Support", contribution_date: today, purpose: "Extension program" } });
await expect("removed mentorship type rejected", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "Mentorship", contribution_date: today, purpose: "Student mentoring" } });
await expect("removed professional support type rejected", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "Professional Support", contribution_date: today, purpose: "Career assistance" } });
await expect("removed other support type rejected", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "Other Support", contribution_date: today, purpose: "Advisory support" } });
await expect("negative estimated value rejected", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "In-Kind", contribution_date: today, purpose: "Laboratory support", quantity_description: "10 keyboards", estimated_value: -1 } });
await expect("large supporting information rejected", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "In-Kind", contribution_date: today, purpose: "Laboratory support", quantity_description: "10 keyboards", supporting_information: "x".repeat(2001) } });
await expect("oversized supporting PDF rejected", "POST", "/api/donations", 400, { token: alumniToken, body: { contribution_type: "In-Kind", contribution_date: today, purpose: "Laboratory support", quantity_description: "10 keyboards", receipt_url: `data:application/pdf;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}` } });

const validRecords = [
  { contribution_type: "Financial", contribution_date: today, amount: 1000, method: "Personal", purpose: "Student scholarship" },
  { contribution_type: "In-Kind", contribution_date: today, purpose: "Computer laboratory support", activity_name: "Digital Laboratory Upgrade", quantity_description: "10 keyboards", estimated_value: 5000 },
];

const recordIds = [];
for (const record of validRecords) {
  const result = await expect(`submit ${record.contribution_type}`, "POST", "/api/donations", 201, { token: alumniToken, body: record });
  if (result.body?.donation?.id) recordIds.push(result.body.donation.id);
}

const history = await expect("alumni donation history", "GET", "/api/alumni/donations", 200, { token: alumniToken });
if (!Array.isArray(history.body) || history.body.length !== 2 || history.body.some((item) => !["Financial", "In-Kind"].includes(item.contribution_type))) {
  failures.push("alumni donation history exposed a retired contribution type");
} else passed += 1;

await expect("alumni denied aggregate analytics", "GET", "/api/contributions/analytics", 403, { token: alumniToken });
for (const id of recordIds) {
  await expect(`review contribution ${id}`, "POST", `/api/donations/${id}/review`, 200, { token: adminToken });
  await expect(`approve contribution ${id}`, "PUT", `/api/donations/${id}/status`, 200, { token: adminToken, body: { status: "Approved", reviewNotes: "Verified by contribution smoke test." } });
}

await expect("record linked project participation", "POST", "/api/admin/donations/walk-in", 201, {
  token: adminToken,
  body: {
    donorName: "Contribution Test Alumni", donorEmail: alumniEmail, donorStudentId: studentId, donorBatch: "2024", donorCourse: program,
    contributionType: "Project Support", contributionDate: today, purpose: "Institutional extension support",
    activityName: "Community Extension Program", estimatedValue: 3500, supportingInformation: "Attendance verified by project coordinator.",
  },
});

const analytics = await expect("contribution analytics", "GET", "/api/contributions/analytics", 200, { token: adminToken });
if (
  Number(analytics.body?.totals?.totalContributions) !== Number(baselineAnalytics.body?.totals?.totalContributions || 0) + 3 ||
  Number(analytics.body?.totals?.volunteerHours) !== Number(baselineAnalytics.body?.totals?.volunteerHours || 0) ||
  Number(analytics.body?.totals?.totalValue) !== Number(baselineAnalytics.body?.totals?.totalValue || 0) + 9500 ||
  Number(analytics.body?.totals?.financialAmount) !== Number(baselineAnalytics.body?.totals?.financialAmount || 0) + 1000 ||
  Number(analytics.body?.totals?.inKindContributions) !== Number(baselineAnalytics.body?.totals?.inKindContributions || 0) + 1 ||
  Number(analytics.body?.totals?.projectInvolvements) !== Number(baselineAnalytics.body?.totals?.projectInvolvements || 0) + 1
) {
  failures.push(`contribution analytics totals are incorrect: ${JSON.stringify(analytics.body?.totals)}`);
} else passed += 1;
for (const key of ["byType", "byProgram", "byBatch", "byPeriod", "byActivity"]) {
  if (!Array.isArray(analytics.body?.[key]) || analytics.body[key].length === 0) failures.push(`contribution analytics ${key} is empty`);
  else passed += 1;
}

const volunteerAnalytics = await expect("filtered volunteer analytics", "GET", "/api/contributions/analytics?type=Volunteer%20Service", 200, { token: adminToken });
if (
  Number(volunteerAnalytics.body?.totals?.totalContributions) !== Number(baselineVolunteerAnalytics.body?.totals?.totalContributions || 0) ||
  Number(volunteerAnalytics.body?.totals?.volunteerHours) !== Number(baselineVolunteerAnalytics.body?.totals?.volunteerHours || 0)
) {
  failures.push("filtered volunteer analytics returned incorrect values");
} else passed += 1;

const opportunityTitle = `Contribution Opportunity ${unique}`;
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
const opportunityAnnouncement = await expect("create volunteer opportunity", "POST", "/api/announcements", 200, {
  token: adminToken,
  body: {
    title: opportunityTitle,
    description: "Volunteer opportunity lifecycle smoke test.",
    date: today,
    type: "announcement",
    status: "active",
    contributionOpportunity: {
      opportunityType: "Volunteer Service",
      registrationDeadline: tomorrow.toISOString().slice(0, 16),
      capacity: 2,
      availableRoles: "Registration desk",
      status: "Open",
    },
  },
});
const opportunityAnnouncementId = opportunityAnnouncement.body?.event?.id;
const announcementList = await expect("load volunteer opportunity", "GET", "/api/announcements", 200, { token: alumniToken });
const opportunity = Array.isArray(announcementList.body)
  ? announcementList.body.find((item) => String(item.id) === String(opportunityAnnouncementId))?.contributionOpportunity
  : null;
if (!opportunity?.id) failures.push("created announcement did not expose contribution opportunity metadata");
else {
  passed += 1;
  await expect("retired alumni opportunity submission", "POST", `/api/contribution-opportunities/${opportunity.id}/submissions`, 404, {
    token: alumniToken,
    body: { availability: "Weekday mornings", preferredRole: "Registration desk", skills: "Event coordination" },
  });
  await expect("retired alumni opportunity history", "GET", "/api/alumni/contribution-submissions", 404, { token: alumniToken });
}

if (failures.length > 0) {
  console.error(`Contribution smoke checks failed (${passed} passed):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Contribution smoke checks passed: ${passed}`);
}
