export type ResidenceType = "City" | "Municipality" | "";
export type BinaryAnswer = "Yes" | "No" | "";
export type EmploymentState = "Employed" | "Not Employed" | "Never Employed" | "";
export type WorkLocationType = "Local" | "Abroad" | "";
export type JobLevel = "Rank or Clerical" | "Professional, Technical or Supervisory" | "Managerial or Executive" | "Self-employed" | "";

export interface EducationalAttainmentRow {
  degreeSpecialization: string;
  school: string;
  yearGraduated: string;
  honorsAwards: string;
}

export interface ProfessionalExamRow {
  examName: string;
  dateTaken: string;
  rating: string;
}

export interface TrainingRow {
  title: string;
  durationCredits: string;
  institution: string;
}

export interface ReferralRow {
  name: string;
  address: string;
  contactNumber: string;
}

export interface TracerFormValues {
  fullName: string;
  permanentAddress: string;
  email: string;
  telephoneNumber: string;
  mobileNumber: string;
  civilStatus: string;
  sex: string;
  birthdayMonth: string;
  birthdayDay: string;
  birthdayYear: string;
  regionOfOrigin: string;
  province: string;
  residenceType: ResidenceType;

  educationalAttainments: EducationalAttainmentRow[];
  professionalExams: ProfessionalExamRow[];
  reasonsForCourse: string[];
  reasonsForCourseOther: string;

  trainings: TrainingRow[];
  advanceStudyReason: string;
  advanceStudyReasonOther: string;

  presentlyEmployed: EmploymentState;
  unemploymentReasons: string[];
  unemploymentReasonsOther: string;
  presentEmploymentStatus: string;
  selfEmployedSkills: string;
  presentOccupation: string;
  companyNameAddress: string;
  industry: string;
  workLocation: WorkLocationType;
  firstJobAfterCollege: BinaryAnswer;
  reasonsForStaying: string[];
  reasonsForStayingOther: string;
  firstJobRelatedToCourse: BinaryAnswer;
  reasonsForAcceptingJob: string[];
  reasonsForAcceptingJobOther: string;
  reasonsForChangingJob: string[];
  reasonsForChangingJobOther: string;
  firstJobDuration: string;
  firstJobDurationOther: string;
  firstJobFindingWays: string[];
  firstJobFindingWaysOther: string;
  timeToLandFirstJob: string;
  timeToLandFirstJobOther: string;
  jobLevelFirstJob: JobLevel;
  jobLevelCurrentJob: JobLevel;
  initialGrossMonthlyEarning: string;
  curriculumRelevantToFirstJob: BinaryAnswer;
  usefulCompetencies: string[];
  usefulCompetenciesOther: string;
  curriculumSuggestions: string;

  referrals: ReferralRow[];
}

export type TracerFormField = keyof TracerFormValues;
export type TracerFormErrors = Partial<Record<TracerFormField, string>>;
export type TracerStepId = "sectionA" | "sectionB" | "sectionC" | "sectionD";
export type TracerTableField = "educationalAttainments" | "professionalExams" | "trainings" | "referrals";

export interface TracerSectionProps {
  form: TracerFormValues;
  errors: TracerFormErrors;
  setField: (field: TracerFormField, value: string) => void;
  toggleArrayValue: (field: TracerFormField, value: string) => void;
  addTableRow: (field: TracerTableField) => void;
  removeTableRow: (field: TracerTableField, index: number) => void;
  updateTableRow: (field: TracerTableField, index: number, key: string, value: string) => void;
  onNext?: () => void;
  onBack?: () => void;
  onSubmit?: () => void;
  submitting?: boolean;
  hasExistingResponse?: boolean;
}

export interface TracerSectionDProps extends TracerSectionProps {
  options: {
    employmentStatuses: string[];
    courseReasons: string[];
    advanceStudyReasons: string[];
    unemploymentReasons: string[];
    stayingReasons: string[];
    acceptingReasons: string[];
    changingReasons: string[];
    findingWays: string[];
    durationOptions: string[];
    timeToJobOptions: string[];
    jobLevels: JobLevel[];
    incomeRanges: string[];
    competencies: string[];
    businessLines: string[];
    workLocations: WorkLocationType[];
  };
}

