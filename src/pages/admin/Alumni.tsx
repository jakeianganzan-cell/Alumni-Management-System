import { clientLogger } from "@/lib/logger";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type ExcelJS from "exceljs";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  FileSpreadsheet,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { ALL_COURSES_OPTION, COURSE_OPTIONS, SYSTEM_COURSES, formatCourseLabel, type CourseOption } from "@/lib/courseCatalog";
import { useAuth } from "@/hooks/useAuth";
import { useSystemSettings } from "@/context/SystemSettingsContext";
import { downloadBrandedExcel, type ReportColumn } from "@/lib/reportExport";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appQueryKeys, authenticatedQueryOptions } from "@/lib/appQueries";
import { QUERY_CACHE_POLICY } from "@/lib/queryClient";

const ALUMNI_PAGE_SIZE = 15;

interface AlumniRecord {
  id: string;
  name: string;
  course: string | null;
  batch: string | null;
  graduation_batch_id: number | null;
  bor_number: string | null;
  advanced_studies_level: string | null;
  advanced_studies_status: string | null;
  advanced_studies_program: string | null;
  advanced_studies_school: string | null;
  advanced_studies_start_year: string | null;
  advanced_studies_expected_completion_year: string | null;
  email: string;
  student_id: string | null;
  contact_number: string | null;
  photo: string | null;
  role?: string;
}

interface ProfilesPageResponse {
  rows: AlumniRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
interface NewAlumniForm {
  name: string;
  course: string;
  graduationBatchId: string;
  email: string;
  studentId: string;
  contactNumber: string;
}

interface GraduationBatch {
  id: number;
  batchYear: number;
  schoolYear: string;
  boardResolutionNo: string | null;
  graduationDate: string | null;
  documentUrl: string | null;
  graduateCount: number;
  createdAt?: string;
  updatedAt?: string;
}

interface GraduationBatchForm {
  batchYear: string;
  schoolYear: string;
  boardResolutionNo: string;
  graduationDate: string;
  documentUrl: string;
  documentName: string;
}

interface ImportRow {
  rowNumber: number;
  fullName: string;
  graduationYear: string;
  emailAddress: string;
  program: string;
  contactNumber: string;
  borNumber: string;
  advancedStudiesLevel: string;
  advancedStudiesStatus: string;
  advancedStudiesProgram: string;
  advancedStudiesSchool: string;
  advancedStudiesStartYear: string;
  advancedStudiesExpectedCompletionYear: string;
  errors: string[];
}

interface ImportResponse {
  success: boolean;
  summary: {
    totalRows: number;
    validRows: number;
    importedRows: number;
    successfulImports?: number;
    duplicateEmails?: number;
    invalidRows?: number;
    failedEmailSends?: number;
    failedRows: number;
  };
  importedRows: Array<{
    rowNumber: number;
    alumniId: string;
    emailAddress: string;
    fullName: string;
    graduationYear: string;
    program: string;
    contactNumber: string;
    borNumber: string | null;
    advancedStudiesLevel: string | null;
    advancedStudiesStatus: string | null;
    emailSent?: boolean;
    emailStatus?: string;
  }>;
  failedRows: Array<{
    rowNumber: number;
    emailAddress: string;
    fullName: string;
    reason: string;
  }>;
  failedEmailRows?: Array<{
    rowNumber: number;
    alumniId: string;
    emailAddress: string;
    fullName: string;
    reason: string;
  }>;
}

const BLANK: NewAlumniForm = { name: "", course: SYSTEM_COURSES[0], graduationBatchId: "", email: "", studentId: "", contactNumber: "" };
const BLANK_BATCH: GraduationBatchForm = { batchYear: "", schoolYear: "", boardResolutionNo: "", graduationDate: "", documentUrl: "", documentName: "" };

const normalizeImageSrc = (value: string | null) => resolveAssetUrl(value);

const normalizeText = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ");
const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizePhone = (value: unknown) => String(value || "").replace(/[^\d+]/g, "").trim();
const normalizeYear = (value: unknown) => String(value || "").trim();
const normalizeHeader = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const normalizeAdvancedStudiesLevel = (value: unknown) => {
  const text = normalizeText(value);
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!text) return "";
  if (["master", "masters", "masterdegree", "mastersdegree"].includes(key)) return "Master's Degree";
  if (["doctoral", "doctorate", "doctoraldegree", "doctoratedegree", "phd"].includes(key)) return "Doctoral Degree";
  return "";
};

const normalizeAdvancedStudiesStatus = (value: unknown) => {
  const text = normalizeText(value);
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!text) return "";
  if (["currentlyenrolled", "enrolled", "ongoing"].includes(key)) return "Currently enrolled";
  if (["completed", "finished", "graduated"].includes(key)) return "Completed";
  if (["onleave", "leave"].includes(key)) return "On leave";
  if (["discontinued", "stopped"].includes(key)) return "Discontinued";
  return "";
};

const formatAdvancedStudies = (item: Pick<AlumniRecord, "advanced_studies_level" | "advanced_studies_status">) =>
  [item.advanced_studies_level, item.advanced_studies_status].filter(Boolean).join(" - ") || "-";
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const ALLOWED_ALUMNI_EMAIL_DOMAINS = ["gmail.com", "email.com"];

const getAlumniEmailError = (value: unknown) => {
  const email = normalizeEmail(value);

  if (!email) return "Email address is required.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address using an allowed domain.";

  const [localPart, domain = ""] = email.split("@");

  if (
    !localPart ||
    !domain ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..")
  ) {
    return "Enter a valid email address using an allowed domain.";
  }

  const allowedDomain = ALLOWED_ALUMNI_EMAIL_DOMAINS.includes(domain) || domain === "edu.ph" || domain.endsWith(".edu.ph");

  if (!allowedDomain) {
    return "Email must use @gmail.com, @email.com, or an .edu.ph school domain.";
  }

  return "";
};

