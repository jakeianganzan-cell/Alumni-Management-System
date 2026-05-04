export const COURSE_OPTIONS = [
  {
    code: "BTLED",
    label: "Bachelor of Technology and Livelihood Education (BTLED)",
    chairmanEmail: "chairman.btled@salaycc.local",
    chairmanName: "BTLED Department Chairman",
    chairmanPassword: "ChairmanBTLED2026!",
  },
  {
    code: "BECED",
    label: "Bachelor of Early Childhood Education (BECED)",
    chairmanEmail: "chairman.beced@salaycc.local",
    chairmanName: "BECED Department Chairman",
    chairmanPassword: "ChairmanBECED2026!",
  },
  {
    code: "BS ENTREP",
    label: "Bachelor of Science in Entrepreneurship (BS ENTREP)",
    chairmanEmail: "chairman.bsentrep@salaycc.local",
    chairmanName: "BS ENTREP Department Chairman",
    chairmanPassword: "ChairmanBSENTREP2026!",
  },
  {
    code: "BSM",
    label: "Bachelor of Science in Midwifery (BSM)",
    chairmanEmail: "chairman.bsm@salaycc.local",
    chairmanName: "BSM Department Chairman",
    chairmanPassword: "ChairmanBSM2026!",
  },
] as const;

export type CourseCode = (typeof COURSE_OPTIONS)[number]["code"];

const COURSE_ALIASES: Record<string, CourseCode> = {
  BTLED: "BTLED",
  "BACHELOR OF TECHNOLOGY AND LIVELIHOOD EDUCATION": "BTLED",
  BECED: "BECED",
  "BACHELOR OF EARLY CHILDHOOD EDUCATION": "BECED",
  "BS ENTREP": "BS ENTREP",
  BSENTREP: "BS ENTREP",
  "BACHELOR OF SCIENCE IN ENTREPRENEURSHIP": "BS ENTREP",
  BSM: "BSM",
  "BACHELOR OF SCIENCE IN MIDWIFERY": "BSM",
};

export const COURSE_LABELS: Record<CourseCode, string> = COURSE_OPTIONS.reduce(
  (labels, option) => {
    labels[option.code] = option.label;
    return labels;
  },
  {} as Record<CourseCode, string>,
);

export const SYSTEM_COURSES = COURSE_OPTIONS.map((option) => option.code);
export const SYSTEM_COURSE_SET = new Set<string>(SYSTEM_COURSES);

const normalizeCourseKey = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");

export const normalizeCourseCode = (value: unknown): CourseCode | null => {
  const normalized = normalizeCourseKey(String(value || ""));
  if (!normalized) return null;
  return COURSE_ALIASES[normalized] || null;
};

export const isSupportedCourse = (value: unknown): value is CourseCode => {
  const normalized = normalizeCourseCode(value);
  return normalized !== null;
};
