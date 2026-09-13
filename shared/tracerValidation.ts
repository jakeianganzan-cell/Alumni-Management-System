export type TracerValidationErrors = Record<string, string>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/;
const PHILIPPINE_MOBILE_PATTERN = /^(?:(?:\+63|63|0)?9\d{9})$/;
const YEAR_PATTERN = /^(19|20)\d{2}$/;
const EMPLOYMENT_STATES = new Set(["Employed", "Not Employed", "Never Employed"]);
const BINARY_ANSWERS = new Set(["Yes", "No"]);
const WORK_LOCATIONS = new Set(["Local", "Abroad"]);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const list = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const rows = (value: unknown) => Array.isArray(value) ? value.map(asRecord) : [];
const isFilledRow = (row: Record<string, unknown>) => Object.values(row).some((value) => text(value) !== "");
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const parseMonth = (value: unknown) => {
  const candidate = text(value).toLowerCase();
  const namedMonth = MONTH_NAMES.indexOf(candidate);
  if (namedMonth >= 0) return namedMonth + 1;
  if (!/^\d{1,2}$/.test(candidate)) return null;
  const numericMonth = Number(candidate);
  return numericMonth >= 1 && numericMonth <= 12 ? numericMonth : null;
};

export const validateTracerPayload = (input: unknown): TracerValidationErrors => {
  const payload = asRecord(input);
  const errors: TracerValidationErrors = {};

  if (Object.keys(payload).length === 0) {
    return { fullName: "A valid Graduate Tracer form is required." };
  }

  const requireText = (field: string, message = "This field is required.") => {
    if (!text(payload[field])) errors[field] = message;
  };

  for (const field of [
    "fullName",
    "permanentAddress",
    "email",
    "mobileNumber",
    "civilStatus",
    "sex",
    "birthdayMonth",
    "birthdayDay",
    "birthdayYear",
    "regionOfOrigin",
    "province",
    "residenceType",
    "presentlyEmployed",
  ]) {
    requireText(field);
  }

  const email = text(payload.email);
  const mobileNumber = text(payload.mobileNumber);
  const telephoneNumber = text(payload.telephoneNumber);
  const birthdayMonth = parseMonth(payload.birthdayMonth);
  const birthdayYear = text(payload.birthdayYear);
  const birthdayYearNumber = Number(birthdayYear);
  const birthdayDay = Number(text(payload.birthdayDay));
  const currentYear = new Date().getFullYear();

  if (email && !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (mobileNumber && !PHILIPPINE_MOBILE_PATTERN.test(mobileNumber.replace(/[\s()-]/g, ""))) {
    errors.mobileNumber = "Enter a valid Philippine mobile number.";
  }
  if (telephoneNumber && !PHONE_PATTERN.test(telephoneNumber)) errors.telephoneNumber = "Enter a valid contact number.";
  if (text(payload.birthdayMonth) && birthdayMonth === null) errors.birthdayMonth = "Enter a valid birthday month.";
  if (birthdayYear && (!YEAR_PATTERN.test(birthdayYear) || birthdayYearNumber > currentYear)) {
    errors.birthdayYear = "Enter a valid non-future 4-digit year.";
  }
  if (text(payload.birthdayDay) && (!Number.isInteger(birthdayDay) || birthdayDay < 1 || birthdayDay > 31)) {
    errors.birthdayDay = "Enter a valid birthday day.";
  }
  if (
    birthdayMonth !== null
    && YEAR_PATTERN.test(birthdayYear)
    && birthdayYearNumber <= currentYear
    && Number.isInteger(birthdayDay)
    && birthdayDay >= 1
    && birthdayDay <= 31
  ) {
    const birthday = new Date(Date.UTC(birthdayYearNumber, birthdayMonth - 1, birthdayDay));
    const isImpossibleDate = birthday.getUTCFullYear() !== birthdayYearNumber
      || birthday.getUTCMonth() !== birthdayMonth - 1
      || birthday.getUTCDate() !== birthdayDay;
    if (isImpossibleDate || birthday.getTime() > Date.now()) errors.birthdayDay = "Enter a valid birthday date.";
  }
  if (text(payload.residenceType) && !["City", "Municipality"].includes(text(payload.residenceType))) {
    errors.residenceType = "Select a valid residence type.";
  }

  const educationRows = rows(payload.educationalAttainments).filter(isFilledRow);
  if (educationRows.length === 0) {
    errors.educationalAttainments = "At least one educational attainment entry is required.";
  } else if (educationRows.some((row) =>
    !text(row.degreeSpecialization)
    || !text(row.school)
    || !YEAR_PATTERN.test(text(row.yearGraduated))
    || Number(text(row.yearGraduated)) > currentYear)) {
    errors.educationalAttainments = "Each educational attainment row must include degree and specialization, school, and a valid non-future year graduated.";
  }

  const courseReasons = list(payload.reasonsForCourse);
  if (courseReasons.includes("Others") && !text(payload.reasonsForCourseOther)) {
    errors.reasonsForCourseOther = "Specify the other reason for taking the course.";
  }

  const trainingRows = rows(payload.trainings).filter(isFilledRow);
  if (trainingRows.some((row) => !text(row.title) || !text(row.durationCredits) || !text(row.institution))) {
    errors.trainings = "Complete title, duration or credits, and institution for each training row.";
  }

  if (text(payload.advanceStudyReason) === "Others" && !text(payload.advanceStudyReasonOther)) {
    errors.advanceStudyReasonOther = "Specify the other reason for advance studies.";
  }

  const presentlyEmployed = text(payload.presentlyEmployed);
  if (presentlyEmployed && !EMPLOYMENT_STATES.has(presentlyEmployed)) {
    errors.presentlyEmployed = "Select a valid employment status.";
  }

  if (presentlyEmployed && presentlyEmployed !== "Employed") {
    const unemploymentReasons = list(payload.unemploymentReasons);
    if (unemploymentReasons.length === 0) errors.unemploymentReasons = "Select at least one unemployment reason.";
    if (unemploymentReasons.includes("Other reason(s)") && !text(payload.unemploymentReasonsOther)) {
      errors.unemploymentReasonsOther = "Specify the other unemployment reason.";
    }
  }

  if (presentlyEmployed === "Employed") {
    for (const field of ["presentEmploymentStatus", "presentOccupation", "industry", "workLocation", "firstJobAfterCollege"]) {
      requireText(field);
    }

    if (text(payload.workLocation) && !WORK_LOCATIONS.has(text(payload.workLocation))) {
      errors.workLocation = "Select a valid work location.";
    }
    if (text(payload.firstJobAfterCollege) && !BINARY_ANSWERS.has(text(payload.firstJobAfterCollege))) {
      errors.firstJobAfterCollege = "Select Yes or No.";
    }
    if (text(payload.presentEmploymentStatus) === "Self-employed" && !text(payload.selfEmployedSkills)) {
      errors.selfEmployedSkills = "Describe the skills applied in self-employment.";
    }

    if (text(payload.firstJobAfterCollege) === "Yes") {
      const reasonsForStaying = list(payload.reasonsForStaying);
      if (reasonsForStaying.length === 0) errors.reasonsForStaying = "Select at least one reason for staying on the job.";
      if (reasonsForStaying.includes("Other reason(s)") && !text(payload.reasonsForStayingOther)) {
        errors.reasonsForStayingOther = "Specify the other reason for staying.";
      }
    }

    requireText("firstJobRelatedToCourse");
    if (text(payload.firstJobRelatedToCourse) && !BINARY_ANSWERS.has(text(payload.firstJobRelatedToCourse))) {
      errors.firstJobRelatedToCourse = "Select Yes or No.";
    }

    if (text(payload.firstJobRelatedToCourse) === "Yes") {
      const reasonsForAcceptingJob = list(payload.reasonsForAcceptingJob);
      if (reasonsForAcceptingJob.length === 0) errors.reasonsForAcceptingJob = "Select at least one reason for accepting the job.";
      if (reasonsForAcceptingJob.includes("Other reason(s)") && !text(payload.reasonsForAcceptingJobOther)) {
        errors.reasonsForAcceptingJobOther = "Specify the other reason for accepting the job.";
      }
    }

    if (text(payload.firstJobAfterCollege) === "No" || text(payload.firstJobRelatedToCourse) === "No") {
      const reasonsForChangingJob = list(payload.reasonsForChangingJob);
      if (reasonsForChangingJob.length === 0) errors.reasonsForChangingJob = "Select at least one reason for changing job.";
      if (reasonsForChangingJob.includes("Other reason(s)") && !text(payload.reasonsForChangingJobOther)) {
        errors.reasonsForChangingJobOther = "Specify the other reason for changing job.";
      }
    }

    for (const field of [
      "firstJobDuration",
      "timeToLandFirstJob",
      "jobLevelFirstJob",
      "jobLevelCurrentJob",
      "initialGrossMonthlyEarning",
      "curriculumRelevantToFirstJob",
    ]) {
      requireText(field);
    }

    if (text(payload.firstJobDuration) === "Others" && !text(payload.firstJobDurationOther)) {
      errors.firstJobDurationOther = "Specify the other duration.";
    }

    const findingWays = list(payload.firstJobFindingWays);
    if (findingWays.length === 0) errors.firstJobFindingWays = "Select at least one job search method.";
    if (findingWays.includes("Others") && !text(payload.firstJobFindingWaysOther)) {
      errors.firstJobFindingWaysOther = "Specify the other job search method.";
    }

    if (text(payload.timeToLandFirstJob) === "Others" && !text(payload.timeToLandFirstJobOther)) {
      errors.timeToLandFirstJobOther = "Specify the other timeline.";
    }

    if (text(payload.curriculumRelevantToFirstJob) === "Yes") {
      const competencies = list(payload.usefulCompetencies);
      if (competencies.length === 0) errors.usefulCompetencies = "Select at least one useful competency.";
      if (competencies.includes("Other skills") && !text(payload.usefulCompetenciesOther)) {
        errors.usefulCompetenciesOther = "Specify the other useful skill.";
      }
    }
  }

  const referralRows = rows(payload.referrals).filter(isFilledRow);
  if (referralRows.some((row) => !text(row.name) || !text(row.address) || !text(row.contactNumber))) {
    errors.referrals = "Complete name, address, and contact number for each alumni referral row.";
  }

  return errors;
};