const getStudentIdError = (value: unknown) => {
  const studentId = normalizeText(value);

  if (!studentId) return "";
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,49}$/.test(studentId)) {
    return "Student/Alumni ID must be 3-50 characters and may use letters, numbers, and hyphens.";
  }

  return "";
};
const normalizeProgram = (value: unknown, programOptions: CourseOption[] = COURSE_OPTIONS) => {
  const text = normalizeText(value);
  const normalized = text.toUpperCase().replace(/\s+/g, " ");
  const matchedCourse = programOptions.find((option) =>
    option.code.toUpperCase() === normalized ||
    option.label.toUpperCase().replace(/\s+/g, " ") === normalized
  );

  return matchedCourse?.code || text;
};

const getDepartmentLabel = (course: string | null | undefined) => {
  const code = normalizeText(course).toUpperCase();
  if (!code) return "";
  if (["BSIT", "BSCS", "BSIS"].includes(code)) return "Information Technology / Computing";
  if (["BSED", "BEED", "BPED", "BTLED"].includes(code)) return "Teacher Education";
  if (["BSBA", "BSA", "BSAIS", "BSHM", "BSTM"].includes(code)) return "Business and Management";
  if (["BSCRIM", "BSCJ"].includes(code)) return "Criminal Justice Education";
  return "Academic Department";
};

const formatCourseCode = (course: string | null | undefined, programOptions: CourseOption[] = COURSE_OPTIONS) => {
  const normalized = normalizeText(course);
  if (!normalized) return "";
  const matchedCourse = programOptions.find((option) =>
    option.code.toUpperCase() === normalized.toUpperCase() ||
    option.label.toUpperCase().replace(/\s+/g, " ") === normalized.toUpperCase().replace(/\s+/g, " ")
  );
  return matchedCourse?.code || normalized.toUpperCase();
};


const IMPORT_HEADER_MAP: Record<string, keyof Omit<ImportRow, "rowNumber" | "errors">> = {
  fullname: "fullName",
  name: "fullName",
  alumniname: "fullName",
  graduatefullname: "fullName",
  graduationyear: "graduationYear",
  gradyear: "graduationYear",
  batch: "graduationYear",
  batchyear: "graduationYear",
  schoolyear: "graduationYear",
  yeargraduated: "graduationYear",
  email: "emailAddress",
  emailaddress: "emailAddress",
  mail: "emailAddress",
  program: "program",
  course: "program",
  degreeprogram: "program",
  contact: "contactNumber",
  contactnumber: "contactNumber",
  mobilenumber: "contactNumber",
  phone: "contactNumber",
  phonenumber: "contactNumber",
  mobilenumberph: "contactNumber",
  bornumber: "borNumber",
  borno: "borNumber",
  boardresolutionnumber: "borNumber",
  boardresolution: "borNumber",
  advancedstudies: "advancedStudiesLevel",
  advancedstudieslevel: "advancedStudiesLevel",
  furtherstudies: "advancedStudiesLevel",
  degreelevel: "advancedStudiesLevel",
  mastersdoctoral: "advancedStudiesLevel",
  advancedstudiesstatus: "advancedStudiesStatus",
  studystatus: "advancedStudiesStatus",
  advancedstudiesprogram: "advancedStudiesProgram",
  graduateprogram: "advancedStudiesProgram",
  advancedstudiesschool: "advancedStudiesSchool",
  graduateuniversity: "advancedStudiesSchool",
  advancedstudiesstartyear: "advancedStudiesStartYear",
  startyear: "advancedStudiesStartYear",
  advancedstudiesexpectedcompletionyear: "advancedStudiesExpectedCompletionYear",
  expectedcompletionyear: "advancedStudiesExpectedCompletionYear",
  completionyear: "advancedStudiesExpectedCompletionYear",};

const validateImportRows = (rows: Omit<ImportRow, "errors">[], existingEmails: Set<string>, systemCourses: string[]) => {
  const seenEmails = new Set<string>();

  return rows.map((row) => {
    const errors: string[] = [];

    if (!row.fullName) {
      errors.push("Full Name is required.");
    }

    if (!row.graduationYear || !/^\d{4}$/.test(row.graduationYear)) {
      errors.push("Graduation Year must be a 4-digit year.");
    }

    const emailError = getAlumniEmailError(row.emailAddress);
    if (emailError) {
      errors.push(emailError);
    }

    if (!row.program) {
      errors.push("Program is required.");
    } else if (!systemCourses.includes(row.program)) {
      errors.push("Program must match one of the supported school programs.");
    }

    if (row.emailAddress) {
      if (seenEmails.has(row.emailAddress)) {
        errors.push("Duplicate email found in this file.");
      } else {
        seenEmails.add(row.emailAddress);
      }

      if (existingEmails.has(row.emailAddress)) {
        errors.push("Email already exists in the database.");
      }
    }

    return { ...row, errors };
  });
};

const getCellText = (cell: ExcelJS.Cell) => {
  const text = normalizeText(cell.text);

  if (text) {
    return text;
  }

  const value = cell.value;

  if (value && typeof value === "object") {
    if ("text" in value) {
      return normalizeText(value.text);
    }

    if ("result" in value) {
      return normalizeText(value.result);
    }
  }

  return normalizeText(value);
};

const normalizeImportValue = (key: keyof Omit<ImportRow, "rowNumber" | "errors">, value: unknown, programOptions: CourseOption[] = COURSE_OPTIONS) => {
  if (key === "emailAddress") {
    return normalizeEmail(value);
  }

  if (key === "contactNumber") {
    return normalizePhone(value);
  }

  if (key === "graduationYear" || key === "advancedStudiesStartYear" || key === "advancedStudiesExpectedCompletionYear") {
    return normalizeYear(value);
  }

  if (key === "advancedStudiesLevel") {
    return normalizeAdvancedStudiesLevel(value);
  }

  if (key === "advancedStudiesStatus") {
    return normalizeAdvancedStudiesStatus(value);
  }

  if (key === "program") {
    return normalizeProgram(value, programOptions);
  }

  return normalizeText(value);
};