export interface TracerApiRecord {
  id?: number | string;
  user_id?: string;
  employment_status?: string | null;
  job_title?: string | null;
  company?: string | null;
  industry?: string | null;
  work_location?: string | null;
  income?: string | null;
  time_to_job?: string | null;
  relevance?: string | null;
  further_studies?: string | null;
  certifications?: string | null;
  comments?: string | null;
  ched_payload?: string | TracerFormValues | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  name?: string | null;
  course?: string | null;
  batch?: string | null;
}

export interface TracerApiPayload {
  employment_status: string;
  job_title: string;
  company: string;
  industry: string;
  work_location: string;
  income: string;
  relevance: string;
  time_to_job: string;
  further_studies: string;
  certifications: string;
  comments: string;
  ched_payload: TracerFormValues;
}

export const TRACER_STEPS: Array<{ id: TracerStepId; title: string; description: string }> = [
  { id: "sectionA", title: "Section A", description: "General information" },
  { id: "sectionB", title: "Section B", description: "Educational background" },
  { id: "sectionC", title: "Section C", description: "Training and advance studies" },
  { id: "sectionD", title: "Section D", description: "Employment and referrals" },
];

export const REGION_OPTIONS = [
  "Region 1",
  "Region 2",
  "Region 3",
  "Region 4",
  "Region 5",
  "Region 6",
  "Region 7",
  "Region 8",
  "Region 9",
  "Region 10",
  "Region 11",
  "Region 12",
  "NCR",
  "CAR",
  "ARMM",
  "CARAGA",
];

export const CIVIL_STATUS_OPTIONS = ["Single", "Married", "Separated", "Widow or Widower", "Single Parent"];
export const SEX_OPTIONS = ["Male", "Female"];
export const RESIDENCE_TYPE_OPTIONS: ResidenceType[] = ["City", "Municipality", ""];
export const WORK_LOCATION_OPTIONS: WorkLocationType[] = ["Local", "Abroad", ""];

export const COURSE_REASON_OPTIONS = [
  "High grades in the course or subject area(s) related to the course",
  "Good grades in high school",
  "Influence of parents or relatives",
  "Peer influence",
  "Inspired by a role model",
  "Strong passion for the profession",
  "Prospect for immediate employment",
  "Status or prestige of the profession",
  "Availability of course offering in chosen institution",
  "Prospect of career advancement",
  "Affordable for the family",
  "Prospect of attractive compensation",
  "Opportunity for employment abroad",
  "No particular choice or no better idea",
  "Others",
];

export const ADVANCE_STUDY_REASON_OPTIONS = ["For promotion", "For professional development", "Others"];

export const EMPLOYMENT_STATUSES = ["Regular or Permanent", "Contractual", "Temporary", "Self-employed", "Casual"];

export const UNEMPLOYMENT_REASON_OPTIONS = [
  "Advance or further study",
  "No job opportunity",
  "Family concern and decided not to find a job",
  "Did not look for a job",
  "Health-related reason(s)",
  "Lack of work experience",
  "Other reason(s)",
];

export const STAYING_REASON_OPTIONS = [
  "Salaries and benefits",
  "Career challenge",
  "Related to special skill",
  "Related to course or program of study",
  "Proximity to residence",
  "Peer influence",
  "Family influence",
  "Other reason(s)",
];

export const ACCEPTING_REASON_OPTIONS = ["Salaries & benefits", "Career challenge", "Related to special skills", "Proximity to residence", "Other reason(s)"];
export const CHANGING_REASON_OPTIONS = ["Salaries & benefits", "Career challenge", "Related to special skills", "Proximity to residence", "Other reason(s)"];

export const FINDING_WAY_OPTIONS = [
  "Response to an advertisement",
  "As walk-in applicant",
  "Recommended by someone",
  "Information from friends",
  "Arranged by school's job placement officer",
  "Family business",
  "Job Fair or Public Employment Service Office (PESO)",
  "Others",
];

export const DURATION_OPTIONS = [
  "Less than a month",
  "1 to 6 months",
  "7 to 11 months",
  "1 year to less than 2 years",
  "2 years to less than 3 years",
  "3 years to less than 4 years",
  "Others",
];

