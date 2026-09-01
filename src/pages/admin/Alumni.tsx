import { clientLogger } from "@/lib/logger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Filter,
  Loader2,
  Mail,
  Plus,
  Printer,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { ALL_COURSES_OPTION, COURSE_OPTIONS, SYSTEM_COURSES, formatCourseLabel, type CourseOption } from "@/lib/courseCatalog";
import { useAuth } from "@/hooks/useAuth";
import { useSystemSettings } from "@/context/SystemSettingsContext";
import { downloadBrandedExcel, openPrintableReport, type ReportColumn } from "@/lib/reportExport";

const BATCHES = ["All Batches", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018"];
const ALUMNI_PAGE_SIZE = 15;

interface AlumniRecord {
  id: string;
  name: string;
  course: string | null;
  batch: string | null;
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
  batch: string;
  email: string;
  studentId: string;
  contactNumber: string;
  borNumber: string;
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

const BLANK: NewAlumniForm = { name: "", course: SYSTEM_COURSES[0], batch: "2026", email: "", studentId: "", contactNumber: "", borNumber: "" };

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

  const workbook = new ExcelJS.Workbook();
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
  const { settings: systemSettings } = useSystemSettings();
  const programOptions = systemSettings.programs;
  const systemCourses = useMemo(() => programOptions.map((option) => option.code), [programOptions]);
  const courses = useMemo(() => [ALL_COURSES_OPTION, ...systemCourses], [systemCourses]);
  const [alumni, setAlumni] = useState<AlumniRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState(ALL_COURSES_OPTION);
  const [batch, setBatch] = useState("All Batches");
  const [borFilter, setBorFilter] = useState("");
  const [advancedStudiesFilter, setAdvancedStudiesFilter] = useState("");

  const [sortKey, setSortKey] = useState<keyof AlumniRecord>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAlumni, setTotalAlumni] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
  const [importSchoolYear, setImportSchoolYear] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (systemCourses.length > 0 && !systemCourses.includes(form.course)) {
      setForm((current) => ({ ...current, course: systemCourses[0] }));
    }
  }, [form.course, systemCourses]);
  const existingEmails = useMemo(
    () => new Set(alumni.map((profile) => normalizeEmail(profile.email)).filter(Boolean)),
    [alumni]
  );
  const trimmedName = normalizeText(form.name);
  const emailValidationError = form.email ? getAlumniEmailError(form.email) : "Email address is required.";
  const studentIdValidationError = getStudentIdError(form.studentId);
  const addFormErrors = {
    name: trimmedName ? "" : "Full name is required.",
    batch: /^\d{4}$/.test(form.batch) ? "" : "Batch year must be a 4-digit year.",
    course: systemCourses.includes(form.course) ? "" : "Select a valid course/program.",
    email: emailValidationError,
    studentId: studentIdValidationError,
  };
  const canCreateAlumni = Object.values(addFormErrors).every((message) => !message);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ALUMNI_PAGE_SIZE;
  const paginatedAlumni = alumni;
  const visibleStart = totalAlumni === 0 ? 0 : pageStartIndex + 1;
  const visibleEnd = Math.min(pageStartIndex + paginatedAlumni.length, totalAlumni);

  useEffect(() => {
    setCurrentPage(1);
  }, [advancedStudiesFilter, batch, borFilter, course, search, sortAsc, sortKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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

    if (search.trim()) params.set("search", search.trim());
    if (course !== ALL_COURSES_OPTION) params.set("course", course);
    if (batch !== "All Batches") params.set("batch", batch);
    if (borFilter.trim()) params.set("borNumber", borFilter.trim());
    if (advancedStudiesFilter) params.set("advancedStudiesLevel", advancedStudiesFilter);

    return params;
  }, [advancedStudiesFilter, batch, borFilter, course, search, sortAsc, sortKey]);

  const fetchAlumni = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const headers = getAuthHeaders();

    try {
      const query = buildProfilesQuery(currentPage, ALUMNI_PAGE_SIZE);
      const profilesResponse = await fetch(`${API_URL}/profiles?${query}`, { headers, signal });
      const data = await readApiResponse<ProfilesPageResponse>(profilesResponse);
      setAlumni(data.rows || []);
      setTotalAlumni(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      clientLogger.error(error);
      toast.error("Failed to fetch alumni records");
    } finally {
      setLoading(false);
    }
  }, [buildProfilesQuery, currentPage]);

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

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void fetchAlumni(controller.signal), search.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchAlumni, search]);

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
    setImportSchoolYear("");

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
          batch: form.batch,
          studentId: normalizedStudentId || null,
          contactNumber: form.contactNumber,
          photoBase64: photoPreview,
          sendEmail: true,
          borNumber: form.borNumber,
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
      await fetchAlumni();

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

    const selectedSchoolYear = normalizeYear(importSchoolYear);

    if (!/^\d{4}$/.test(selectedSchoolYear)) {
      setImportError("Set the school year first before choosing the Excel file.");
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

      const parsedRows = await parseImportFile(file, selectedSchoolYear, programOptions);
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
    const selectedSchoolYear = normalizeYear(importSchoolYear);

    if (importRows.length === 0 || !importFile) {
      return;
    }

    if (!/^\d{4}$/.test(selectedSchoolYear)) {
      setImportError("Set a valid 4-digit school year before final import.");
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
          "X-School-Year": selectedSchoolYear,
        },
        body: importFile,
      });

      const data = await readApiResponse<ImportResponse>(res);
      setImportResult(data);
      await fetchAlumni();

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
  const buildAlumniReport = (records: AlumniRecord[]) => {
    type AlumniExportRow = Record<string, string | number>;
    const columns: Array<ReportColumn<AlumniExportRow>> = [
      { key: "alumniId", label: "Alumni ID" },
      { key: "name", label: "Name" },
      { key: "graduationYear", label: "Graduation Year" },

      { key: "borNumber", label: "BOR Number" },
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
      graduationYear: item.batch ?? "",

      borNumber: item.bor_number ?? "",
      advancedStudies: formatAdvancedStudies(item),
      advancedProgram: item.advanced_studies_program ?? "",
      advancedSchool: item.advanced_studies_school ?? "",

      program: formatCourseCode(item.course, programOptions),
      department: getDepartmentLabel(item.course),
      email: item.email,
      contact: item.contact_number ?? "",
    }));

    return {
      title: "Alumni List Report",
      filename: "alumni_list",
      columns,
      rows,
      preparedBy: profile?.name || user?.email || "System Administrator",
      summary: [
        { label: "Displayed Records", value: records.length },
        { label: "BOR Numbers", value: new Set(records.map((item) => item.bor_number).filter(Boolean)).size },
        { label: "Advanced Studies", value: records.filter((item) => item.advanced_studies_level).length },

        { label: "Programs", value: new Set(records.map((item) => item.course).filter(Boolean)).size },
      ],
    };
  };

  const exportExcel = async () => {
    const records = await fetchAllFilteredAlumni();
    await downloadBrandedExcel(buildAlumniReport(records));
  };

  const exportPdf = async () => {
    const records = await fetchAllFilteredAlumni();
    openPrintableReport(buildAlumniReport(records));
  };

  return (
    <AdminLayout title="Alumni Management">
      <div className="min-w-0">
        <div className="min-w-0 rounded-xl border border-border bg-card shadow-card">
          <div className="flex flex-col flex-wrap items-start justify-between gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-7 w-36 rounded-md border border-border bg-background py-1 pl-7 pr-2 text-[11px] focus:border-navy focus:outline-none" />
              </div>
              <Filter className="h-3 w-3 self-center text-muted-foreground" />
              <select value={course} onChange={(event) => setCourse(event.target.value)} className="h-7 max-w-[9.5rem] rounded-md border border-border bg-background px-2 py-1 text-[11px] focus:border-navy focus:outline-none">
                {courses.map((value) => <option key={value} value={value}>{value === ALL_COURSES_OPTION ? value : formatCourseCode(value, programOptions)}</option>)}
              </select>
              <select value={batch} onChange={(event) => setBatch(event.target.value)} className="h-7 max-w-[9.5rem] rounded-md border border-border bg-background px-2 py-1 text-[11px] focus:border-navy focus:outline-none">
                {BATCHES.map((value) => <option key={value}>{value}</option>)}
              </select>
              <input value={borFilter} onChange={(event) => setBorFilter(event.target.value)} placeholder="BOR" className="h-7 w-24 rounded-md border border-border bg-background px-2 py-1 text-[11px] focus:border-navy focus:outline-none" />
              <select value={advancedStudiesFilter} onChange={(event) => setAdvancedStudiesFilter(event.target.value)} className="h-7 max-w-[10.5rem] rounded-md border border-border bg-background px-2 py-1 text-[11px] focus:border-navy focus:outline-none">
                <option value="">All studies</option>
                <option value="Master's Degree">Master's Degree</option>
                <option value="Doctoral Degree">Doctoral Degree</option>
              </select>

            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => { resetImportState(); setShowImport(true); }} className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-navy hover:bg-muted"><Upload className="h-3 w-3" />Import</button>
              <button onClick={() => void exportExcel()} className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-navy hover:bg-muted"><FileSpreadsheet className="h-3 w-3" />Excel</button>
              <button onClick={() => void exportPdf()} className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-navy hover:bg-muted"><Printer className="h-3 w-3" />PDF</button>
              <button onClick={() => { setForm(BLANK); setAddError(""); setPhotoPreview(null); setShowAdd(true); }} className="flex h-7 items-center gap-1 rounded-md bg-navy px-2 text-[11px] font-medium text-white hover:bg-navy-light"><Plus className="h-3 w-3" />Add</button>
            </div>
          </div>

          <div className="overflow-x-auto" tabIndex={0} aria-label="Alumni records table">
            <table className="w-full table-fixed text-[11px]">
              <colgroup><col className="w-[6%]" /><col className="w-[13%]" /><col className="w-[18%]" /><col className="w-[14%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[14%]" /><col className="w-[17%]" /></colgroup>
              <thead><tr className="border-b border-border bg-muted/50"><th className="px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-normal text-navy">Photo</th>{([ ["student_id", "Alumni ID"], ["name", "Name"], ["course", "Program"], ["batch", "Year"], ["bor_number", "BOR"], ["advanced_studies_level", "Advanced"], ["email", "Email"] ] as [keyof AlumniRecord, string][]).map(([key, label]) => <th key={key} onClick={() => toggleSort(key)} className="cursor-pointer select-none truncate px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-normal text-navy hover:text-navy-dark">{label}<SortIcon k={key} /></th>)}</tr></thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Loading...</td></tr>}
                {!loading && totalAlumni === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No alumni found.</td></tr>}
                {paginatedAlumni.map((item, index) => {
                  const imageSrc = normalizeImageSrc(item.photo);
                  return (
                    <tr key={item.id} className={`border-b border-border transition-colors hover:bg-navy/5 ${index % 2 !== 0 ? "bg-muted/10" : ""}`}>
                      <td className="px-2 py-1.5" data-label="Photo">{imageSrc ? <button type="button" onClick={(event) => { event.stopPropagation(); setPreviewImage({ src: imageSrc, name: item.name }); }} className="rounded-full focus:outline-none focus:ring-2 focus:ring-navy"><img src={imageSrc} alt={item.name} className="h-7 w-7 rounded-full border border-border object-cover" /></button> : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{item.name.charAt(0).toUpperCase()}</div>}</td>
                      <td className="truncate px-2 py-1.5 font-mono text-[10px] text-muted-foreground" title={item.student_id ?? "-"}>{item.student_id ?? "-"}</td>
                      <td className="truncate px-2 py-1.5 font-semibold text-navy-dark" title={item.name}>{item.name}</td>
                      <td className="truncate px-2 py-1.5 text-muted-foreground" title={formatCourseLabel(item.course, programOptions) || formatCourseCode(item.course, programOptions) || "-"}>{formatCourseCode(item.course, programOptions) || "-"}</td>
                      <td className="truncate px-2 py-1.5 text-muted-foreground" title={item.batch ?? "-"}>{item.batch ?? "-"}</td>

                      <td className="truncate px-2 py-1.5 text-[10px] font-semibold text-navy-dark" title={item.bor_number ?? "-"}>{item.bor_number ?? "-"}</td>
                      <td className="truncate px-2 py-1.5 text-[10px] font-semibold text-navy-dark" title={formatAdvancedStudies(item)}>{formatAdvancedStudies(item)}</td>
                      <td className="truncate px-2 py-1.5 text-[10px] text-muted-foreground" title={item.email}>{item.email}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-2.5 py-1.5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><div><strong>{visibleStart}-{visibleEnd}</strong> of <strong>{totalAlumni}</strong></div><div className="flex items-center gap-2"><button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} className="rounded-md border border-border px-2 py-0.5 font-medium text-navy transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Prev</button><span className="rounded-md bg-muted px-2 py-0.5 font-semibold text-navy-dark">Page {safeCurrentPage} of {totalPages}</span><button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} className="rounded-md border border-border px-2 py-0.5 font-medium text-navy transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAdd(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between"><div><h3 className="font-display text-lg font-bold text-navy-dark">Add New Alumni</h3><p className="mt-0.5 text-xs text-muted-foreground">Create alumni account with academic details.</p></div><button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></div>
            <form onSubmit={handleAdd} className="space-y-4">
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
              <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-navy">Academic Information</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold text-navy">Graduation Year *</label><input value={form.batch} onChange={(event) => setForm((current) => ({ ...current, batch: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none" /></div><div><label className="mb-1.5 block text-xs font-semibold text-navy">Program *</label><select value={form.course} onChange={(event) => setForm((current) => ({ ...current, course: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none">{programOptions.map((option) => <option key={option.code} value={option.code}>{option.code}</option>)}</select></div><FieldInput label="BOR Number" value={form.borNumber} set={(value) => setForm((current) => ({ ...current, borNumber: value }))} /></div></div>
              {addError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{addError}</div>}
              <div className="flex gap-3 pt-1"><button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-navy hover:bg-muted">Cancel</button><button type="submit" disabled={addLoading || !canCreateAlumni} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50">{addLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : <><Mail className="h-4 w-4" />Create Account</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {showConfirm && addedAlumni && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowConfirm(false)}><div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"><CheckCircle className="h-8 w-8 text-emerald-600" /></div><h3 className="mb-1 font-display text-lg font-bold text-navy-dark">Alumni Account Created</h3><p className="mb-4 text-sm text-muted-foreground">Credentials were emailed to <strong className="text-navy">{addedAlumni.name}</strong>.</p><button onClick={() => setShowConfirm(false)} className="w-full rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-light">Done</button></div></div>
      )}

      <Dialog open={showImport} onOpenChange={(open) => !open ? setShowImport(false) : setShowImport(true)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Alumni Records</DialogTitle>
            <DialogDescription>Set the school year first, then upload one XLSX file. Required file columns: Name, Email, Program. Optional: Year, BOR Number, Contact Number.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">School Year *</label>
                <input
                  value={importSchoolYear}
                  onChange={(event) => {
                    setImportSchoolYear(normalizeYear(event.target.value));
                    setImportRows([]);
                    setImportFile(null);
                    setImportFileName("");
                    setImportResult(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="2026"
                  disabled={importParsing || importSubmitting}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white ${/^\d{4}$/.test(importSchoolYear) && !importParsing && !importSubmitting ? "cursor-pointer bg-navy hover:bg-navy-light" : "cursor-not-allowed bg-muted-foreground/60"}`}>
                  <FileSpreadsheet className="h-4 w-4" />
                  {importParsing ? "Reading File..." : "Choose File"}
                  <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileSelect} disabled={importParsing || importSubmitting || !/^\d{4}$/.test(importSchoolYear)} />
                </label>
                {importFileName && <span className="text-xs text-muted-foreground">{importFileName}</span>}
              </div>
            </div>

            {importError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{importError}</div>}

            {importRows.length > 0 && <>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryTile label="Rows Found" value={String(importRows.length)} tone="neutral" />
                <SummaryTile label="Ready" value={String(importReadyCount)} tone="success" />
                <SummaryTile label="Issues" value={String(importIssueCount)} tone={importIssueCount > 0 ? "danger" : "neutral"} />
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-[760px] w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">School Year</th>
                      <th className="px-3 py-2 text-left">Program</th>
                      <th className="px-3 py-2 text-left">BOR</th>
                      <th className="px-3 py-2 text-left">Advanced Studies</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Validation</th>
                    </tr>
                  </thead>
                  <tbody>{importRows.map((row) => <tr key={`${row.rowNumber}-${row.emailAddress}`} className="border-b align-top"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2 font-medium text-navy-dark">{row.fullName || "-"}</td><td className="px-3 py-2">{row.graduationYear || "-"}</td><td className="px-3 py-2" title={row.program ? formatCourseLabel(row.program, programOptions) : ""}>{row.program ? formatCourseCode(row.program, programOptions) : "-"}</td><td className="px-3 py-2">{row.borNumber || "-"}</td><td className="px-3 py-2">{row.emailAddress || "-"}</td><td className="px-3 py-2">{row.errors.length === 0 ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">Ready</span> : <span className="text-rose-700">{row.errors.join("; ")}</span>}</td></tr>)}</tbody>
                </table>
              </div>
              <button type="button" onClick={handleImportSubmit} disabled={importSubmitting || importReadyCount === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-light disabled:opacity-60">{importSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Final Import</button>
            </>}

            {importResult && <div className="rounded-xl border border-border bg-white p-4 text-sm"><strong>{importResult.summary.importedRows}</strong> rows imported. Failed rows: <strong>{importResult.summary.failedRows}</strong>.</div>}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}><DialogContent className="max-w-3xl overflow-hidden p-0">{previewImage && <div className="bg-card"><DialogHeader className="px-6 pb-2 pt-6"><DialogTitle>{previewImage.name}</DialogTitle><DialogDescription>Alumni profile photo preview</DialogDescription></DialogHeader><div className="p-6 pt-2"><div className="flex items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30"><img src={previewImage.src} alt={previewImage.name} className="max-h-[70vh] w-full object-contain" /></div></div></div>}</DialogContent></Dialog>
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
    <div className={`rounded-xl border px-4 py-3 ${toneClassName}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}







