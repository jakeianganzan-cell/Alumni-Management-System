import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import SectionA from "./SectionA";
import SectionB from "./SectionB";
import SectionC from "./SectionC";
import SectionD from "./SectionD";
import {
  ACCEPTING_REASON_OPTIONS,
  ADVANCE_STUDY_REASON_OPTIONS,
  BUSINESS_LINE_OPTIONS,
  CHANGING_REASON_OPTIONS,
  COURSE_REASON_OPTIONS,
  createEmptyEducationRow,
  createEmptyProfessionalExamRow,
  createEmptyReferralRow,
  createEmptyTracerForm,
  createEmptyTrainingRow,
  DURATION_OPTIONS,
  EMPLOYMENT_STATUSES,
  FINDING_WAY_OPTIONS,
  INCOME_RANGES,
  JOB_LEVEL_OPTIONS,
  STAYING_REASON_OPTIONS,
  TIME_TO_JOB_OPTIONS,
  TRACER_STEPS,
  UNEMPLOYMENT_REASON_OPTIONS,
  USEFUL_COMPETENCY_OPTIONS,
  WORK_LOCATION_OPTIONS,
  type TracerFormErrors,
  type TracerFormField,
  type TracerFormValues,
  type TracerStepId,
  type TracerTableField,
} from "./tracer-form-types";

const AUTOSAVE_KEY = "ched-tracer-draft-v3";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+\-\s()]{7,20}$/;
const yearPattern = /^(19|20)\d{2}$/;

interface TracerEnvelope {
  submission: null | {
    id: number | string;
    user_id: string;
    ched_payload?: TracerFormValues | null;
    submitted_at?: string | null;
    allow_resubmission?: boolean | number | null;
    submission_status?: string | null;
    pdf_generated_at?: string | null;
  };
  draft: null | {
    id: number | string;
    user_id: string;
    ched_payload?: TracerFormValues | null;
    updated_at?: string | null;
  };
  allowResubmission: boolean;
  canSubmit: boolean;
}

function readDraft(defaults: Partial<TracerFormValues>) {
  if (typeof window === "undefined") return createEmptyTracerForm(defaults);
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return createEmptyTracerForm(defaults);
    return createEmptyTracerForm({
      ...defaults,
      ...(JSON.parse(raw) as Partial<TracerFormValues>),
    });
  } catch {
    return createEmptyTracerForm(defaults);
  }
}

function isFilledRow(row: object) {
  return Object.values(row as Record<string, unknown>).some((value) => String(value ?? "").trim() !== "");
}

function normalizeFormSource(envelope: TracerEnvelope | null, defaults: Partial<TracerFormValues>) {
  const submitted = envelope?.submission?.ched_payload;
  const draft = envelope?.draft?.ched_payload;

  if (submitted && typeof submitted === "object") {
    return createEmptyTracerForm({
      ...defaults,
      ...submitted,
    });
  }

  if (draft && typeof draft === "object") {
    return createEmptyTracerForm({
      ...defaults,
      ...draft,
    });
  }

  return readDraft(defaults);
}

async function fetchTracerBlob(url: string) {
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    await readApiResponse(response);
  }

  return response.blob();
}

