export interface CourseOption {
  code: string;
  label: string;
  description?: string;
  department?: string;
  imageUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export const COURSE_OPTIONS: CourseOption[] = [
  {
    code: "BTLED",
    label: "Bachelor of Technology and Livelihood Education (BTLED)",
  },
  {
    code: "BECED",
    label: "Bachelor of Early Childhood Education (BECED)",
  },
  {
    code: "BS ENTREP",
    label: "Bachelor of Science in Entrepreneurship (BS ENTREP)",
  },
  {
    code: "BSM",
    label: "Bachelor of Science in Midwifery (BSM)",
  },
];

export type CourseCode = string;

export const normalizeCourseKey = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");

export const normalizeCourseOptions = (value: unknown): CourseOption[] => {
  const source = Array.isArray(value) ? value : COURSE_OPTIONS;
  const seen = new Set<string>();
  const normalized: CourseOption[] = [];

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
    });
  }

  return normalized.length > 0 ? normalized : COURSE_OPTIONS;
};

export const getCourseLabels = (options: CourseOption[] = COURSE_OPTIONS): Record<string, string> =>
  normalizeCourseOptions(options).reduce<Record<string, string>>((labels, option) => {
    labels[option.code] = option.label;
    return labels;
  }, {});

export const COURSE_LABELS = getCourseLabels(COURSE_OPTIONS);
export const SYSTEM_COURSES = COURSE_OPTIONS.map((option) => option.code);
export const ALL_COURSES_OPTION = "All Courses";

export const findCourseOption = (value: unknown, options: CourseOption[] = COURSE_OPTIONS) => {
  const normalized = normalizeCourseKey(String(value || ""));
  if (!normalized) return null;

  return normalizeCourseOptions(options).find((option) =>
    normalizeCourseKey(option.code) === normalized || normalizeCourseKey(option.label) === normalized
  ) || null;
};

export const formatCourseLabel = (value: string | null | undefined, options: CourseOption[] = COURSE_OPTIONS) => {
  if (!value) return "";
  return findCourseOption(value, options)?.label ?? value;
};
