export const COURSE_OPTIONS = [
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
] as const;

export type CourseCode = (typeof COURSE_OPTIONS)[number]["code"];

export const COURSE_LABELS: Record<CourseCode, string> = COURSE_OPTIONS.reduce(
  (labels, option) => {
    labels[option.code] = option.label;
    return labels;
  },
  {} as Record<CourseCode, string>,
);

export const SYSTEM_COURSES = COURSE_OPTIONS.map((option) => option.code);
export const ALL_COURSES_OPTION = "All Courses";

export const formatCourseLabel = (value: string | null | undefined) => {
  if (!value) return "";
  return COURSE_LABELS[value as CourseCode] ?? value;
};