async function downloadTracerFile(format: "pdf" | "docx") {
  const blob = await fetchTracerBlob(`${API_URL}/tracer/export/me?format=${format}`);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = format === "pdf" ? "graduate-tracer.pdf" : "graduate-tracer.docx";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

async function previewTracerPdf() {
  const blob = await fetchTracerBlob(`${API_URL}/tracer/export/me/preview`);
  const objectUrl = URL.createObjectURL(blob);
  const previewWindow = window.open(objectUrl, "_blank", "noopener,noreferrer");

  if (!previewWindow) {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

export default function TracerForm() {
  const { user, profile, refreshProfile } = useAuth();
  const defaultValues = useMemo(
    () => ({
      fullName: profile?.name ?? "",
      email: user?.email ?? "",
      mobileNumber: "",
      educationalAttainments: [
        {
          degreeSpecialization: profile?.course ?? "",
          school: "University of Science and Technology of Southern Philippines",
          yearGraduated: profile?.batch ?? "",
          honorsAwards: "",
        },
      ],
    }),
    [profile?.batch, profile?.course, profile?.name, user?.email],
  );

  const [form, setForm] = useState<TracerFormValues>(() => readDraft(defaultValues));
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<TracerFormErrors>({});
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState<"preview-pdf" | "download-pdf" | "docx" | null>(null);
  const [tracerState, setTracerState] = useState<TracerEnvelope | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const activeStep = TRACER_STEPS[stepIndex];
  const hasCompletedSubmission = Boolean(tracerState?.submission);
  const allowResubmission = tracerState?.allowResubmission ?? true;

  const setField = (field: TracerFormField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const toggleArrayValue = (field: TracerFormField, value: string) => {
    setForm((current) => {
      const currentValues = Array.isArray(current[field]) ? (current[field] as string[]) : [];
      const nextValues = currentValues.includes(value) ? currentValues.filter((item) => item !== value) : [...currentValues, value];
      return { ...current, [field]: nextValues };
    });
  };

  const addTableRow = (field: TracerTableField) => {
    setForm((current) => {
      if (field === "educationalAttainments") return { ...current, educationalAttainments: [...current.educationalAttainments, createEmptyEducationRow()] };
      if (field === "professionalExams") return { ...current, professionalExams: [...current.professionalExams, createEmptyProfessionalExamRow()] };
      if (field === "trainings") return { ...current, trainings: [...current.trainings, createEmptyTrainingRow()] };
      return { ...current, referrals: [...current.referrals, createEmptyReferralRow()] };
    });
  };

  const removeTableRow = (field: TracerTableField, index: number) => {
    setForm((current) => {
      if (field === "educationalAttainments") return { ...current, educationalAttainments: current.educationalAttainments.filter((_, rowIndex) => rowIndex !== index) };
      if (field === "professionalExams") return { ...current, professionalExams: current.professionalExams.filter((_, rowIndex) => rowIndex !== index) };
      if (field === "trainings") return { ...current, trainings: current.trainings.filter((_, rowIndex) => rowIndex !== index) };
      return { ...current, referrals: current.referrals.filter((_, rowIndex) => rowIndex !== index) };
    });
  };

  const updateTableRow = (field: TracerTableField, index: number, key: string, value: string) => {
    setForm((current) => {
      const updateRows = <T extends object>(rows: T[]) => rows.map((row, rowIndex) => (rowIndex === index ? ({ ...row, [key]: value } as T) : row));
      if (field === "educationalAttainments") return { ...current, educationalAttainments: updateRows(current.educationalAttainments) };
      if (field === "professionalExams") return { ...current, professionalExams: updateRows(current.professionalExams) };
      if (field === "trainings") return { ...current, trainings: updateRows(current.trainings) };
      return { ...current, referrals: updateRows(current.referrals) };
    });
  };

  const validateAll = (formValue: TracerFormValues) => {
    const nextErrors: TracerFormErrors = {};

    const requireText = (field: TracerFormField, message = "This field is required.") => {
      const value = formValue[field];
      if (typeof value === "string" && value.trim() === "") nextErrors[field] = message;
    };

    requireText("fullName");
    requireText("permanentAddress");
    requireText("email");
    requireText("mobileNumber");
    requireText("civilStatus");
    requireText("sex");
    requireText("birthdayMonth");
    requireText("birthdayDay");
    requireText("birthdayYear");
    requireText("regionOfOrigin");
    requireText("province");
    requireText("residenceType");
    requireText("presentlyEmployed");

    if (formValue.email.trim() && !emailPattern.test(formValue.email.trim())) nextErrors.email = "Enter a valid email address.";
    if (formValue.mobileNumber.trim() && !phonePattern.test(formValue.mobileNumber.trim())) nextErrors.mobileNumber = "Enter a valid contact number.";
    if (formValue.telephoneNumber.trim() && !phonePattern.test(formValue.telephoneNumber.trim())) nextErrors.telephoneNumber = "Enter a valid contact number.";
    if (formValue.birthdayYear.trim() && !yearPattern.test(formValue.birthdayYear.trim())) nextErrors.birthdayYear = "Enter a valid 4-digit year.";

    const educationRows = formValue.educationalAttainments.filter((row) => isFilledRow(row));
    if (educationRows.length === 0) {
      nextErrors.educationalAttainments = "At least one educational attainment entry is required.";
    } else if (
      educationRows.some((row) => !row.degreeSpecialization.trim() || !row.school.trim() || !row.yearGraduated.trim() || !yearPattern.test(row.yearGraduated.trim()))
    ) {
      nextErrors.educationalAttainments = "Each educational attainment row must include degree & specialization, school, and a valid year graduated.";
    }

    if (formValue.reasonsForCourse.includes("Others") && !formValue.reasonsForCourseOther.trim()) {
      nextErrors.reasonsForCourseOther = "Specify the other reason for taking the course.";
    }

    const trainingRows = formValue.trainings.filter((row) => isFilledRow(row));
    if (trainingRows.some((row) => !row.title.trim() || !row.durationCredits.trim() || !row.institution.trim())) {
      nextErrors.trainings = "Complete title, duration/credits, and institution for each training row.";
    }

    if (formValue.advanceStudyReason === "Others" && !formValue.advanceStudyReasonOther.trim()) {
      nextErrors.advanceStudyReasonOther = "Specify the other reason for advance studies.";
    }

    if (formValue.presentlyEmployed !== "Employed") {
      if (formValue.unemploymentReasons.length === 0) nextErrors.unemploymentReasons = "Select at least one unemployment reason.";
      if (formValue.unemploymentReasons.includes("Other reason(s)") && !formValue.unemploymentReasonsOther.trim()) {
        nextErrors.unemploymentReasonsOther = "Specify the other unemployment reason.";
      }
    }

    if (formValue.presentlyEmployed === "Employed") {
      requireText("presentEmploymentStatus");
      requireText("presentOccupation");
      requireText("industry");
      requireText("workLocation");
      requireText("firstJobAfterCollege");

      if (formValue.presentEmploymentStatus === "Self-employed" && !formValue.selfEmployedSkills.trim()) {
        nextErrors.selfEmployedSkills = "Describe the skills applied in self-employment.";
      }

      if (formValue.firstJobAfterCollege === "Yes") {
        if (formValue.reasonsForStaying.length === 0) nextErrors.reasonsForStaying = "Select at least one reason for staying on the job.";
        if (formValue.reasonsForStaying.includes("Other reason(s)") && !formValue.reasonsForStayingOther.trim()) {
          nextErrors.reasonsForStayingOther = "Specify the other reason for staying.";
        }
      }

      if (formValue.firstJobAfterCollege) requireText("firstJobRelatedToCourse");

      if (formValue.firstJobRelatedToCourse === "Yes") {
        if (formValue.reasonsForAcceptingJob.length === 0) nextErrors.reasonsForAcceptingJob = "Select at least one reason for accepting the job.";
        if (formValue.reasonsForAcceptingJob.includes("Other reason(s)") && !formValue.reasonsForAcceptingJobOther.trim()) {
          nextErrors.reasonsForAcceptingJobOther = "Specify the other reason for accepting the job.";
        }
      }

      if (formValue.firstJobAfterCollege === "No" || formValue.firstJobRelatedToCourse === "No") {
        if (formValue.reasonsForChangingJob.length === 0) nextErrors.reasonsForChangingJob = "Select at least one reason for changing job.";
        if (formValue.reasonsForChangingJob.includes("Other reason(s)") && !formValue.reasonsForChangingJobOther.trim()) {
          nextErrors.reasonsForChangingJobOther = "Specify the other reason for changing job.";
        }
      }

      requireText("firstJobDuration");
      if (formValue.firstJobDuration === "Others" && !formValue.firstJobDurationOther.trim()) nextErrors.firstJobDurationOther = "Specify the other duration.";

      if (formValue.firstJobFindingWays.length === 0) nextErrors.firstJobFindingWays = "Select at least one job search method.";
      if (formValue.firstJobFindingWays.includes("Others") && !formValue.firstJobFindingWaysOther.trim()) nextErrors.firstJobFindingWaysOther = "Specify the other job search method.";

      requireText("timeToLandFirstJob");
      if (formValue.timeToLandFirstJob === "Others" && !formValue.timeToLandFirstJobOther.trim()) nextErrors.timeToLandFirstJobOther = "Specify the other timeline.";

      requireText("jobLevelFirstJob");
      requireText("jobLevelCurrentJob");
      requireText("initialGrossMonthlyEarning");
      requireText("curriculumRelevantToFirstJob");

      if (formValue.curriculumRelevantToFirstJob === "Yes") {
        if (formValue.usefulCompetencies.length === 0) nextErrors.usefulCompetencies = "Select at least one useful competency.";
        if (formValue.usefulCompetencies.includes("Other skills") && !formValue.usefulCompetenciesOther.trim()) {
          nextErrors.usefulCompetenciesOther = "Specify the other useful skill.";
        }
      }
    }

    const referralRows = formValue.referrals.filter((row) => isFilledRow(row));
    if (referralRows.some((row) => !row.name.trim() || !row.address.trim() || !row.contactNumber.trim())) {
      nextErrors.referrals = "Complete name, address, and contact number for each alumni referral row.";
    }

    return nextErrors;
  };

  const validateStep = (stepId: TracerStepId) => {
    const stepErrors = validateAll(form);
    const stepFields: Record<TracerStepId, TracerFormField[]> = {
      sectionA: ["fullName", "permanentAddress", "email", "telephoneNumber", "mobileNumber", "civilStatus", "sex", "birthdayMonth", "birthdayDay", "birthdayYear", "regionOfOrigin", "province", "residenceType"],
      sectionB: ["educationalAttainments", "professionalExams", "reasonsForCourse", "reasonsForCourseOther"],
      sectionC: ["trainings", "advanceStudyReason", "advanceStudyReasonOther"],
      sectionD: [
        "presentlyEmployed",
        "unemploymentReasons",
        "unemploymentReasonsOther",
        "presentEmploymentStatus",
        "selfEmployedSkills",
        "presentOccupation",
        "companyNameAddress",
        "industry",
        "workLocation",
        "firstJobAfterCollege",
        "reasonsForStaying",
        "reasonsForStayingOther",
        "firstJobRelatedToCourse",
        "reasonsForAcceptingJob",
        "reasonsForAcceptingJobOther",
        "reasonsForChangingJob",
        "reasonsForChangingJobOther",
        "firstJobDuration",
        "firstJobDurationOther",
        "firstJobFindingWays",
        "firstJobFindingWaysOther",
        "timeToLandFirstJob",
        "timeToLandFirstJobOther",
        "jobLevelFirstJob",
        "jobLevelCurrentJob",
        "initialGrossMonthlyEarning",
        "curriculumRelevantToFirstJob",
        "usefulCompetencies",
        "usefulCompetenciesOther",
        "curriculumSuggestions",
        "referrals",
      ],
    };

    const filteredErrors = Object.fromEntries(Object.entries(stepErrors).filter(([key]) => stepFields[stepId].includes(key as TracerFormField))) as TracerFormErrors;
    setErrors((current) => ({ ...current, ...filteredErrors }));
    return Object.keys(filteredErrors).length === 0;
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadTracer = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/tracer`, { headers: getAuthHeaders() });
        const payload = await readApiResponse<TracerEnvelope>(response);
        setTracerState(payload);
        setForm(normalizeFormSource(payload, defaultValues));
      } catch (error) {
        console.error(error);
        setForm(readDraft(defaultValues));
        setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to load tracer response." });
      } finally {
        setLoading(false);
      }
    };

    void loadTracer();
  }, [defaultValues, user]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(form));
  }, [form, loading]);

  const completion = useMemo(() => ((stepIndex + 1) / TRACER_STEPS.length) * 100, [stepIndex]);

  const goNext = () => {
    if (!validateStep(activeStep.id)) return;
    setStepIndex((current) => Math.min(current + 1, TRACER_STEPS.length - 1));
  };

  const goBack = () => setStepIndex((current) => Math.max(current - 1, 0));

  const handleSaveDraft = async () => {
    try {
      setSavingDraft(true);
      setFeedback(null);
      const response = await fetch(`${API_URL}/tracer/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ ched_payload: form }),
      });
      const payload = await readApiResponse<{ success: boolean; draft: TracerEnvelope["draft"] }>(response);
      setTracerState((current) => ({
        submission: current?.submission ?? null,
        allowResubmission: current?.allowResubmission ?? true,
        canSubmit: current?.canSubmit ?? true,
        draft: payload.draft ?? null,
      }));
      setFeedback({ type: "success", message: "Draft saved to the server." });
      toast.success("Tracer draft saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save tracer draft.";
      setFeedback({ type: "error", message });
      toast.error(message);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    const nextErrors = validateAll(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setFeedback({ type: "error", message: "Please complete the required CHED tracer fields before submitting." });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback(null);
      const response = await fetch(`${API_URL}/tracer/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ ched_payload: form }),
      });
      const payload = await readApiResponse<{ success: boolean; submission: TracerEnvelope["submission"] }>(response);
      if (typeof window !== "undefined") window.localStorage.removeItem(AUTOSAVE_KEY);
      setTracerState({
        submission: payload.submission ?? null,
        draft: null,
        allowResubmission: true,
        canSubmit: true,
      });
      setFeedback({ type: "success", message: "Graduate tracer form saved successfully. Your accomplished form is ready, and you can still edit this tracer anytime." });
      toast.success("Tracer form saved successfully");
      await refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit tracer form.";
      setFeedback({ type: "error", message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (format: "pdf" | "docx") => {
    try {
      setDownloading(format === "pdf" ? "download-pdf" : "docx");
      await downloadTracerFile(format);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export tracer file.";
      setFeedback({ type: "error", message });
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  };

  const handlePreviewPdf = async () => {
    try {
      setDownloading("preview-pdf");
      await previewTracerPdf();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to open tracer preview.";
      setFeedback({ type: "error", message });
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Official CHED Form</p>
            <h2 className="mt-2 text-2xl font-bold text-navy-dark">
              {hasCompletedSubmission ? "Graduate Tracer Submission Saved" : "Complete Graduate Tracer Survey"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Fill out the official graduate tracer survey, save a server draft anytime, then submit or update your accomplished CHED response whenever needed.
            </p>
          </div>
          <div className="min-w-[260px] rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-muted-foreground">Progress</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-navy transition-all" style={{ width: `${completion}%` }} />
            </div>
            <p className="mt-2 text-sm font-semibold text-navy-dark">
              Step {stepIndex + 1} of {TRACER_STEPS.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tracerState?.submission?.submitted_at
                ? `Submitted ${new Date(tracerState.submission.submitted_at).toLocaleString()}`
                : tracerState?.draft?.updated_at
                  ? `Draft saved ${new Date(tracerState.draft.updated_at).toLocaleString()}`
                  : "No server draft yet"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {TRACER_STEPS.map((step, index) => {
            const active = index === stepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  if (index <= stepIndex || validateStep(activeStep.id)) {
                    setStepIndex(index);
                  }
                }}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  active ? "border-navy bg-navy text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${active ? "text-white/80" : "text-muted-foreground"}`}>{step.title}</p>
                <p className="mt-1 text-sm font-semibold">{step.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Submission Rules</p>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>Your latest tracer submission stays editable after saving.</p>
            <p>Drafts can be saved anytime before final submission.</p>
            <p>{allowResubmission ? "You can open this form again and update your saved answers anytime." : "Editing is currently restricted for this account."}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Accomplished Form</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={savingDraft}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingDraft ? "Saving Draft..." : "Save Draft"}
            </button>
            <button
              type="button"
              onClick={() => void handlePreviewPdf()}
              disabled={!hasCompletedSubmission || downloading !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading === "preview-pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {downloading === "preview-pdf" ? "Opening Preview..." : "Preview PDF"}
            </button>
            <button
              type="button"
              onClick={() => void handleDownload("pdf")}
              disabled={!hasCompletedSubmission || downloading !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading === "download-pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading === "download-pdf" ? "Preparing PDF..." : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={() => void handleDownload("docx")}
              disabled={!hasCompletedSubmission || downloading !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading === "docx" ? "Preparing DOCX..." : "Download DOCX"}
            </button>
          </div>
        </div>
      </div>

      {feedback ? (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {feedback.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
          <p>{feedback.message}</p>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {activeStep.id === "sectionA" ? (
          <SectionA form={form} errors={errors} setField={setField} toggleArrayValue={toggleArrayValue} addTableRow={addTableRow} removeTableRow={removeTableRow} updateTableRow={updateTableRow} onNext={goNext} />
        ) : null}
        {activeStep.id === "sectionB" ? (
          <SectionB
            form={form}
            errors={errors}
            setField={setField}
            toggleArrayValue={toggleArrayValue}
            addTableRow={addTableRow}
            removeTableRow={removeTableRow}
            updateTableRow={updateTableRow}
            onBack={goBack}
            onNext={goNext}
          />
        ) : null}
        {activeStep.id === "sectionC" ? (
          <SectionC
            form={form}
            errors={errors}
            setField={setField}
            toggleArrayValue={toggleArrayValue}
            addTableRow={addTableRow}
            removeTableRow={removeTableRow}
            updateTableRow={updateTableRow}
            onBack={goBack}
            onNext={goNext}
          />
        ) : null}
        {activeStep.id === "sectionD" ? (
          <SectionD
            form={form}
            errors={errors}
            setField={setField}
            toggleArrayValue={toggleArrayValue}
            addTableRow={addTableRow}
            removeTableRow={removeTableRow}
            updateTableRow={updateTableRow}
            onBack={goBack}
            onSubmit={handleSubmit}
            submitting={submitting}
            hasExistingResponse={hasCompletedSubmission}
            options={{
              employmentStatuses: EMPLOYMENT_STATUSES,
              courseReasons: COURSE_REASON_OPTIONS,
              advanceStudyReasons: ADVANCE_STUDY_REASON_OPTIONS,
              unemploymentReasons: UNEMPLOYMENT_REASON_OPTIONS,
              stayingReasons: STAYING_REASON_OPTIONS,
              acceptingReasons: ACCEPTING_REASON_OPTIONS,
              changingReasons: CHANGING_REASON_OPTIONS,
              findingWays: FINDING_WAY_OPTIONS,
              durationOptions: DURATION_OPTIONS,
              timeToJobOptions: TIME_TO_JOB_OPTIONS,
              jobLevels: JOB_LEVEL_OPTIONS,
              incomeRanges: INCOME_RANGES,
              competencies: USEFUL_COMPETENCY_OPTIONS,
              businessLines: BUSINESS_LINE_OPTIONS,
              workLocations: WORK_LOCATION_OPTIONS,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