const worksheetToRows = (worksheet: ExcelJS.Worksheet, programOptions: CourseOption[]) => {
  let headerRowNumber = 0;
  const headerIndexes = new Map<number, keyof Omit<ImportRow, "rowNumber" | "errors">>();

  worksheet.eachRow((row, rowNumber) => {
    if (headerRowNumber > 0) {
      return;
    }

    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const mappedKey = IMPORT_HEADER_MAP[normalizeHeader(getCellText(cell))];

      if (mappedKey) {
        headerIndexes.set(columnNumber, mappedKey);
      }
    });

    if (headerIndexes.size > 0) {
      headerRowNumber = rowNumber;
    } else {
      headerIndexes.clear();
    }
  });

  if (headerRowNumber === 0) {
    throw new Error("The import file must include headers: name, email, and program.");
  }

  const mappedHeaders = new Set(headerIndexes.values());
  const missingHeaders = [
    !mappedHeaders.has("fullName") ? "Name" : "",
    !mappedHeaders.has("emailAddress") ? "Email" : "",
    !mappedHeaders.has("program") ? "Program" : "",
  ].filter(Boolean);

  if (missingHeaders.length > 0) {
    throw new Error(`Missing required import column${missingHeaders.length === 1 ? "" : "s"}: ${missingHeaders.join(", ")}.`);
  }

  const rows: Omit<ImportRow, "errors">[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) {
      return;
    }

    const mapped: Omit<ImportRow, "errors"> = {
      rowNumber,
      fullName: "",
      graduationYear: "",
      emailAddress: "",
      program: "",
      contactNumber: "",
      borNumber: "",
      advancedStudiesLevel: "",
      advancedStudiesStatus: "",
      advancedStudiesProgram: "",
      advancedStudiesSchool: "",
      advancedStudiesStartYear: "",
      advancedStudiesExpectedCompletionYear: "",
    };
    let hasValue = false;

    headerIndexes.forEach((key, columnNumber) => {
      const value = normalizeImportValue(key, getCellText(row.getCell(columnNumber)), programOptions);

      if (value) {
        hasValue = true;
      }

      mapped[key] = value;
    });

    if (hasValue) {
      rows.push(mapped);
    }
  });

  return rows;
};

const parseImportFile = async (file: File, schoolYear: string, programOptions: CourseOption[]) => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (extension !== "xlsx") {
    throw new Error("Only XLSX alumni import files are supported.");
  }

  const { default: ExcelJSRuntime } = await import("exceljs");
  const workbook = new ExcelJSRuntime.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("The uploaded file does not contain any worksheet.");
  }

  const parsedRows = worksheetToRows(worksheet, programOptions);

  if (parsedRows.length === 0) {
    throw new Error("No alumni rows were found. Check that the file includes the required columns.");
  }

  return parsedRows.map((row) => ({ ...row, graduationYear: schoolYear }));
};

