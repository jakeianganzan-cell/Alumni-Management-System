import fs from "fs/promises";
import puppeteer from "puppeteer";

export interface TracerPdfRecord {
  id: number | string;
  name?: string | null;
  email?: string | null;
  course?: string | null;
  batch?: string | null;
  employment_status?: string | null;
  job_title?: string | null;
  company?: string | null;
  industry?: string | null;
  work_location?: string | null;
  income?: string | null;
  relevance?: string | null;
  time_to_job?: string | null;
  comments?: string | null;
  submitted_at?: string | null;
  ched_payload?: Record<string, unknown> | null;
}

const SCHOOL_NAME = "University of Science and Technology of Southern Philippines";

const EXECUTABLE_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH || "",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const cleanText = (value: unknown) => String(value ?? "").trim();

const safeArray = (value: unknown) => (Array.isArray(value) ? value : []);

const checkbox = (checked: boolean, label: string) => `
  <span class="check-item">
    <span class="box">${checked ? "✓" : ""}</span>
    <span>${escapeHtml(label)}</span>
  </span>
`;

const joinChoices = (value: unknown) => safeArray(value).map((item) => cleanText(item)).filter(Boolean).join(", ");

const renderSimpleTable = (headers: string[], rows: string[][], emptyMessage: string) => {
  if (rows.length === 0) {
    return `<div class="empty-note">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>${row.map((cell) => `<td>${cell || "&nbsp;"}</td>`).join("")}</tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
};

const lineField = (label: string, value: unknown, wide = false) => `
  <div class="field ${wide ? "wide" : ""}">
    <span class="label">${escapeHtml(label)}</span>
    <span class="line">${escapeHtml(value)}</span>
  </div>
`;

const sectionTitle = (title: string) => `<div class="section-title">${escapeHtml(title)}</div>`;

const formatBirthday = (payload: Record<string, unknown>) => {
  const month = cleanText(payload.birthdayMonth);
  const day = cleanText(payload.birthdayDay);
  const year = cleanText(payload.birthdayYear);
  return [month, day, year].filter(Boolean).join(" ");
};

const formatGeneratedDate = (value = new Date()) =>
  value.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const yesNoPair = (value: string, yesLabel = "Yes", noLabel = "No") => `
  <div class="check-row">
    ${checkbox(value === "Yes", yesLabel)}
    ${checkbox(value === "No", noLabel)}
  </div>
`;

const renderTracerPdfHtml = (record: TracerPdfRecord) => {
  const payload = record.ched_payload ?? {};
  const educationRows = safeArray(payload.educationalAttainments).map((entry) => {
    const row = entry as Record<string, unknown>;
    return [
      escapeHtml(row.degreeSpecialization),
      escapeHtml(row.school),
      escapeHtml(row.yearGraduated),
      escapeHtml(row.honorsAwards),
    ];
  }).filter((row) => row.some((cell) => cell));

  const examRows = safeArray(payload.professionalExams).map((entry) => {
    const row = entry as Record<string, unknown>;
    return [
      escapeHtml(row.examName),
      escapeHtml(row.dateTaken),
      escapeHtml(row.rating),
    ];
  }).filter((row) => row.some((cell) => cell));

  const trainingRows = safeArray(payload.trainings).map((entry) => {
    const row = entry as Record<string, unknown>;
    return [
      escapeHtml(row.title),
      escapeHtml(row.durationCredits),
      escapeHtml(row.institution),
    ];
  }).filter((row) => row.some((cell) => cell));

  const referralRows = safeArray(payload.referrals).map((entry) => {
    const row = entry as Record<string, unknown>;
    return [
      escapeHtml(row.name),
      escapeHtml(row.address),
      escapeHtml(row.contactNumber),
    ];
  }).filter((row) => row.some((cell) => cell));

  const presentlyEmployed = cleanText(payload.presentlyEmployed) || cleanText(record.employment_status);
  const curriculumRelevant = cleanText(payload.curriculumRelevantToFirstJob) || cleanText(record.relevance);
  const workLocation = cleanText(payload.workLocation) || cleanText(record.work_location);
  const presentEmploymentStatus = cleanText(payload.presentEmploymentStatus) || cleanText(record.employment_status);

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Graduate Tracer Survey</title>
      <style>
        @page {
          size: A4;
          margin: 18mm 14mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          font-family: Arial, Helvetica, sans-serif;
          color: #111827;
          font-size: 11px;
          line-height: 1.35;
          margin: 0;
        }

        .document {
          border: 1px solid #111827;
          padding: 14px 16px 18px;
        }

        .header {
          text-align: center;
          border-bottom: 2px solid #111827;
          padding-bottom: 10px;
          margin-bottom: 12px;
        }

        .header p,
        .header h1,
        .header h2 {
          margin: 2px 0;
        }

        .header h1 {
          font-size: 18px;
          letter-spacing: 0.08em;
        }

        .header h2 {
          font-size: 13px;
          font-weight: 700;
        }

        .meta {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 10px;
        }

        .section-title {
          margin-top: 12px;
          margin-bottom: 6px;
          padding: 6px 8px;
          border: 1px solid #111827;
          background: #e5e7eb;
          font-weight: 700;
          letter-spacing: 0.03em;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 12px;
        }

        .field {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          min-height: 24px;
        }

        .field.wide {
          grid-column: 1 / -1;
        }

        .label {
          font-weight: 700;
          white-space: nowrap;
        }

        .line {
          flex: 1;
          border-bottom: 1px solid #111827;
          min-height: 18px;
          padding: 0 4px 2px;
        }

        .check-row,
        .choice-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 14px;
          margin: 4px 0;
        }

        .check-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .box {
          width: 14px;
          height: 14px;
          border: 1px solid #111827;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
        }

        .block {
          border: 1px solid #111827;
          padding: 8px 10px;
          margin-top: 6px;
        }

        .text-block {
          min-height: 54px;
          white-space: pre-wrap;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
        }

        th,
        td {
          border: 1px solid #111827;
          padding: 6px;
          vertical-align: top;
          text-align: left;
        }

        th {
          background: #f3f4f6;
          font-size: 10.5px;
        }

        .two-col {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 14px;
        }

        .empty-note {
          border: 1px dashed #6b7280;
          padding: 8px 10px;
          color: #6b7280;
          margin-top: 6px;
        }

        .footer {
          margin-top: 14px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 10px;
        }
      </style>
    </head>
    <body>
      <div class="document">
        <div class="header">
          <p>REPUBLIC OF THE PHILIPPINES</p>
          <p>Commission on Higher Education</p>
          <h1>GRADUATE TRACER SURVEY</h1>
          <h2>${escapeHtml(SCHOOL_NAME)}</h2>
        </div>

        <div class="meta">
          <span>Tracer Record ID: ${escapeHtml(record.id)}</span>
          <span>Generated: ${escapeHtml(formatGeneratedDate())}</span>
        </div>

        ${sectionTitle("A. GENERAL INFORMATION")}
        <div class="grid">
          ${lineField("Full Name", cleanText(payload.fullName) || cleanText(record.name), true)}
          ${lineField("Permanent Address", payload.permanentAddress, true)}
          ${lineField("Email Address", cleanText(payload.email) || cleanText(record.email))}
          ${lineField("Contact Number", payload.telephoneNumber || payload.mobileNumber)}
          ${lineField("Mobile Number", payload.mobileNumber)}
          ${lineField("Civil Status", payload.civilStatus)}
          ${lineField("Sex", payload.sex)}
          ${lineField("Birthday", formatBirthday(payload as Record<string, unknown>))}
          ${lineField("Region of Origin", payload.regionOfOrigin)}
          ${lineField("Province", payload.province)}
          ${lineField("Residence Type", payload.residenceType)}
        </div>
        <div class="block">
          <div class="choice-wrap">
            ${checkbox(cleanText(payload.civilStatus) === "Single", "Single")}
            ${checkbox(cleanText(payload.civilStatus) === "Married", "Married")}
            ${checkbox(cleanText(payload.civilStatus) === "Separated", "Separated")}
            ${checkbox(cleanText(payload.civilStatus) === "Widow or Widower", "Widow or Widower")}
            ${checkbox(cleanText(payload.civilStatus) === "Single Parent", "Single Parent")}
          </div>
          <div class="choice-wrap">
            ${checkbox(cleanText(payload.sex) === "Male", "Male")}
            ${checkbox(cleanText(payload.sex) === "Female", "Female")}
          </div>
        </div>

        ${sectionTitle("B. EDUCATIONAL BACKGROUND")}
        ${renderSimpleTable(
          ["Degree / Program", "College / University", "Year Graduated", "Honors / Awards"],
          educationRows,
          "No educational background rows were saved for this tracer record.",
        )}
        <div class="block">
          <strong>Reasons for Taking the Course:</strong>
          <div class="text-block">${escapeHtml(joinChoices(payload.reasonsForCourse) || cleanText(payload.reasonsForCourseOther) || "No answer provided.")}</div>
        </div>
        ${renderSimpleTable(
          ["Professional Examination", "Date Taken", "Rating"],
          examRows,
          "No professional examination records were submitted.",
        )}

        ${sectionTitle("C. TRAININGS / ADVANCE STUDIES")}
        ${renderSimpleTable(
          ["Training / Advance Study", "Duration / Credits", "Institution"],
          trainingRows,
          "No trainings or advance studies were submitted.",
        )}
        <div class="two-col">
          <div class="block">
            <strong>Advance Study Reason</strong>
            <div class="text-block">${escapeHtml(cleanText(payload.advanceStudyReason) || cleanText(payload.advanceStudyReasonOther) || "No answer provided.")}</div>
          </div>
          <div class="block">
            <strong>Other Reason / Notes</strong>
            <div class="text-block">${escapeHtml(cleanText(payload.advanceStudyReasonOther) || "None")}</div>
          </div>
        </div>

        ${sectionTitle("D. EMPLOYMENT DATA")}
        <div class="block">
          <strong>Presently Employed</strong>
          <div class="check-row">
            ${checkbox(presentlyEmployed === "Employed", "Yes")}
            ${checkbox(presentlyEmployed === "Not Employed", "No")}
            ${checkbox(presentlyEmployed === "Never Employed", "Never Employed")}
          </div>
        </div>
        <div class="grid">
          ${lineField("Employment Status", presentEmploymentStatus)}
          ${lineField("Present Occupation", cleanText(payload.presentOccupation) || cleanText(record.job_title))}
          ${lineField("Company Name / Address", cleanText(payload.companyNameAddress) || cleanText(record.company), true)}
          ${lineField("Business Industry", cleanText(payload.industry) || cleanText(record.industry))}
          ${lineField("Place of Work", workLocation)}
          ${lineField("Salary Range", cleanText(payload.initialGrossMonthlyEarning) || cleanText(record.income))}
          ${lineField("First Job After College", payload.firstJobAfterCollege)}
          ${lineField("First Job Related to Course", payload.firstJobRelatedToCourse)}
          ${lineField("How Long to Land First Job", cleanText(payload.timeToLandFirstJob) || cleanText(record.time_to_job))}
          ${lineField("Curriculum Relevant to First Job", curriculumRelevant)}
          ${lineField("Job Level - First Job", payload.jobLevelFirstJob)}
          ${lineField("Job Level - Current Job", payload.jobLevelCurrentJob)}
        </div>
        <div class="two-col">
          <div class="block">
            <strong>Reasons for Staying</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.reasonsForStaying) || cleanText(payload.reasonsForStayingOther) || "No answer provided.")}</div>
          </div>
          <div class="block">
            <strong>Reasons for Accepting Job</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.reasonsForAcceptingJob) || cleanText(payload.reasonsForAcceptingJobOther) || "No answer provided.")}</div>
          </div>
          <div class="block">
            <strong>Reasons for Changing Job</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.reasonsForChangingJob) || cleanText(payload.reasonsForChangingJobOther) || "No answer provided.")}</div>
          </div>
          <div class="block">
            <strong>Job Search Method</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.firstJobFindingWays) || cleanText(payload.firstJobFindingWaysOther) || "No answer provided.")}</div>
          </div>
          <div class="block">
            <strong>Unemployment Reasons</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.unemploymentReasons) || cleanText(payload.unemploymentReasonsOther) || "No answer provided.")}</div>
          </div>
          <div class="block">
            <strong>Useful Competencies Learned in College</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.usefulCompetencies) || cleanText(payload.usefulCompetenciesOther) || "No answer provided.")}</div>
          </div>
        </div>

        ${sectionTitle("CURRICULUM IMPROVEMENT SUGGESTIONS")}
        <div class="block text-block">${escapeHtml(cleanText(payload.curriculumSuggestions) || cleanText(record.comments) || "No suggestion provided.")}</div>

        ${sectionTitle("ALUMNI REFERRALS")}
        ${renderSimpleTable(
          ["Name", "Address", "Contact Number"],
          referralRows,
          "No referral entries were submitted.",
        )}

        <div class="footer">
          <span>Submitted: ${escapeHtml(record.submitted_at ? formatGeneratedDate(new Date(record.submitted_at)) : "Not recorded")}</span>
          <span>Prepared through the Alumni Management System tracer module.</span>
        </div>
      </div>
    </body>
  </html>`;
};

const detectExecutablePath = async () => {
  for (const candidate of EXECUTABLE_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue to next candidate.
    }
  }

  return undefined;
};

export const generateTracerPdfBuffer = async (record: TracerPdfRecord) => {
  const executablePath = await detectExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    const page = await browser.newPage();
    await page.setContent(renderTracerPdfHtml(record), { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12px",
        right: "12px",
        bottom: "12px",
        left: "12px",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};
