export const INSTITUTION_OFFICIAL_CATEGORY = "Institution Organization Chart";

export type InstitutionOfficialLevel = "municipal" | "executive" | "staff";

export type InstitutionOfficialSlot = {
  key: string;
  label: string;
  level: InstitutionOfficialLevel;
};

export const INSTITUTION_OFFICIAL_SLOTS: readonly InstitutionOfficialSlot[] = [
  { key: "municipal_mayor", label: "Municipal Mayor", level: "municipal" },
  { key: "municipal_vice_mayor", label: "Municipal Vice Mayor", level: "municipal" },
  { key: "local_chief_executive_chairman_bot", label: "Local Chief Executive / Chairman-BOT", level: "executive" },
  { key: "college_president", label: "College President", level: "executive" },
  { key: "assistant_to_president_instructor", label: "Asst. to the President/Instructor", level: "staff" },
  { key: "dean_college_of_education", label: "Dean, College of Education", level: "staff" },
  { key: "vp_admin", label: "VP Admin", level: "staff" },
  { key: "department_head_btled", label: "Dept. Head, BTLeD", level: "staff" },
  { key: "department_head_beced", label: "Dept. Head, BECeD", level: "staff" },
  { key: "department_head_bs_entrep", label: "Dept. Head, BS-ENTREP", level: "staff" },
  { key: "health_services", label: "Health Services", level: "staff" },
  { key: "dentist", label: "Dentist", level: "staff" },
  { key: "school_nurse", label: "School Nurse", level: "staff" },
  { key: "osa_college_counselor", label: "OSA/College Counselor", level: "staff" },
  { key: "registrar_ii", label: "Registrar II", level: "staff" },
  { key: "cashier_ii", label: "Cashier II", level: "staff" },
  { key: "librarian_i", label: "Librarian I", level: "staff" },
  { key: "computer_lab_incharge", label: "Computer Lab. In-Charge", level: "staff" },
  { key: "registrars_office_clerk", label: "Registrar's Office Clerk", level: "staff" },
  { key: "assistant_to_dsa", label: "Asst. to the DSA", level: "staff" },
  { key: "assistant_to_guidance_counselor", label: "Asst. to the Guidance Counselor", level: "staff" },
  { key: "communications", label: "Communications", level: "staff" },
  { key: "assistant_to_vp", label: "Asst. to the VP", level: "staff" },
  { key: "student_assistant_1", label: "Student Assistant", level: "staff" },
  { key: "student_assistant_2", label: "Student Assistant", level: "staff" },
] as const;

export const normalizeInstitutionPosition = (value: string) => value
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/\b(asst|assistant)\b/g, "assistant")
  .replace(/\b(dept|department)\b/g, "department")
  .replace(/\bin[ -]?charge\b/g, "incharge")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
