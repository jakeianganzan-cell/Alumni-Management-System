import fs from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";



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

const SCHOOL_NAME = "Salay Community College";

const loadPngDataUri = (candidates: string[]) => {
  for (const candidate of candidates) {
    try {
      const data = readFileSync(candidate);
      return `data:image/png;base64,${data.toString("base64")}`;
    } catch {
      // Continue to the next path; server cwd differs between dev scripts.
    }
  }

  return "";
};

const SACC_LOGO_DATA_URI = loadPngDataUri([
  path.resolve(process.cwd(), "src/assets/salay.png"),
  path.resolve(process.cwd(), "../src/assets/salay.png"),
]);

const CHED_SEAL_DATA_URI = loadPngDataUri([
  path.resolve(process.cwd(), "server/assets/ched-seal.png"),
  path.resolve(process.cwd(), "assets/ched-seal.png"),
  path.resolve(process.cwd(), "../server/assets/ched-seal.png"),
]);



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
    <span class="box">${checked ? "&#10003;" : ""}</span>
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

export const renderTracerPdfHtml = (record: TracerPdfRecord) => {
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
          user-select: none;
          -webkit-user-select: none;
        }

        .document {
          border: 1px solid #111827;
          padding: 14px 16px 18px;
        }

        .header {
          align-items: center;
          border-bottom: 2px solid #111827;
          display: grid;
          gap: 12px;
          grid-template-columns: 72px 1fr 150px;
          padding-bottom: 10px;
          margin-bottom: 12px;
          text-align: center;
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

        .seal-logo {
          align-items: center;
          border: 1px solid #111827;
          border-radius: 999px;
          display: flex;
          font-size: 14px;
          font-weight: 700;
          height: 64px;
          justify-content: center;
          overflow: hidden;
          width: 64px;
        }

        .seal-logo img {
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .ched-logo {
          align-items: center;
          display: flex;
          height: 52px;
          justify-content: flex-end;
          overflow: hidden;
          width: 150px;
        }

        .ched-logo img {
          height: 100%;
          object-fit: contain;
          width: 100%;
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

        .signature {
          margin-top: 22px;
          text-align: right;
        }

        .signature-line {
          border-top: 1px solid #111827;
          display: inline-block;
          min-width: 220px;
          padding-top: 4px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="document">
        <div class="header">
          <div class="seal-logo">${SACC_LOGO_DATA_URI ? `<img src="${SACC_LOGO_DATA_URI}" alt="SaCC logo" />` : "SaCC"}</div>
          <div>
            <p>REPUBLIC OF THE PHILIPPINES</p>
            <p>Commission on Higher Education</p>
            <h1>GRADUATE TRACER STUDY</h1>
            <h2>${escapeHtml(SCHOOL_NAME)} Alumni Graduate Tracer Form</h2>
          </div>
          <div class="ched-logo">${CHED_SEAL_DATA_URI ? `<img src="${CHED_SEAL_DATA_URI}" alt="CHED seal" />` : "CHED"}</div>
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
          "N/A",
        )}
        <div class="block">
          <strong>Reasons for Taking the Course:</strong>
          <div class="text-block">${escapeHtml(joinChoices(payload.reasonsForCourse) || cleanText(payload.reasonsForCourseOther) || "N/A")}</div>
        </div>
        ${renderSimpleTable(
          ["Professional Examination", "Date Taken", "Rating"],
          examRows,
          "N/A",
        )}

        ${sectionTitle("C. TRAININGS / ADVANCE STUDIES")}
        ${renderSimpleTable(
          ["Training / Advance Study", "Duration / Credits", "Institution"],
          trainingRows,
          "N/A",
        )}
        <div class="two-col">
          <div class="block">
            <strong>Advance Study Reason</strong>
            <div class="text-block">${escapeHtml(cleanText(payload.advanceStudyReason) || cleanText(payload.advanceStudyReasonOther) || "N/A")}</div>
          </div>
          <div class="block">
            <strong>Other Reason / Notes</strong>
            <div class="text-block">${escapeHtml(cleanText(payload.advanceStudyReasonOther) || "N/A")}</div>
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
            <div class="text-block">${escapeHtml(joinChoices(payload.reasonsForStaying) || cleanText(payload.reasonsForStayingOther) || "N/A")}</div>
          </div>
          <div class="block">
            <strong>Reasons for Accepting Job</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.reasonsForAcceptingJob) || cleanText(payload.reasonsForAcceptingJobOther) || "N/A")}</div>
          </div>
          <div class="block">
            <strong>Reasons for Changing Job</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.reasonsForChangingJob) || cleanText(payload.reasonsForChangingJobOther) || "N/A")}</div>
          </div>
          <div class="block">
            <strong>Job Search Method</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.firstJobFindingWays) || cleanText(payload.firstJobFindingWaysOther) || "N/A")}</div>
          </div>
          <div class="block">
            <strong>Unemployment Reasons</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.unemploymentReasons) || cleanText(payload.unemploymentReasonsOther) || "N/A")}</div>
          </div>
          <div class="block">
            <strong>Useful Competencies Learned in College</strong>
            <div class="text-block">${escapeHtml(joinChoices(payload.usefulCompetencies) || cleanText(payload.usefulCompetenciesOther) || "N/A")}</div>
          </div>
        </div>

        ${sectionTitle("CURRICULUM IMPROVEMENT SUGGESTIONS")}
        <div class="block text-block">${escapeHtml(cleanText(payload.curriculumSuggestions) || cleanText(record.comments) || "N/A")}</div>

        ${sectionTitle("E. CONTRIBUTION / ENGAGEMENT")}
        <div class="block text-block">${escapeHtml(cleanText(payload.contributionEngagement) || cleanText(payload.alumniEngagement) || "N/A")}</div>

        ${sectionTitle("ALUMNI REFERRALS")}
        ${renderSimpleTable(
          ["Name", "Address", "Contact Number"],
          referralRows,
          "N/A",
        )}

        <div class="signature">
          <span class="signature-line">${escapeHtml(cleanText(payload.fullName) || cleanText(record.name) || "N/A")}</span>
          <div>Signature over Printed Name</div>
        </div>

        <div class="footer">
          <span>Submitted: ${escapeHtml(record.submitted_at ? formatGeneratedDate(new Date(record.submitted_at)) : "Not recorded")}</span>
          <span>Prepared through the Alumni Management System tracer module.</span>
        </div>
      </div>
    </body>
  </html>`;
};

const normalizePortableText = (value: unknown) =>
  cleanText(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
    })
    .join("");

const pushLine = (lines: string[], label: string, value: unknown) => {
  const text = normalizePortableText(value);
  if (text) lines.push(`${label}: ${text}`);
};

const pushArrayLine = (lines: string[], label: string, value: unknown) => {
  const text = joinChoices(value);
  if (text) lines.push(`${label}: ${normalizePortableText(text)}`);
};

const buildTracerTextLines = (record: TracerPdfRecord) => {
  const payload = record.ched_payload ?? {};
  const lines: string[] = [
    "GRADUATE TRACER SURVEY",
    SCHOOL_NAME,
    `Generated: ${formatGeneratedDate()}`,
    "",
    "A. GENERAL INFORMATION",
  ];

  pushLine(lines, "Full Name", cleanText(payload.fullName) || record.name);
  pushLine(lines, "Permanent Address", payload.permanentAddress);
  pushLine(lines, "Email Address", cleanText(payload.email) || record.email);
  pushLine(lines, "Contact Number", payload.telephoneNumber || payload.mobileNumber);
  pushLine(lines, "Civil Status", payload.civilStatus);
  pushLine(lines, "Sex", payload.sex);
  pushLine(lines, "Birthday", formatBirthday(payload as Record<string, unknown>));
  pushLine(lines, "Region of Origin", payload.regionOfOrigin);
  pushLine(lines, "Province", payload.province);

  lines.push("", "B. EDUCATIONAL BACKGROUND");
  for (const entry of safeArray(payload.educationalAttainments)) {
    const row = entry as Record<string, unknown>;
    const text = [
      cleanText(row.degreeSpecialization) || cleanText(record.course),
      cleanText(row.school) || SCHOOL_NAME,
      cleanText(row.yearGraduated) || cleanText(record.batch),
      cleanText(row.honorsAwards),
    ].filter(Boolean).join(" | ");
    if (text) lines.push(normalizePortableText(text));
  }
  pushArrayLine(lines, "Reasons for Taking the Course", payload.reasonsForCourse);
  pushLine(lines, "Other Course Reason", payload.reasonsForCourseOther);

  const exams = safeArray(payload.professionalExams);
  if (exams.length) {
    lines.push("", "Professional Examinations");
    for (const entry of exams) {
      const row = entry as Record<string, unknown>;
      const text = [row.examName, row.dateTaken, row.rating].map(cleanText).filter(Boolean).join(" | ");
      if (text) lines.push(normalizePortableText(text));
    }
  }

  lines.push("", "C. TRAININGS / ADVANCE STUDIES");
  for (const entry of safeArray(payload.trainings)) {
    const row = entry as Record<string, unknown>;
    const text = [row.title, row.durationCredits, row.institution].map(cleanText).filter(Boolean).join(" | ");
    if (text) lines.push(normalizePortableText(text));
  }
  pushLine(lines, "Advance Study Reason", payload.advanceStudyReason);
  pushLine(lines, "Other Reason", payload.advanceStudyReasonOther);

  lines.push("", "D. EMPLOYMENT DATA");
  pushLine(lines, "Presently Employed", cleanText(payload.presentlyEmployed) || record.employment_status);
  pushLine(lines, "Employment Status", cleanText(payload.presentEmploymentStatus) || record.employment_status);
  pushLine(lines, "Present Occupation", cleanText(payload.presentOccupation) || record.job_title);
  pushLine(lines, "Company Name / Address", cleanText(payload.companyNameAddress) || record.company);
  pushLine(lines, "Business Industry", cleanText(payload.industry) || record.industry);
  pushLine(lines, "Place of Work", cleanText(payload.workLocation) || record.work_location);
  pushLine(lines, "Salary Range", cleanText(payload.initialGrossMonthlyEarning) || record.income);
  pushLine(lines, "First Job After College", payload.firstJobAfterCollege);
  pushLine(lines, "First Job Related to Course", payload.firstJobRelatedToCourse);
  pushLine(lines, "How Long to Land First Job", cleanText(payload.timeToLandFirstJob) || record.time_to_job);
  pushLine(lines, "Curriculum Relevant to First Job", cleanText(payload.curriculumRelevantToFirstJob) || record.relevance);
  pushArrayLine(lines, "Reasons for Staying", payload.reasonsForStaying);
  pushArrayLine(lines, "Reasons for Accepting Job", payload.reasonsForAcceptingJob);
  pushArrayLine(lines, "Reasons for Changing Job", payload.reasonsForChangingJob);
  pushArrayLine(lines, "Job Search Method", payload.firstJobFindingWays);
  pushArrayLine(lines, "Unemployment Reasons", payload.unemploymentReasons);
  pushArrayLine(lines, "Useful Competencies", payload.usefulCompetencies);
  pushLine(lines, "Curriculum Suggestions", cleanText(payload.curriculumSuggestions) || record.comments);
  pushLine(lines, "Contribution / Engagement", cleanText(payload.contributionEngagement) || cleanText(payload.alumniEngagement) || "N/A");

  const referrals = safeArray(payload.referrals);
  if (referrals.length) {
    lines.push("", "ALUMNI REFERRALS");
    for (const entry of referrals) {
      const row = entry as Record<string, unknown>;
      const text = [row.name, row.address, row.contactNumber].map(cleanText).filter(Boolean).join(" | ");
      if (text) lines.push(normalizePortableText(text));
    }
  }

  lines.push("", `Submitted: ${record.submitted_at ? formatGeneratedDate(new Date(record.submitted_at)) : "Not recorded"}`);
  lines.push(`Signature over Printed Name: ${cleanText(payload.fullName) || cleanText(record.name) || "N/A"}`);
  return lines;
};

const wrapLine = (line: string, maxLength = 92) => {
  if (line.length <= maxLength) return [line];
  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
};

const escapePdfText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export const generateTracerPortablePdfBuffer = (record: TracerPdfRecord) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 42;
  const startY = 790;
  const lineHeight = 15;
  const pageLines: string[][] = [[]];

  for (const sourceLine of buildTracerTextLines(record)) {
    const wrapped = sourceLine ? wrapLine(sourceLine) : [""];
    for (const line of wrapped) {
      const activePage = pageLines[pageLines.length - 1];
      if (activePage.length >= 48) {
        pageLines.push([]);
      }
      pageLines[pageLines.length - 1].push(line);
    }
  }

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectIds = pageLines.map((_, index) => 3 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageLines.length} >>`);

  pageLines.forEach((lines, pageIndex) => {
    const pageObjectId = 3 + pageIndex * 2;
    const contentObjectId = pageObjectId + 1;
    const content = [
      "BT",
      "/F1 10 Tf",
      "1 0 0 1 42 790 Tm",
      ...lines.map((line, index) => {
        const y = startY - index * lineHeight;
        const font = line === line.toUpperCase() && line.trim() ? "/F2 11 Tf" : "/F1 10 Tf";
        return `${font} 1 0 0 1 ${marginX} ${y} Tm (${escapePdfText(line)}) Tj`;
      }),
      "ET",
    ].join("\n");

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${pageLines.length * 2 + 3} 0 R /F2 ${pageLines.length * 2 + 4} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body, "ascii");
};

const crcTable = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

export const createStoredZipBuffer = (files: Array<{ name: string; data: Buffer | string }>) => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localFiles.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localFiles, centralDirectory, end]);
};

const escapeXml = (value: unknown) =>
  normalizePortableText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const paragraphXml = (text: string, bold = false) =>
  `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;

export const generateTracerDocxBuffer = (record: TracerPdfRecord) => {
  const documentBody = buildTracerTextLines(record)
    .map((line) => paragraphXml(line || " ", line === line.toUpperCase() && line.trim().length > 0))
    .join("");

  return createStoredZipBuffer([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: "word/document.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${documentBody}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`,
    },
    {
      name: "word/settings.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:documentProtection w:edit="readOnly" w:enforcement="1"/></w:settings>`,
    },
    {
      name: "word/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
    },
  ]);
};



export const generateTracerPdfBuffer = async (record: TracerPdfRecord) => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });




  try {
    const page = await browser.newPage();
    await page.setContent(renderTracerPdfHtml(record), { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
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