export const TIME_TO_JOB_OPTIONS = [
  "Less than a month",
  "1 to 6 months",
  "7 to 11 months",
  "1 year to less than 2 years",
  "2 years to less than 3 years",
  "3 years to less than 4 years",
  "Others",
];

export const JOB_LEVEL_OPTIONS: JobLevel[] = [
  "Rank or Clerical",
  "Professional, Technical or Supervisory",
  "Managerial or Executive",
  "Self-employed",
  "",
];

export const INCOME_RANGES = [
  "Below P5,000.00",
  "P5,000.00 to less than P10,000.00",
  "P10,000.00 to less than P15,000.00",
  "P15,000.00 to less than P20,000.00",
  "P20,000.00 to less than P25,000.00",
  "P25,000.00 and above",
];

export const USEFUL_COMPETENCY_OPTIONS = [
  "Communication skills",
  "Human Relations skills",
  "Entrepreneurial skills",
  "Information Technology skills",
  "Problem-solving skills",
  "Critical Thinking skills",
  "Other skills",
];

export const BUSINESS_LINE_OPTIONS = [
  "Agriculture, Hunting and Forestry",
  "Fishing",
  "Mining and Quarrying",
  "Manufacturing",
  "Electricity, Gas and Water Supply",
  "Construction",
  "Wholesale and Retail Trade, repair of motor vehicles, motorcycles and personal and household goods",
  "Hotels and Restaurants",
  "Transport Storage and Communication",
  "Financial Intermediation",
  "Real Estate, Renting and Business Activities",
  "Public Administration and Defense; Compulsory Social Security",
  "Education",
  "Health and Social Work",
  "Other Community, Social and Personal Service Activities",
  "Private Households with Employed Persons",
  "Extra-territorial Organizations and Bodies",
];

export const createEmptyEducationRow = (): EducationalAttainmentRow => ({
  degreeSpecialization: "",
  school: "",
  yearGraduated: "",
  honorsAwards: "",
});

export const createEmptyProfessionalExamRow = (): ProfessionalExamRow => ({
  examName: "",
  dateTaken: "",
  rating: "",
});

export const createEmptyTrainingRow = (): TrainingRow => ({
  title: "",
  durationCredits: "",
  institution: "",
});

export const createEmptyReferralRow = (): ReferralRow => ({
  name: "",
  address: "",
  contactNumber: "",
});

export const createEmptyTracerForm = (defaults?: Partial<TracerFormValues>): TracerFormValues => ({
  fullName: "",
  permanentAddress: "",
  email: "",
  telephoneNumber: "",
  mobileNumber: "",
  civilStatus: "",
  sex: "",
  birthdayMonth: "",
  birthdayDay: "",
  birthdayYear: "",
  regionOfOrigin: "",
  province: "",
  residenceType: "",
  educationalAttainments: [createEmptyEducationRow()],
  professionalExams: [createEmptyProfessionalExamRow()],
  reasonsForCourse: [],
  reasonsForCourseOther: "",
  trainings: [createEmptyTrainingRow()],
  advanceStudyReason: "",
  advanceStudyReasonOther: "",
  presentlyEmployed: "",
  unemploymentReasons: [],
  unemploymentReasonsOther: "",
  presentEmploymentStatus: "",
  selfEmployedSkills: "",
  presentOccupation: "",
  companyNameAddress: "",
  industry: "",
  workLocation: "",
  firstJobAfterCollege: "",
  reasonsForStaying: [],
  reasonsForStayingOther: "",
  firstJobRelatedToCourse: "",
  reasonsForAcceptingJob: [],
  reasonsForAcceptingJobOther: "",
  reasonsForChangingJob: [],
  reasonsForChangingJobOther: "",
  firstJobDuration: "",
  firstJobDurationOther: "",
  firstJobFindingWays: [],
  firstJobFindingWaysOther: "",
  timeToLandFirstJob: "",
  timeToLandFirstJobOther: "",
  jobLevelFirstJob: "",
  jobLevelCurrentJob: "",
  initialGrossMonthlyEarning: "",
  curriculumRelevantToFirstJob: "",
  usefulCompetencies: [],
  usefulCompetenciesOther: "",
  curriculumSuggestions: "",
  referrals: [createEmptyReferralRow()],
  ...defaults,
});
