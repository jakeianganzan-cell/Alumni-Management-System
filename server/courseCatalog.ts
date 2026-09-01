export interface CourseOption {
  code: string;
  label: string;
  description?: string;
  department?: string;
  imageUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
  chairmanEmail: string;
  chairmanName: string;
  chairmanPassword: string;
}

const getEnvValue = (name: string) => process.env[name]?.trim() || "";

export const COURSE_OPTIONS: CourseOption[] = [
  {
    code: "BTLED",
    label: "Bachelor of Technology and Livelihood Education (BTLED)",
    chairmanEmail: "chairman.btled@salaycc.local",
    chairmanName: "BTLED Department Chairman",
    chairmanPassword: getEnvValue("CHAIRMAN_BTLED_PASSWORD"),
  },
  {
    code: "BECED",
    label: "Bachelor of Early Childhood Education (BECED)",
    chairmanEmail: "chairman.beced@salaycc.local",
    chairmanName: "BECED Department Chairman",
    chairmanPassword: getEnvValue("CHAIRMAN_BECED_PASSWORD"),
  },
  {
    code: "BS ENTREP",
    label: "Bachelor of Science in Entrepreneurship (BS ENTREP)",
    chairmanEmail: "chairman.bsentrep@salaycc.local",
    chairmanName: "BS ENTREP Department Chairman",
    chairmanPassword: getEnvValue("CHAIRMAN_BSENTREP_PASSWORD"),
  },
  {
    code: "BSM",
    label: "Bachelor of Science in Midwifery (BSM)",
    chairmanEmail: "chairman.bsm@salaycc.local",
    chairmanName: "BSM Department Chairman",
    chairmanPassword: getEnvValue("CHAIRMAN_BSM_PASSWORD"),
  },
];

export type CourseCode = string;

const COURSE_ALIASES: Record<string, string> = {
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

const normalizeCourseKey = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");

export const normalizeCourseOptions = (value: unknown): CourseOption[] => {
  const source = Array.isArray(value) ? value : COURSE_OPTIONS;
  const seen = new Set<string>();
  const normalized: CourseOption[] = [];

  const getChairmanFields = (code: string, item: unknown) => {
    const partial = typeof item === "object" && item !== null ? item as Partial<CourseOption> : {};
    const fallback = COURSE_OPTIONS.find((option) => normalizeCourseKey(option.code) === code);
    return {
      chairmanEmail: partial.chairmanEmail || fallback?.chairmanEmail || "",
      chairmanName: partial.chairmanName || fallback?.chairmanName || "",
      chairmanPassword: partial.chairmanPassword || fallback?.chairmanPassword || "",
    };
  };

  for (const [index, item] of source.entries()) {
    const partial = typeof item === "object" && item !== null ? item as Partial<CourseOption> : {};
    const rawCode = typeof item === "string" ? item : String((item as Partial<CourseOption> | null)?.code || "");
    const code = normalizeCourseKey(rawCode);
    const rawLabel = typeof item === "string" ? item : String((item as Partial<CourseOption> | null)?.label || "");
    const label = rawLabel.trim().replace(/\s+/g, " ") || code;

    if (!code || seen.has(code)) continue;
    seen.add(code);
    normalized.push({
      code,
      label,
      description: String(partial.description || "").trim(),
      department: String(partial.department || "").trim(),
      imageUrl: String(partial.imageUrl || "").trim(),
      displayOrder: Number.isFinite(Number(partial.displayOrder)) ? Number(partial.displayOrder) : index,
      isActive: partial.isActive !== false,
      ...getChairmanFields(code, item),
    });
  }

  return normalized.length > 0 ? normalized : COURSE_OPTIONS.map(({ code, label, chairmanEmail, chairmanName, chairmanPassword }) => ({ code, label, chairmanEmail, chairmanName, chairmanPassword }));
};

export const getCourseLabels = (options: CourseOption[] = COURSE_OPTIONS): Record<string, string> =>
  normalizeCourseOptions(options).reduce<Record<string, string>>((labels, option) => {
    labels[option.code] = option.label;
    return labels;
  }, {});

export const COURSE_LABELS = getCourseLabels(COURSE_OPTIONS);
export const SYSTEM_COURSES = COURSE_OPTIONS.map((option) => option.code);
export const SYSTEM_COURSE_SET = new Set<string>(SYSTEM_COURSES);

export const normalizeCourseCode = (value: unknown, options: CourseOption[] = COURSE_OPTIONS): CourseCode | null => {
  const normalized = normalizeCourseKey(String(value || ""));
  if (!normalized) return null;

  const courseOptions = normalizeCourseOptions(options);
  const directMatch = courseOptions.find((option) => normalizeCourseKey(option.code) === normalized);
  if (directMatch) return directMatch.code;

  const labelMatch = courseOptions.find((option) => normalizeCourseKey(option.label) === normalized);
  if (labelMatch) return labelMatch.code;

  const aliasMatch = COURSE_ALIASES[normalized];
  if (aliasMatch && courseOptions.some((option) => option.code === aliasMatch)) return aliasMatch;

  return null;
};

export const isSupportedCourse = (value: unknown, options: CourseOption[] = COURSE_OPTIONS): value is CourseCode => {
  const normalized = normalizeCourseCode(value, options);
  return normalized !== null;
};