export default function AdminAlumni() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id || "anonymous";
  const { settings: systemSettings } = useSystemSettings();
  const programOptions = systemSettings.programs;
  const systemCourses = useMemo(() => programOptions.map((option) => option.code), [programOptions]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [courseFilter, setCourseFilter] = useState(ALL_COURSES_OPTION);
  const [batchFilter, setBatchFilter] = useState("");
  const [advancedStudiesFilter, setAdvancedStudiesFilter] = useState("");

  const [sortKey, setSortKey] = useState<keyof AlumniRecord>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [editingBatch, setEditingBatch] = useState<GraduationBatch | null>(null);
  const [batchForm, setBatchForm] = useState<GraduationBatchForm>(BLANK_BATCH);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [form, setForm] = useState<NewAlumniForm>(BLANK);
  const [addedAlumni, setAddedAlumni] = useState<{ name: string; email: string; alumniId: string } | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importParsing, setImportParsing] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const batchesKey = appQueryKeys.graduationBatches(userId);
  const batchesQuery = useQuery({
    ...authenticatedQueryOptions<GraduationBatch[]>({ queryKey: batchesKey, path: "/graduation-batches", policy: QUERY_CACHE_POLICY.reference }),
    enabled: Boolean(user?.id),
  });
  const graduationBatches = useMemo(() => batchesQuery.data ?? [], [batchesQuery.data]);

  const selectedBatch = useMemo(
    () => graduationBatches.find((item) => String(item.id) === selectedBatchId) || null,
    [graduationBatches, selectedBatchId]
  );

  const selectedAddBatch = useMemo(
    () => graduationBatches.find((item) => String(item.id) === form.graduationBatchId) || null,
    [form.graduationBatchId, graduationBatches]
  );

  useEffect(() => {
    if (systemCourses.length > 0 && !systemCourses.includes(form.course)) {
      setForm((current) => ({ ...current, course: systemCourses[0] }));
    }
  }, [form.course, systemCourses]);

  useEffect(() => {
    if (graduationBatches.length === 0) return;
    setSelectedBatchId((current) => current && graduationBatches.some((item) => String(item.id) === current) ? current : String(graduationBatches[0].id));
  }, [graduationBatches]);

  useEffect(() => {
    if (!batchesQuery.error) return;
    clientLogger.error(batchesQuery.error);
    toast.error("Failed to load graduation batches");
  }, [batchesQuery.error]);

  const trimmedName = normalizeText(form.name);
  const emailValidationError = form.email ? getAlumniEmailError(form.email) : "Email address is required.";
  const studentIdValidationError = getStudentIdError(form.studentId);
  const addFormErrors = {
    name: trimmedName ? "" : "Full name is required.",
    graduationBatchId: selectedAddBatch ? "" : "Select a graduation batch.",
    course: systemCourses.includes(form.course) ? "" : "Select a valid course/program.",
    email: emailValidationError,
    studentId: studentIdValidationError,
  };
  const canCreateAlumni = Object.values(addFormErrors).every((message) => !message);

  const importReadyCount = useMemo(
    () => importRows.filter((row) => row.errors.length === 0).length,
    [importRows]
  );

  const importIssueCount = importRows.length - importReadyCount;

  const buildProfilesQuery = useCallback((page: number, pageSize: number) => {
    const params = new URLSearchParams({
      paginated: "true",
      role: "alumni",
      page: String(page),
      pageSize: String(pageSize),
      sortBy: String(sortKey),
      sortDirection: sortAsc ? "asc" : "desc",
    });

    if (deferredSearch) params.set("search", deferredSearch);
    if (courseFilter !== ALL_COURSES_OPTION) params.set("course", courseFilter);
    const effectiveBatchFilter = batchFilter || selectedBatchId;
    if (effectiveBatchFilter && effectiveBatchFilter !== "all") params.set("graduationBatchId", effectiveBatchFilter);
    if (advancedStudiesFilter) params.set("advancedStudiesLevel", advancedStudiesFilter);

    return params;
  }, [advancedStudiesFilter, batchFilter, courseFilter, deferredSearch, selectedBatchId, sortAsc, sortKey]);
  const profilesQueryString = useMemo(() => buildProfilesQuery(currentPage, ALUMNI_PAGE_SIZE).toString(), [buildProfilesQuery, currentPage]);
  const profilesQuery = useQuery({
    ...authenticatedQueryOptions<ProfilesPageResponse>({
      queryKey: appQueryKeys.adminProfiles(userId, profilesQueryString),
      path: `/profiles?${profilesQueryString}`,
      policy: QUERY_CACHE_POLICY.user,
    }),
    enabled: Boolean(user?.id && selectedBatchId),
    placeholderData: (previous) => previous,
  });
  const alumni = useMemo(() => profilesQuery.data?.rows ?? [], [profilesQuery.data]);
  const totalAlumni = profilesQuery.data?.pagination.total ?? 0;
  const totalPages = profilesQuery.data?.pagination.totalPages ?? 1;
  const loading = profilesQuery.isLoading && !profilesQuery.data;

  useEffect(() => {
    if (!profilesQuery.error) return;
    clientLogger.error(profilesQuery.error);
    toast.error("Failed to fetch alumni records");
  }, [profilesQuery.error]);
  const existingEmails = useMemo(
    () => new Set(alumni.map((profile) => normalizeEmail(profile.email)).filter(Boolean)),
    [alumni]
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ALUMNI_PAGE_SIZE;
  const paginatedAlumni = alumni;
  const visibleStart = totalAlumni === 0 ? 0 : pageStartIndex + 1;
  const visibleEnd = Math.min(pageStartIndex + paginatedAlumni.length, totalAlumni);

  useEffect(() => {
    setCurrentPage(1);
  }, [advancedStudiesFilter, batchFilter, courseFilter, search, selectedBatchId, sortAsc, sortKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const fetchAllFilteredAlumni = async () => {
    const headers = getAuthHeaders();
    const rows: AlumniRecord[] = [];
    let page = 1;
    let pages = 1;

    do {
      const query = buildProfilesQuery(page, 100);
      const response = await fetch(`${API_URL}/profiles?${query}`, { headers });
      const data = await readApiResponse<ProfilesPageResponse>(response);
      rows.push(...(data.rows || []));
      pages = data.pagination.totalPages;
      page += 1;
    } while (page <= pages);

    return rows;
  };

  const toggleSort = (key: keyof AlumniRecord) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
      return;
    }

    setSortKey(key);
    setSortAsc(true);
  };

  const resetImportState = () => {
    setImportRows([]);
    setImportFile(null);
    setImportFileName("");
    setImportError("");
    setImportResult(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const SortIcon = ({ k }: { k: keyof AlumniRecord }) =>
    sortKey === k ? (
      sortAsc ? (
        <ChevronUp className="inline h-3 w-3 ml-1" />
      ) : (
        <ChevronDown className="inline h-3 w-3 ml-1" />
      )
    ) : (
      <ChevronUp className="inline h-3 w-3 ml-1 opacity-25" />
    );

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setPhotoPreview(loadEvent.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setAddLoading(true);
    setAddError("");

    try {
      const normalizedEmail = normalizeEmail(form.email);
      const normalizedStudentId = normalizeText(form.studentId);

      if (!canCreateAlumni) {
        throw new Error(Object.values(addFormErrors).find(Boolean) || "Complete all required fields before creating the alumni account.");
      }

      const res = await fetch(`${API_URL}/profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: form.name,
          email: normalizedEmail,
          course: form.course,
          graduationBatchId: Number(form.graduationBatchId),
          studentId: normalizedStudentId || null,
          contactNumber: form.contactNumber,
          photoBase64: photoPreview,
          sendEmail: true,
        }),
      });

      const data = await readApiResponse<{
        success: boolean;
        alumniId: string;
        emailSent: boolean;
        emailStatus?: string;
        emailError: string | null;
      }>(res);

      setAddedAlumni({ name: form.name, email: form.email, alumniId: data.alumniId });
      setShowAdd(false);
      setShowConfirm(true);
      setPhotoPreview(null);
      setForm(BLANK);
      setSelectedBatchId(form.graduationBatchId);
      setBatchFilter("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: batchesKey }),
        queryClient.invalidateQueries({ queryKey: appQueryKeys.adminProfilesRoot(userId) }),
      ]);

      if (!data.emailSent && data.emailError) {
        toast.error(`Alumni account created, but the credentials email was not sent: ${data.emailError}`);
      } else {
        toast.success("Alumni account created successfully.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create alumni account";
      setAddError(message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleImportFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!selectedBatch) {
      setImportError("Select a graduation batch first.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setImportParsing(true);
    setImportError("");
    setImportResult(null);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (extension !== "xlsx") {
        throw new Error("Only XLSX files are allowed.");
      }

      const parsedRows = await parseImportFile(file, String(selectedBatch.batchYear), programOptions);
      const validatedRows = validateImportRows(parsedRows, existingEmails, systemCourses);

      setImportRows(validatedRows);
      setImportFile(file);
      setImportFileName(file.name);
      toast.success(`Loaded ${validatedRows.length} alumni row${validatedRows.length === 1 ? "" : "s"} for preview`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read the import file";
      setImportRows([]);
      setImportFile(null);
      setImportFileName("");
      setImportError(message);
    } finally {
      setImportParsing(false);
    }
  };
  const handleImportSubmit = async () => {
    if (importRows.length === 0 || !importFile) {
      return;
    }

    if (!selectedBatch) {
      setImportError("Select a graduation batch before final import.");
      return;
    }

    setImportSubmitting(true);
    setImportError("");

    try {
      const res = await fetch(`${API_URL}/profiles/import`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": importFile.type || "application/octet-stream",
          "X-File-Name": importFile.name,
          "X-Graduation-Batch-Id": String(selectedBatch.id),
        },
        body: importFile,
      });

      const data = await readApiResponse<ImportResponse>(res);
      setImportResult(data);
      setImportRows([]);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: appQueryKeys.adminProfilesRoot(userId) }),
        queryClient.invalidateQueries({ queryKey: batchesKey }),
      ]);

      if (data.summary.importedRows > 0) {
        toast.success(`${data.summary.importedRows} alumni record${data.summary.importedRows === 1 ? "" : "s"} imported`);
      } else {
        toast.error("No rows were imported");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import alumni records";
      setImportError(message);
      toast.error(message);
    } finally {
      setImportSubmitting(false);
    }
  };

  const openNewBatch = () => {
    setEditingBatch(null);
    setBatchForm(BLANK_BATCH);
    setBatchError("");
    setShowBatch(true);
  };

  const openEditBatch = () => {
    if (!selectedBatch) return;
    setEditingBatch(selectedBatch);
    setBatchForm({
      batchYear: String(selectedBatch.batchYear),
      schoolYear: selectedBatch.schoolYear,
      boardResolutionNo: selectedBatch.boardResolutionNo || "",
      graduationDate: selectedBatch.graduationDate || "",
      documentUrl: selectedBatch.documentUrl || "",
      documentName: selectedBatch.documentUrl ? "Current document" : "",
    });
    setBatchError("");
    setShowBatch(true);
  };

  const handleBatchDocumentSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setBatchError("Supporting document must be 8 MB or smaller.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setBatchForm((current) => ({
        ...current,
        documentUrl: String(loadEvent.target?.result || ""),
        documentName: file.name,
      }));
      setBatchError("");
    };
    reader.onerror = () => setBatchError("Unable to read the supporting document.");
    reader.readAsDataURL(file);
  };

  const handleSaveBatch = async (event: React.FormEvent) => {
    event.preventDefault();
    setBatchSaving(true);
    setBatchError("");
    try {
      const endpoint = editingBatch
        ? `${API_URL}/graduation-batches/${editingBatch.id}`
        : `${API_URL}/graduation-batches`;
      const response = await fetch(endpoint, {
        method: editingBatch ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          batchYear: Number(batchForm.batchYear),
          schoolYear: batchForm.schoolYear,
          boardResolutionNo: batchForm.boardResolutionNo,
          graduationDate: batchForm.graduationDate || null,
          documentUrl: batchForm.documentUrl || null,
        }),
      });
      const saved = await readApiResponse<GraduationBatch>(response);
      const savedId = String(saved.id);
      setShowBatch(false);
      setSelectedBatchId(savedId);
      setBatchFilter("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: batchesKey }),
        queryClient.invalidateQueries({ queryKey: appQueryKeys.adminProfilesRoot(userId) }),
      ]);
      toast.success(editingBatch ? "Batch updated" : "Batch created");
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : "Unable to save the graduation batch.");
    } finally {
      setBatchSaving(false);
    }
  };

  const buildAlumniReport = (records: AlumniRecord[]) => {
    type AlumniExportRow = Record<string, string | number>;
    const columns: Array<ReportColumn<AlumniExportRow>> = [
      { key: "alumniId", label: "Alumni ID" },
      { key: "name", label: "Name" },
      { key: "advancedStudies", label: "Advanced Studies" },
      { key: "advancedProgram", label: "Graduate Program" },
      { key: "advancedSchool", label: "School/University" },

      { key: "program", label: "Program" },
      { key: "department", label: "Department" },
      { key: "email", label: "Email" },
      { key: "contact", label: "Contact" },
    ];
    const rows = records.map((item) => ({
      alumniId: item.student_id ?? "",
      name: item.name,
      advancedStudies: formatAdvancedStudies(item),
      advancedProgram: item.advanced_studies_program ?? "",
      advancedSchool: item.advanced_studies_school ?? "",

      program: formatCourseCode(item.course, programOptions),
      department: getDepartmentLabel(item.course),
      email: item.email,
      contact: item.contact_number ?? "",
    }));

    return {
      title: selectedBatch ? `Alumni Records - Batch ${selectedBatch.batchYear}` : "Alumni Records",
      filename: selectedBatch ? `alumni_batch_${selectedBatch.batchYear}` : "alumni_records",
      columns,
      rows,
      preparedBy: profile?.name || user?.email || "System Administrator",
      summary: [
        { label: "Displayed Records", value: records.length },
        { label: "Advanced Studies", value: records.filter((item) => item.advanced_studies_level).length },

        { label: "Programs", value: new Set(records.map((item) => item.course).filter(Boolean)).size },
      ],
    };
  };

  const exportExcel = async () => {
    const records = await fetchAllFilteredAlumni();
    await downloadBrandedExcel(buildAlumniReport(records));
  };

  return (
    <AdminLayout title="Alumni Records">
      <div className="min-w-0 rounded-xl border border-border bg-card shadow-card">
        <div className="border-b border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="sr-only" htmlFor="graduation-batch-select">Batch</label>
              <select id="graduation-batch-select" value={selectedBatchId} onChange={(event) => { setSelectedBatchId(event.target.value); setBatchFilter(""); }} className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium text-navy focus:border-navy focus:outline-none">
                {graduationBatches.length === 0 && <option value="">No batches</option>}
                {graduationBatches.map((item) => <option key={item.id} value={item.id}>Batch {item.batchYear} — {item.schoolYear}</option>)}
              </select>
              <button type="button" onClick={openNewBatch} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-navy hover:bg-muted"><Plus className="h-3.5 w-3.5" />Set New Batch</button>
              <button type="button" disabled={!selectedBatch} onClick={() => { setForm({ ...BLANK, course: systemCourses[0] || "", graduationBatchId: selectedBatchId }); setAddError(""); setPhotoPreview(null); setShowAdd(true); }} className="inline-flex h-8 items-center gap-1 rounded-md bg-navy px-2.5 text-xs font-medium text-white hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add Alumni</button>
            </div>
            {selectedBatch && <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-semibold text-navy-dark">{selectedBatch.batchYear}</span>
              <span>• SY {selectedBatch.schoolYear}</span>
              <span>• BOR No. {selectedBatch.boardResolutionNo || "—"}</span>
              <span>• {selectedBatch.graduateCount} Graduates</span>
              <button type="button" onClick={openEditBatch} className="inline-flex items-center gap-1 font-medium text-navy hover:underline"><Pencil className="h-3 w-3" />Edit</button>
              {selectedBatch.documentUrl && <a href={resolveAssetUrl(selectedBatch.documentUrl) || selectedBatch.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-navy hover:underline"><FileText className="h-3 w-3" />Document</a>}
            </div>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 border-b border-border px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search Alumni" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-52 rounded-md border border-border bg-background py-1 pl-8 pr-2 text-xs focus:border-navy focus:outline-none" />
          </div>
          <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} aria-label="Course filter" className="h-8 max-w-36 rounded-md border border-border bg-background px-2 text-xs focus:border-navy focus:outline-none">
            <option value={ALL_COURSES_OPTION}>{ALL_COURSES_OPTION}</option>
            {programOptions.map((option) => <option key={option.code} value={option.code}>{option.code}</option>)}
          </select>
          <select value={batchFilter || selectedBatchId} onChange={(event) => { const value = event.target.value; if (value === "all") setBatchFilter("all"); else { setSelectedBatchId(value); setBatchFilter(""); } }} aria-label="Batch filter" className="h-8 max-w-32 rounded-md border border-border bg-background px-2 text-xs focus:border-navy focus:outline-none">
            <option value="all">All Batches</option>
            {graduationBatches.map((item) => <option key={item.id} value={item.id}>{item.batchYear}</option>)}
          </select>
          <select value={advancedStudiesFilter} onChange={(event) => setAdvancedStudiesFilter(event.target.value)} aria-label="Studies filter" className="h-8 max-w-40 rounded-md border border-border bg-background px-2 text-xs focus:border-navy focus:outline-none">
            <option value="">All Studies</option>
            <option value="Master's Degree">Master's Degree</option>
            <option value="Doctoral Degree">Doctoral Degree</option>
          </select>
          <button type="button" disabled={!selectedBatch} onClick={() => void exportExcel()} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-navy hover:bg-muted disabled:opacity-50"><FileSpreadsheet className="h-3.5 w-3.5" />Excel</button>
          <button type="button" disabled={!selectedBatch} onClick={() => { resetImportState(); setShowImport(true); }} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-navy hover:bg-muted disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Import</button>
        </div>

        <div className="overflow-x-auto" tabIndex={0} aria-label="Alumni records table">
          <table className="w-full table-fixed text-[11px]">
            <colgroup><col className="w-[8%]" /><col className="w-[17%]" /><col className="w-[22%]" /><col className="w-[15%]" /><col className="w-[23%]" /><col className="w-[15%]" /></colgroup>
            <thead><tr className="border-b border-border bg-muted/50"><th className="px-2 py-1.5 text-left text-[9px] font-semibold uppercase text-navy">Photo</th>{([ ["student_id", "Alumni ID"], ["name", "Name"], ["course", "Course"], ["email", "Email"], ["contact_number", "Contact"] ] as [keyof AlumniRecord, string][]).map(([key, label]) => <th key={key} onClick={() => toggleSort(key)} className="cursor-pointer select-none truncate px-2 py-1.5 text-left text-[9px] font-semibold uppercase text-navy hover:text-navy-dark">{label}<SortIcon k={key} /></th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading</td></tr>}
              {!loading && totalAlumni === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No alumni found.</td></tr>}
              {paginatedAlumni.map((item, index) => {
                const imageSrc = normalizeImageSrc(item.photo);
                return (
                  <tr key={item.id} className={`border-b border-border transition-colors hover:bg-navy/5 ${index % 2 !== 0 ? "bg-muted/10" : ""}`}>
                    <td className="px-2 py-1.5">{imageSrc ? <button type="button" onClick={() => setPreviewImage({ src: imageSrc, name: item.name })} className="rounded-full focus:outline-none focus:ring-2 focus:ring-navy"><img src={imageSrc} alt={item.name} className="h-7 w-7 rounded-full border border-border object-cover" /></button> : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{item.name.charAt(0).toUpperCase()}</div>}</td>
                    <td className="truncate px-2 py-1.5 font-mono text-[10px] text-muted-foreground" title={item.student_id ?? "-"}>{item.student_id ?? "-"}</td>
                    <td className="truncate px-2 py-1.5 font-semibold text-navy-dark" title={item.name}>{item.name}</td>
                    <td className="truncate px-2 py-1.5 text-muted-foreground" title={formatCourseLabel(item.course, programOptions) || "-"}>{formatCourseCode(item.course, programOptions) || "-"}</td>
                    <td className="truncate px-2 py-1.5 text-muted-foreground" title={item.email}>{item.email}</td>
                    <td className="truncate px-2 py-1.5 text-muted-foreground" title={item.contact_number || "-"}>{item.contact_number || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-2.5 py-1.5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><div><strong>{visibleStart}-{visibleEnd}</strong> of <strong>{totalAlumni}</strong></div><div className="flex items-center gap-2"><button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} className="rounded-md border border-border px-2 py-0.5 font-medium text-navy hover:bg-muted disabled:opacity-50">Prev</button><span>Page {safeCurrentPage} of {totalPages}</span><button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} className="rounded-md border border-border px-2 py-0.5 font-medium text-navy hover:bg-muted disabled:opacity-50">Next</button></div></div>
      </div>

      {showBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowBatch(false)}>
          <div className="w-full max-w-lg rounded-xl bg-card p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-navy-dark">{editingBatch ? "Edit Batch" : "Set New Batch"}</h3><button type="button" onClick={() => setShowBatch(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
            <form onSubmit={handleSaveBatch} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldInput label="Batch Year" value={batchForm.batchYear} set={(value) => setBatchForm((current) => ({ ...current, batchYear: value }))} type="number" />
                <FieldInput label="School Year" value={batchForm.schoolYear} set={(value) => setBatchForm((current) => ({ ...current, schoolYear: value }))} placeholder="2025–2026" />
                <FieldInput label="Board Resolution / BOR No." value={batchForm.boardResolutionNo} set={(value) => setBatchForm((current) => ({ ...current, boardResolutionNo: value }))} placeholder="031, s. 2026" />
                <FieldInput label="Graduation Date" value={batchForm.graduationDate} set={(value) => setBatchForm((current) => ({ ...current, graduationDate: value }))} type="date" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-navy">Supporting Document (optional)</label>
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.docx,.xlsx,.pptx" onChange={handleBatchDocumentSelect} className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs" />
                {batchForm.documentName && <p className="mt-1 text-[11px] text-muted-foreground">{batchForm.documentName}</p>}
              </div>
              {batchError && <p className="text-xs text-rose-700">{batchError}</p>}
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowBatch(false)} className="h-8 rounded-md border border-border px-3 text-xs font-medium text-navy hover:bg-muted">Cancel</button><button type="submit" disabled={batchSaving} className="inline-flex h-8 items-center gap-1 rounded-md bg-navy px-3 text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50">{batchSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button></div>
            </form>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAdd(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-bold text-navy-dark">Add Alumni</h3><button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-navy">Batch</label>
                <select value={form.graduationBatchId} onChange={(event) => setForm((current) => ({ ...current, graduationBatchId: event.target.value }))} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none">
                  {graduationBatches.map((item) => <option key={item.id} value={item.id}>{item.batchYear} — {item.schoolYear}</option>)}
                </select>
                {selectedAddBatch && <p className="mt-1 text-xs text-muted-foreground">BOR No.: {selectedAddBatch.boardResolutionNo || "—"}</p>}
              </div>
              <div className="flex justify-center">
                <label className="group relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted transition-colors hover:border-navy hover:bg-navy/5">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <Camera className="mx-auto mb-1 h-6 w-6 text-muted-foreground group-hover:text-navy" />
                      <span className="text-[10px] text-muted-foreground">Photo</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FieldInput label="Full Name *" value={form.name} set={(value) => setForm((current) => ({ ...current, name: value }))} /><FieldInput label="Email Address *" type="email" value={form.email} set={(value) => setForm((current) => ({ ...current, email: value }))} /><FieldInput label="Student/Alumni ID" value={form.studentId} set={(value) => setForm((current) => ({ ...current, studentId: value }))} placeholder="Auto-generate if blank" /><FieldInput label="Contact Number" value={form.contactNumber} set={(value) => setForm((current) => ({ ...current, contactNumber: value }))} /></div>
              <div><label className="mb-1 block text-xs font-semibold text-navy">Course *</label><select value={form.course} onChange={(event) => setForm((current) => ({ ...current, course: event.target.value }))} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none">{programOptions.map((option) => <option key={option.code} value={option.code}>{option.code}</option>)}</select></div>
              {addError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{addError}</div>}
              <div className="flex gap-3 pt-1"><button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-navy hover:bg-muted">Cancel</button><button type="submit" disabled={addLoading || !canCreateAlumni} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50">{addLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Loading</> : <><Mail className="h-4 w-4" />Create Account</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {showConfirm && addedAlumni && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowConfirm(false)}><div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"><CheckCircle className="h-8 w-8 text-emerald-600" /></div><h3 className="mb-1 font-display text-lg font-bold text-navy-dark">Alumni Account Created</h3><p className="mb-4 text-sm text-muted-foreground">Credentials were emailed to <strong className="text-navy">{addedAlumni.name}</strong>.</p><button onClick={() => setShowConfirm(false)} className="w-full rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-light">Done</button></div></div>
      )}

      <Dialog open={showImport} onOpenChange={(open) => !open ? setShowImport(false) : setShowImport(true)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-4 sm:p-5">
          <DialogHeader className="space-y-1">
            <DialogTitle>Import Alumni Records</DialogTitle>
            <DialogDescription>{selectedBatch ? `Batch ${selectedBatch.batchYear} — ${selectedBatch.schoolYear}` : "Select a batch first."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-white ${selectedBatch && !importParsing && !importSubmitting ? "cursor-pointer bg-navy hover:bg-navy-light" : "cursor-not-allowed bg-muted-foreground/60"}`}>
                <FileSpreadsheet className="h-4 w-4" />
                {importParsing ? "Reading File..." : "Choose File"}
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileSelect} disabled={importParsing || importSubmitting || !selectedBatch} />
              </label>
              {importFileName && <span className="text-xs text-muted-foreground">{importFileName}</span>}
            </div>

            {importError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{importError}</div>}

            {importRows.length > 0 && <>
              <div className="grid grid-cols-3 gap-2">
                <SummaryTile label="Rows Found" value={String(importRows.length)} tone="neutral" />
                <SummaryTile label="Ready" value={String(importReadyCount)} tone="success" />
                <SummaryTile label="Issues" value={String(importIssueCount)} tone={importIssueCount > 0 ? "danger" : "neutral"} />
              </div>
              <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
                <table className="min-w-[760px] w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Program</th>
                      <th className="px-3 py-2 text-left">Advanced Studies</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Validation</th>
                    </tr>
                  </thead>
                  <tbody>{importRows.map((row) => <tr key={`${row.rowNumber}-${row.emailAddress}`} className="border-b align-top"><td className="px-3 py-1.5">{row.rowNumber}</td><td className="px-3 py-1.5 font-medium text-navy-dark">{row.fullName || "-"}</td><td className="px-3 py-1.5" title={row.program ? formatCourseLabel(row.program, programOptions) : ""}>{row.program ? formatCourseCode(row.program, programOptions) : "-"}</td><td className="px-3 py-1.5">{[row.advancedStudiesLevel, row.advancedStudiesStatus].filter(Boolean).join(" - ") || "-"}</td><td className="px-3 py-1.5">{row.emailAddress || "-"}</td><td className="px-3 py-1.5">{row.errors.length === 0 ? "Ready" : <span className="text-rose-700">{row.errors.join("; ")}</span>}</td></tr>)}</tbody>
                </table>
              </div>
              <button type="button" onClick={handleImportSubmit} disabled={importSubmitting || importReadyCount === 0} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-navy px-3 text-xs font-medium text-white hover:bg-navy-light disabled:opacity-60">{importSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Final Import</button>
            </>}

            {importResult && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <SummaryTile label="Created" value={String(importResult.importedRows.length)} tone="success" />
                  <SummaryTile label="Not Created" value={String(importResult.failedRows.length)} tone={importResult.failedRows.length ? "danger" : "neutral"} />
                  <SummaryTile label="Email Issues" value={String(importResult.failedEmailRows?.length || 0)} tone={importResult.failedEmailRows?.length ? "danger" : "neutral"} />
                </div>

                {importResult.importedRows.length > 0 && (
                  <div className="max-h-[380px] overflow-auto rounded-lg border border-border">
                    <table className="w-full min-w-[850px] text-[11px]">
                      <thead className="sticky top-0 bg-muted/90 text-[9px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Row</th>
                          <th className="px-2 py-1.5 text-left">Alumni ID</th>
                          <th className="px-2 py-1.5 text-left">Name</th>
                          <th className="px-2 py-1.5 text-left">Email</th>
                          <th className="px-2 py-1.5 text-left">Program</th>
                          <th className="px-2 py-1.5 text-left">Year</th>
                          <th className="px-2 py-1.5 text-left">Contact</th>
                          <th className="px-2 py-1.5 text-left">Credentials</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importResult.importedRows.map((row) => (
                          <tr key={`${row.rowNumber}-${row.alumniId}`}>
                            <td className="px-2 py-1.5">{row.rowNumber}</td>
                            <td className="px-2 py-1.5 font-semibold text-navy-dark">{row.alumniId}</td>
                            <td className="px-2 py-1.5 font-medium text-navy-dark">{row.fullName}</td>
                            <td className="px-2 py-1.5">{row.emailAddress}</td>
                            <td className="px-2 py-1.5">{formatCourseCode(row.program, programOptions)}</td>
                            <td className="px-2 py-1.5">{row.graduationYear}</td>
                            <td className="px-2 py-1.5">{row.contactNumber || "-"}</td>
                            <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 font-semibold ${row.emailSent ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{row.emailSent ? "Email sent" : "Email failed"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {importResult.failedRows.length > 0 && (
                  <div className="max-h-32 overflow-auto rounded-lg border border-rose-200 bg-rose-50/60">
                    {importResult.failedRows.map((row) => <div key={`${row.rowNumber}-${row.emailAddress}`} className="border-b border-rose-100 px-2.5 py-1.5 text-[11px] text-rose-700 last:border-0"><strong>Row {row.rowNumber}</strong> - {row.fullName || row.emailAddress || "Unknown row"} - {row.reason}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}><DialogContent className="w-auto max-w-none gap-0 overflow-visible rounded-full border-0 bg-transparent p-0 shadow-none sm:w-auto sm:max-w-none sm:rounded-full sm:p-0 [&>button.absolute]:hidden">{previewImage && <><DialogTitle className="sr-only">{previewImage.name}</DialogTitle><button type="button" aria-label="Close photo preview" onClick={() => setPreviewImage(null)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-transparent"><img src={previewImage.src} alt={previewImage.name} className="h-64 w-64 rounded-full object-cover" /></button></>}</DialogContent></Dialog>
    </AdminLayout>
  );
}
function FieldInput({
  label,
  value,
  set,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-navy">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => set(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none"
      />
    </div>
  );
}
function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "neutral" | "success" | "danger" }) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-border bg-muted/20 text-navy-dark";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClassName}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em]">{label}</p>
      <p className="mt-0.5 text-base font-semibold leading-none">{value}</p>
    </div>
  );
}







