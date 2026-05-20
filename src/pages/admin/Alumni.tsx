import { useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  AlertCircle,
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  Loader2,
  Mail,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { ALL_COURSES_OPTION, COURSE_OPTIONS, SYSTEM_COURSES, formatCourseLabel } from "@/lib/courseCatalog";
import { useAuth } from "@/hooks/useAuth";
import { downloadBrandedCsv, type ReportColumn } from "@/lib/reportExport";

const COURSES = [ALL_COURSES_OPTION, ...SYSTEM_COURSES];
const BATCHES = ["All Batches", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018"];
const ALUMNI_PAGE_SIZE = 10;

interface AlumniRecord {
  id: string;
  name: string;
  course: string | null;
  batch: string | null;
  email: string;
  student_id: string | null;
  contact_number: string | null;
  photo: string | null;
  role?: string;
}

interface NewAlumniForm {
  name: string;
  course: string;
  batch: string;
  email: string;
  studentId: string;
  contactNumber: string;
}

interface ImportRow {
  rowNumber: number;
  fullName: string;
  graduationYear: string;
  emailAddress: string;
  program: string;
  contactNumber: string;
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

const BLANK: NewAlumniForm = { name: "", course: SYSTEM_COURSES[0], batch: "2026", email: "", studentId: "", contactNumber: "" };

const normalizeImageSrc = (value: string | null) => resolveAssetUrl(value);

const normalizeText = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ");
const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizePhone = (value: unknown) => String(value || "").replace(/[^\d+]/g, "").trim();
const normalizeYear = (value: unknown) => String(value || "").trim();
const normalizeHeader = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
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
const normalizeProgram = (value: unknown) => {
  const text = normalizeText(value);
  const normalized = text.toUpperCase().replace(/\s+/g, " ");
  const matchedCourse = COURSE_OPTIONS.find((option) =>
    option.code.toUpperCase() === normalized ||
    option.label.toUpperCase().replace(/\s+/g, " ") === normalized
  );

  return matchedCourse?.code || text;
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
};

const validateImportRows = (rows: Omit<ImportRow, "errors">[], existingEmails: Set<string>) => {
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
    } else if (!SYSTEM_COURSES.includes(row.program as typeof SYSTEM_COURSES[number])) {
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

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"" && inQuotes && nextChar === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
};

const normalizeImportValue = (key: keyof Omit<ImportRow, "rowNumber" | "errors">, value: unknown) => {
  if (key === "emailAddress") {
    return normalizeEmail(value);
  }

  if (key === "contactNumber") {
    return normalizePhone(value);
  }

  if (key === "graduationYear") {
    return normalizeYear(value);
  }

  if (key === "program") {
    return normalizeProgram(value);
  }

  return normalizeText(value);
};

const worksheetToRows = (worksheet: ExcelJS.Worksheet) => {
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
    throw new Error("The import file must include headers: name, email, year, and program.");
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
    };
    let hasValue = false;

    headerIndexes.forEach((key, columnNumber) => {
      const value = normalizeImportValue(key, getCellText(row.getCell(columnNumber)));

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

const parseImportFile = async (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  let parsedRows: Omit<ImportRow, "errors">[] = [];

  if (extension === "csv") {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const headerCells = parseCsvLine(lines[0] || "");
    const headerIndexes = headerCells.map((header) => IMPORT_HEADER_MAP[normalizeHeader(header)]);

    if (!headerIndexes.some(Boolean)) {
      throw new Error("The import file must include headers: name, email, year, and program.");
    }

    parsedRows = lines.slice(1)
      .map((line, index) => {
        const cells = parseCsvLine(line);
        const mapped: Omit<ImportRow, "errors"> = {
          rowNumber: index + 2,
          fullName: "",
          graduationYear: "",
          emailAddress: "",
          program: "",
          contactNumber: "",
        };

        headerIndexes.forEach((key, columnIndex) => {
          if (key) {
            mapped[key] = normalizeImportValue(key, cells[columnIndex] || "");
          }
        });

        return mapped;
      })
      .filter((row) => row.fullName || row.graduationYear || row.emailAddress || row.program || row.contactNumber);
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("The uploaded file does not contain any worksheet.");
    }

    parsedRows = worksheetToRows(worksheet);
  }

  if (parsedRows.length === 0) {
    throw new Error("No alumni rows were found. Check that the file includes the required columns.");
  }

  return parsedRows;
};

export default function AdminAlumni() {
  const { profile, user } = useAuth();
  const [alumni, setAlumni] = useState<AlumniRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState(ALL_COURSES_OPTION);
  const [batch, setBatch] = useState("All Batches");
  const [sortKey, setSortKey] = useState<keyof AlumniRecord>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState<NewAlumniForm>(BLANK);
  const [showPass, setShowPass] = useState(false);
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

  useEffect(() => {
    fetchAlumni();
  }, []);

  const existingEmails = useMemo(
    () => new Set(alumni.map((profile) => normalizeEmail(profile.email)).filter(Boolean)),
    [alumni]
  );
  const existingStudentIds = useMemo(
    () => new Set(alumni.map((profile) => normalizeText(profile.student_id).toLowerCase()).filter(Boolean)),
    [alumni]
  );
  const trimmedName = normalizeText(form.name);
  const normalizedAddEmail = normalizeEmail(form.email);
  const normalizedAddStudentId = normalizeText(form.studentId);
  const emailValidationError = form.email ? getAlumniEmailError(form.email) : "Email address is required.";
  const studentIdValidationError = getStudentIdError(form.studentId);
  const duplicateEmailError = normalizedAddEmail && existingEmails.has(normalizedAddEmail)
    ? "This alumni account already exists."
    : "";
  const duplicateStudentIdError = normalizedAddStudentId && existingStudentIds.has(normalizedAddStudentId.toLowerCase())
    ? "This Student/Alumni ID already exists."
    : "";
  const addFormErrors = {
    name: trimmedName ? "" : "Full name is required.",
    batch: /^\d{4}$/.test(form.batch) ? "" : "Batch year must be a 4-digit year.",
    course: SYSTEM_COURSES.includes(form.course as typeof SYSTEM_COURSES[number]) ? "" : "Select a valid course/program.",
    email: duplicateEmailError || emailValidationError,
    studentId: duplicateStudentIdError || studentIdValidationError,
  };
  const canCreateAlumni = Object.values(addFormErrors).every((message) => !message);

  const filtered = useMemo(() => {
    return alumni
      .filter((item) =>
        (course === ALL_COURSES_OPTION || item.course === course) &&
        (batch === "All Batches" || item.batch === batch) &&
        (!search ||
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          (item.student_id ?? "").toLowerCase().includes(search.toLowerCase()) ||
          item.email.toLowerCase().includes(search.toLowerCase()))
      )
      .sort((a, b) => {
        const av = String(a[sortKey] ?? "");
        const bv = String(b[sortKey] ?? "");
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
  }, [alumni, batch, course, search, sortAsc, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ALUMNI_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ALUMNI_PAGE_SIZE;
  const paginatedAlumni = useMemo(
    () => filtered.slice(pageStartIndex, pageStartIndex + ALUMNI_PAGE_SIZE),
    [filtered, pageStartIndex]
  );
  const visibleStart = filtered.length === 0 ? 0 : pageStartIndex + 1;
  const visibleEnd = Math.min(pageStartIndex + paginatedAlumni.length, filtered.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [batch, course, search, sortAsc, sortKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const importReadyCount = useMemo(
    () => importRows.filter((row) => row.errors.length === 0).length,
    [importRows]
  );

  const importIssueCount = importRows.length - importReadyCount;

  const fetchAlumni = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/profiles`, {
        headers: getAuthHeaders(),
      });

      const data = await readApiResponse<AlumniRecord[]>(res);
      setAlumni((data || []).filter((profile) => profile.role === "alumni"));
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch alumni records");
    } finally {
      setLoading(false);
    }
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

      if (existingEmails.has(normalizedEmail)) {
        throw new Error("This alumni account already exists.");
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

    setImportParsing(true);
    setImportError("");
    setImportResult(null);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (!extension || !["csv", "xlsx"].includes(extension)) {
        throw new Error("Only CSV and XLSX files are allowed.");
      }

      const parsedRows = await parseImportFile(file);
      const validatedRows = validateImportRows(parsedRows, existingEmails);

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

    setImportSubmitting(true);
    setImportError("");

    try {
      const res = await fetch(`${API_URL}/profiles/import`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": importFile.type || "application/octet-stream",
          "X-File-Name": importFile.name,
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

  const exportCSV = () => {
    type AlumniCsvRow = Record<string, string | number>;
    const columns: Array<ReportColumn<AlumniCsvRow>> = [
      { key: "alumniId", label: "Alumni ID" },
      { key: "name", label: "Name" },
      { key: "course", label: "Course" },
      { key: "batch", label: "Batch" },
      { key: "email", label: "Email" },
      { key: "contact", label: "Contact" },
    ];
    const rows = filtered.map((item) => ({
      alumniId: item.student_id ?? "",
      name: item.name,
      course: item.course ?? "",
      batch: item.batch ?? "",
      email: item.email,
      contact: item.contact_number ?? "",
    }));

    downloadBrandedCsv({
      title: "Alumni List Report",
      filename: "alumni_list",
      columns,
      rows,
      preparedBy: profile?.name || user?.email || "System Administrator",
      summary: [
        { label: "Displayed Records", value: filtered.length },
        { label: "Courses", value: new Set(filtered.map((item) => item.course).filter(Boolean)).size },
        { label: "Batches", value: new Set(filtered.map((item) => item.batch).filter(Boolean)).size },
      ],
    });
  };

  return (
    <AdminLayout title="Alumni Management" subtitle="Manage and monitor all registered alumni accounts">
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Alumni", value: alumni.length },
          { label: "Courses", value: new Set(alumni.map((item) => item.course).filter(Boolean)).size },
          { label: "Batches", value: new Set(alumni.map((item) => item.batch).filter(Boolean)).size },
        ].map((stat, index) => (
          <div key={stat.label} className={`rounded-xl border p-4 shadow-card ${index === 0 ? "bg-navy border-navy" : "bg-card border-border"}`}>
            <p className={`text-2xl font-display font-bold ${index === 0 ? "text-white" : "text-navy-dark"}`}>{loading ? "..." : stat.value}</p>
            <p className={`mt-0.5 text-xs font-semibold ${index === 0 ? "text-white/70" : "text-navy"}`}>{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-col flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search alumni..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-52 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-navy focus:outline-none"
              />
            </div>
            <Filter className="h-3.5 w-3.5 self-center text-muted-foreground" />
            <select value={course} onChange={(event) => setCourse(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none">
              {COURSES.map((value) => (
                <option key={value} value={value}>
                  {value === ALL_COURSES_OPTION ? value : formatCourseLabel(value)}
                </option>
              ))}
            </select>
            <select value={batch} onChange={(event) => setBatch(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none">
              {BATCHES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                resetImportState();
                setShowImport(true);
              }}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-navy hover:bg-muted"
            >
              <Upload className="h-4 w-4" />
              Import File
            </button>
            <button onClick={exportCSV} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-navy hover:bg-muted">
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              onClick={() => {
                setForm(BLANK);
                setAddError("");
                setPhotoPreview(null);
                setShowAdd(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy-light"
            >
              <Plus className="h-4 w-4" />
              Add Alumni
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="w-14 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy">Photo</th>
                {([["student_id", "Alumni ID"], ["name", "Name"], ["course", "Course"], ["batch", "Batch"], ["email", "Email"], ["contact_number", "Contact"]] as [keyof AlumniRecord, string][]).map(
                  ([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy hover:text-navy-dark"
                    >
                      {label}
                      <SortIcon k={key} />
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No alumni found.
                  </td>
                </tr>
              )}
              {paginatedAlumni.map((item, index) => {
                const imageSrc = normalizeImageSrc(item.photo);

                return (
                  <tr key={item.id} className={`border-b border-border transition-colors hover:bg-muted/30 ${index % 2 !== 0 ? "bg-muted/10" : ""}`}>
                    <td className="px-4 py-3" data-label="Photo">
                      {imageSrc ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ src: imageSrc, name: item.name })}
                          className="rounded-full focus:outline-none focus:ring-2 focus:ring-navy"
                        >
                          <img src={imageSrc} alt={item.name} className="h-10 w-10 rounded-full border border-border object-cover" />
                        </button>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground" data-label="Alumni ID">{item.student_id ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-navy-dark" data-label="Name">{item.name}</td>
                    <td className="px-4 py-3 text-muted-foreground" data-label="Course">{formatCourseLabel(item.course) || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground" data-label="Batch">{item.batch ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" data-label="Email">{item.email}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" data-label="Contact">{item.contact_number ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            Showing <strong>{visibleStart}-{visibleEnd}</strong> of <strong>{filtered.length}</strong> matched alumni
            <span className="text-muted-foreground/80"> ({alumni.length} total)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage === 1}
              className="rounded-lg border border-border px-3 py-1.5 font-medium text-navy transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="rounded-lg bg-muted px-3 py-1.5 font-semibold text-navy-dark">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safeCurrentPage === totalPages}
              className="rounded-lg border border-border px-3 py-1.5 font-medium text-navy transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAdd(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-navy-dark">Add New Alumni</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">A temporary password will be generated securely. Alumni ID is auto-generated if not provided.</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div className="flex justify-center">
                <label className="group relative cursor-pointer">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted transition-colors group-hover:border-navy">
                    {photoPreview ? <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6 text-muted-foreground" />}
                  </div>
                  <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                  <span className="mt-1 block text-center text-[10px] text-muted-foreground">Upload Photo</span>
                </label>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Juan dela Cruz"
                  aria-invalid={Boolean(addFormErrors.name)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-navy focus:outline-none"
                />
                {form.name && addFormErrors.name && <p className="mt-1 text-xs text-rose-600">{addFormErrors.name}</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-navy">Batch Year *</label>
                  <select
                    value={form.batch}
                    onChange={(event) => setForm((current) => ({ ...current, batch: event.target.value }))}
                    aria-invalid={Boolean(addFormErrors.batch)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-navy focus:outline-none"
                  >
                    {["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018"].map((year) => (
                      <option key={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-navy">Course *</label>
                  <select
                    value={form.course}
                    onChange={(event) => setForm((current) => ({ ...current, course: event.target.value }))}
                    aria-invalid={Boolean(addFormErrors.course)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-navy focus:outline-none"
                  >
                    {COURSE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Email Address *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="e.g. jdelacruz@gmail.com"
                  aria-invalid={Boolean(addFormErrors.email)}
                  className={`w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none ${addFormErrors.email && form.email ? "border-rose-300 focus:border-rose-500" : "border-border focus:border-navy"}`}
                />
                {form.email ? (
                  <p className={`mt-1 text-xs ${addFormErrors.email ? "text-rose-600" : "text-emerald-700"}`}>
                    {addFormErrors.email || "Email format and domain are valid."}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Allowed domains: @gmail.com, @email.com, and .edu.ph school email domains.</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Student/Alumni ID <span className="text-muted-foreground">(if available)</span></label>
                <input
                  type="text"
                  value={form.studentId}
                  onChange={(event) => setForm((current) => ({ ...current, studentId: event.target.value }))}
                  placeholder="Leave blank to auto-generate"
                  aria-invalid={Boolean(addFormErrors.studentId)}
                  className={`w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none ${addFormErrors.studentId && form.studentId ? "border-rose-300 focus:border-rose-500" : "border-border focus:border-navy"}`}
                />
                {form.studentId && addFormErrors.studentId && <p className="mt-1 text-xs text-rose-600">{addFormErrors.studentId}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Contact Number</label>
                <input
                  type="tel"
                  value={form.contactNumber}
                  onChange={(event) => setForm((current) => ({ ...current, contactNumber: event.target.value }))}
                  placeholder="e.g. 09171234567"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-navy focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <strong>Note:</strong> An Alumni ID like `2026-0001` will be auto-generated based on the batch year. A separate temporary password will be emailed to the alumni.
              </div>

              {addError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{addError}</div>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-navy hover:bg-muted">
                  Cancel
                </button>
                <button type="submit" disabled={addLoading || !canCreateAlumni} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50">
                  {addLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Create Account
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirm && addedAlumni && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="mb-1 font-display text-lg font-bold text-navy-dark">Alumni Account Created</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Credentials were emailed to <strong className="text-navy">{addedAlumni.name}</strong>:
            </p>
            <div className="mb-5 space-y-3 rounded-xl bg-muted/50 p-4 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-mono text-sm font-bold text-navy-dark">{addedAlumni.email}</p>
                </div>
                <Mail className="h-4 w-4 text-navy/40" />
              </div>
              <div className="border-t border-border" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Alumni ID</p>
                  <p className="font-mono text-sm font-bold text-navy-dark">{showPass ? addedAlumni.alumniId : "••••••••••"}</p>
                </div>
                <button onClick={() => setShowPass((value) => !value)} className="text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              The alumni can log in using their email and the temporary password sent through Brevo.
            </p>
            <button onClick={() => setShowConfirm(false)} className="w-full rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-light">
              Done
            </button>
          </div>
        </div>
      )}

      <Dialog open={showImport} onOpenChange={(open) => !open ? setShowImport(false) : setShowImport(true)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Alumni Records</DialogTitle>
            <DialogDescription>
              Upload one CSV or XLSX file at a time. The system scans it automatically, validates required fields, and shows a preview before import.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy-dark">Accepted columns</p>
                  <p className="mt-1 text-sm text-muted-foreground">Name, Email, Year, and Program. Contact Number is optional.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-light">
                  <FileSpreadsheet className="h-4 w-4" />
                  Choose File
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={handleImportFileSelect}
                    disabled={importParsing || importSubmitting}
                  />
                </label>
              </div>

              {importFileName && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-full border border-border bg-white px-3 py-1.5">{importFileName}</span>
                  <button type="button" onClick={resetImportState} className="text-navy hover:underline">
                    Remove file
                  </button>
                </div>
              )}

              {importParsing && (
                <div className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading and validating file...
                </div>
              )}

              {importError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {importError}
                </div>
              )}
            </div>

            {importRows.length > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <SummaryTile label="Rows Found" value={String(importRows.length)} tone="neutral" />
                  <SummaryTile label="Ready to Import" value={String(importReadyCount)} tone="success" />
                  <SummaryTile label="Rows with Issues" value={String(importIssueCount)} tone={importIssueCount > 0 ? "danger" : "neutral"} />
                </div>

                <div className="rounded-2xl border border-border bg-card">
                  <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-navy-dark">Preview Before Import</h3>
                      <p className="text-sm text-muted-foreground">Review validation results below. Rows with issues will fail unless the source file is corrected and uploaded again.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleImportSubmit}
                      disabled={importSubmitting || importReadyCount === 0}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {importSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Final Import
                        </>
                      )}
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy">Row</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy">Full Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy">Graduation Year</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy">Email Address</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy">Program</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy">Contact Number</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-navy">Validation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row) => (
                          <tr key={`${row.rowNumber}-${row.emailAddress}`} className="border-b border-border align-top">
                            <td className="px-4 py-3 text-muted-foreground">{row.rowNumber}</td>
                            <td className="px-4 py-3 font-medium text-navy-dark">{row.fullName || "-"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{row.graduationYear || "-"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{row.emailAddress || "-"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{row.program ? formatCourseLabel(row.program) : "-"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{row.contactNumber || "-"}</td>
                            <td className="px-4 py-3">
                              {row.errors.length === 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Ready
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Has issues
                                  </span>
                                  {row.errors.map((error) => (
                                    <p key={error} className="text-xs text-rose-700">
                                      {error}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {importResult && (
              <div className="rounded-2xl border border-border bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-navy-dark">Import Summary</h3>
                    <p className="text-sm text-muted-foreground">Completed import results for the uploaded file.</p>
                  </div>
                  <button
                    type="button"
                    onClick={resetImportState}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-navy hover:bg-muted"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Another File
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <SummaryTile label="Total Rows" value={String(importResult.summary.totalRows)} tone="neutral" />
                  <SummaryTile label="Validated" value={String(importResult.summary.validRows)} tone="neutral" />
                  <SummaryTile label="Imported" value={String(importResult.summary.importedRows)} tone="success" />
                  <SummaryTile label="Email Failed" value={String(importResult.summary.failedEmailSends || 0)} tone={(importResult.summary.failedEmailSends || 0) > 0 ? "danger" : "neutral"} />
                </div>

                {importResult.failedRows.length > 0 && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <p className="text-sm font-semibold text-rose-700">Failed rows</p>
                    <div className="mt-2 space-y-2">
                      {importResult.failedRows.map((row) => (
                        <p key={`${row.rowNumber}-${row.emailAddress}-${row.reason}`} className="text-sm text-rose-700">
                          Row {row.rowNumber}: {row.fullName || "Unnamed row"} ({row.emailAddress || "no email"}) - {row.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {importResult.failedEmailRows && importResult.failedEmailRows.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-700">Accounts created but email failed</p>
                    <div className="mt-2 space-y-2">
                      {importResult.failedEmailRows.map((row) => (
                        <p key={`${row.rowNumber}-${row.emailAddress}-${row.reason}`} className="text-sm text-amber-700">
                          Row {row.rowNumber}: {row.fullName || "Unnamed row"} ({row.emailAddress}) - {row.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          {previewImage && (
            <div className="bg-card">
              <DialogHeader className="px-6 pb-2 pt-6">
                <DialogTitle>{previewImage.name}</DialogTitle>
                <DialogDescription>Alumni profile photo preview</DialogDescription>
              </DialogHeader>
              <div className="p-6 pt-2">
                <div className="flex items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
                  <img src={previewImage.src} alt={previewImage.name} className="max-h-[70vh] w-full object-contain" />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
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
