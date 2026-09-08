import { clientLogger } from "@/lib/logger";
import { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Filter,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  QrCode,
  Search,
  Settings,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { downloadBrandedExcel, type ReportColumn } from "@/lib/reportExport";

type DonationStatus = "Pending Review" | "Approved" | "Rejected";
type ContributionType = "Financial" | "In-Kind" | "Volunteer Service" | "Project Support";
type ContributionCategory = "All" | "Donation" | "Volunteer Service" | "Project Support";

const CONTRIBUTION_TYPES: ContributionType[] = ["Financial", "In-Kind", "Volunteer Service", "Project Support"];
const CONTRIBUTION_CATEGORIES: Array<{ value: ContributionCategory; label: string }> = [
  { value: "All", label: "All" },
  { value: "Donation", label: "Donation" },
  { value: "Volunteer Service", label: "Volunteer Service" },
  { value: "Project Support", label: "Project Support" },
];

interface Donation {
  id: string;
  user_id: string | null;
  contribution_type: ContributionType;
  contribution_date: string | null;
  method: string;
  amount: number;
  created_at: string | null;
  purpose: string | null;
  activity_name: string | null;
  volunteer_hours: number | null;
  quantity_description: string | null;
  estimated_value: number | null;
  supporting_information: string | null;
  status: DonationStatus;
  ref_number: string | null;
  receipt_url: string | null;
  message: string | null;
  is_anonymous?: boolean;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  profile: {
    name: string;
    email?: string | null;
    student_id: string | null;
    batch: string | null;
    course: string | null;
  };
}

interface DonationSettings {
  gcash_name: string;
  gcash_number: string;
  gcash_qr: string;
  personal_personnel: string;
  personal_contact: string;
  personal_office: string;
}

interface DonationSummary {
  approvedTotal: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  donorCount: number;
  totalDonations: number;
}

interface OpportunitySubmission {
  id: number;
  opportunityType: "Volunteer Service" | "Project Support";
  announcementTitle: string;
  availability?: string | null;
  preferredRole?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  estimatedValue?: number | null;
  status: string;
  assignedRole?: string | null;
  attendanceStatus?: string | null;
  actualHours?: number | null;
  fulfilledQuantity?: number | null;
  fulfilledValue?: number | null;
  adminNotes?: string | null;
  profile: { name: string; email?: string | null; studentId?: string | null; course?: string | null; batch?: string | null };
}

const EMPTY_SETTINGS: DonationSettings = {
  gcash_name: "",
  gcash_number: "",
  gcash_qr: "",
  personal_personnel: "",
  personal_contact: "",
  personal_office: "",
};

const EMPTY_SUMMARY: DonationSummary = {
  approvedTotal: 0,
  approvedCount: 0,
  pendingCount: 0,
  rejectedCount: 0,
  donorCount: 0,
  totalDonations: 0,
};

const EMPTY_WALK_IN_FORM = {
  donorName: "",
  donorEmail: "",
  donorStudentId: "",
  donorBatch: "",
  donorCourse: "",
  contributionType: "Financial" as ContributionType,
  contributionDate: new Date().toISOString().slice(0, 10),
  amount: "",
  purpose: "",
  activityName: "",
  volunteerHours: "",
  quantityDescription: "",
  estimatedValue: "",
  supportingInformation: "",
  evidenceUrl: "",
  message: "",
  isAnonymous: false,
};

const statusTone: Record<DonationStatus, string> = {
  Approved: "bg-emerald-100 text-emerald-700",
  "Pending Review": "bg-amber-100 text-amber-700",
  Rejected: "bg-rose-100 text-rose-700",
};

const DONATION_PAGE_SIZE = 10;

export default function AdminDonations() {
  const { profile, user, role } = useAuth();
  const [search, setSearch] = useState("");
  const [donations, setDonations] = useState<Donation[]>([]);
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filter, setFilter] = useState<"All" | DonationStatus>("All");
  const [typeFilter, setTypeFilter] = useState<ContributionCategory>("Donation");
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [walkInForm, setWalkInForm] = useState(EMPTY_WALK_IN_FORM);
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false);
  const [actionNote, setActionNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState<"" | "approve" | "reject" | "request-info">("");
  const [settings, setSettings] = useState<DonationSettings>(EMPTY_SETTINGS);
  const [summary, setSummary] = useState<DonationSummary>(EMPTY_SUMMARY);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [showSettingsVerify, setShowSettingsVerify] = useState(false);
  const [settingsPassword, setSettingsPassword] = useState("");
  const [showSettingsPassword, setShowSettingsPassword] = useState(false);
  const [verifyingSettings, setVerifyingSettings] = useState(false);
  const [settingsVerifyError, setSettingsVerifyError] = useState("");
  const [donationPage, setDonationPage] = useState(1);
  const [opportunitySubmissions, setOpportunitySubmissions] = useState<OpportunitySubmission[]>([]);
  const [selectedOpportunitySubmission, setSelectedOpportunitySubmission] = useState<OpportunitySubmission | null>(null);
  const [opportunityAction, setOpportunityAction] = useState({ status: "", assignedRole: "", attendanceStatus: "", actualHours: "", fulfilledQuantity: "", fulfilledValue: "", adminNotes: "" });
  const [savingOpportunityAction, setSavingOpportunityAction] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const officerRole = role === "alumni" ? null : role;
  const canVerifyContributions = hasPermission(officerRole, "donations.verify");
  const canApproveContributions = hasPermission(officerRole, "donations.approve");
  const canExportContributions = hasPermission(officerRole, "reports.view");
  const canManagePaymentSettings = role === "admin";

  useEffect(() => {
    void Promise.all([fetchDonations(), fetchDonationSummary()]);
    void fetchOpportunitySubmissions();
  }, []);

  const fetchDonations = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/donations`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<Donation[]>(res);
      setDonations(data.map((donation) => ({
        ...donation,
        contribution_type: donation.contribution_type || "Financial",
        amount: Number(donation.amount || 0),
        volunteer_hours: donation.volunteer_hours === null ? null : Number(donation.volunteer_hours || 0),
        estimated_value: donation.estimated_value === null ? null : Number(donation.estimated_value || 0),
      })));
    } catch (error) {
      clientLogger.error(error);
      toast.error("Failed to load donations");
    } finally {
      setLoading(false);
    }
  };

  const fetchDonationSummary = async () => {
    try {
      const res = await fetch(`${API_URL}/donations/summary`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<Partial<DonationSummary>>(res);
      setSummary({
        approvedTotal: Number(data.approvedTotal || 0),
        approvedCount: Number(data.approvedCount || 0),
        pendingCount: Number(data.pendingCount || 0),
        rejectedCount: Number(data.rejectedCount || 0),
        donorCount: Number(data.donorCount || 0),
        totalDonations: Number(data.totalDonations || 0),
      });
    } catch (error) {
      clientLogger.error(error);
      toast.error("Failed to load donation totals");
    }
  };

  const fetchOpportunitySubmissions = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/contribution-submissions`, { headers: getAuthHeaders() });
      setOpportunitySubmissions(await readApiResponse<OpportunitySubmission[]>(response));
    } catch (error) {
      clientLogger.error(error);
    }
  };

  const openOpportunitySubmission = (submission: OpportunitySubmission) => {
    setSelectedOpportunitySubmission(submission);
    setOpportunityAction({
      status: submission.status,
      assignedRole: submission.assignedRole || "",
      attendanceStatus: submission.attendanceStatus || "",
      actualHours: submission.actualHours == null ? "" : String(submission.actualHours),
      fulfilledQuantity: submission.fulfilledQuantity == null ? "" : String(submission.fulfilledQuantity),
      fulfilledValue: submission.fulfilledValue == null ? "" : String(submission.fulfilledValue),
      adminNotes: submission.adminNotes || "",
    });
  };

  const updateOpportunitySubmission = async () => {
    if (!selectedOpportunitySubmission) return;
    try {
      setSavingOpportunityAction(true);
      const response = await fetch(`${API_URL}/admin/contribution-submissions/${selectedOpportunitySubmission.id}/status`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(opportunityAction),
      });
      await readApiResponse(response);
      toast.success("Contribution lifecycle updated");
      setSelectedOpportunitySubmission(null);
      await Promise.all([fetchOpportunitySubmissions(), fetchDonations(), fetchDonationSummary()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update contribution lifecycle");
    } finally {
      setSavingOpportunityAction(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/settings/donation`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<Partial<DonationSettings>>(res);
      setSettings({
        gcash_name: data.gcash_name ?? "",
        gcash_number: data.gcash_number ?? "",
        gcash_qr: data.gcash_qr ?? "",
        personal_personnel: data.personal_personnel ?? "",
        personal_contact: data.personal_contact ?? "",
        personal_office: data.personal_office ?? "",
      });
    } catch (error) {
      clientLogger.error(error);
      toast.error("Failed to load donation settings");
    }
  };

  const openDonationDetail = async (donationId: string) => {
    try {
      setLoadingDetail(true);
      const detailRequest = fetch(`${API_URL}/donations/${donationId}`, { headers: getAuthHeaders() });
      const [detailResponse] = await Promise.all(canApproveContributions
        ? [detailRequest, fetch(`${API_URL}/donations/${donationId}/review`, { method: "POST", headers: getAuthHeaders() })]
        : [detailRequest]);
      const detail = await readApiResponse<Donation>(detailResponse);
      setSelectedDonation(detail);
      setActionNote(detail.review_notes || "");
    } catch (error) {
      clientLogger.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to open donation details");
    } finally {
      setLoadingDetail(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSavingSettings(true);
      const response = await fetch(`${API_URL}/settings/donation`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      await readApiResponse(response);
      toast.success("Donation payment settings saved");
    } catch (error) {
      clientLogger.error(error);
      toast.error("Failed to save payment settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const openSettingsAccess = async () => {
    if (settingsUnlocked) {
      await fetchSettings();
      setShowSettings(true);
      return;
    }

    setSettingsPassword("");
    setSettingsVerifyError("");
    setShowSettingsPassword(false);
    setShowSettingsVerify(true);
  };

  const verifySettingsPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settingsPassword.trim()) {
      setSettingsVerifyError("Enter your current admin password.");
      return;
    }

    try {
      setVerifyingSettings(true);
      setSettingsVerifyError("");
      const response = await fetch(`${API_URL}/settings/donation/verify-password`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ password: settingsPassword }),
      });
      await readApiResponse(response);
      setSettingsUnlocked(true);
      setShowSettingsVerify(false);
      setSettingsPassword("");
      await fetchSettings();
      setShowSettings(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Incorrect password. Please try again.";
      setSettingsVerifyError(message === "Unauthorized" ? "Incorrect password. Please try again." : message);
    } finally {
      setVerifyingSettings(false);
    }
  };

  const handleQRUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setSettings((current) => ({ ...current, gcash_qr: String(loadEvent.target?.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  const updateDonationStatus = async (status: "Approved" | "Rejected") => {
    if (!selectedDonation) return;

    try {
      setSubmittingAction(status === "Approved" ? "approve" : "reject");
      const response = await fetch(`${API_URL}/donations/${selectedDonation.id}/status`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNotes: actionNote }),
      });
      const payload = await readApiResponse<{ donation: Donation }>(response);
      const updatedDonation = { ...payload.donation, amount: Number(payload.donation.amount || 0) };
      setDonations((current) => current.map((item) => (item.id === selectedDonation.id ? { ...item, ...updatedDonation } : item)));
      setSelectedDonation((current) => (current ? { ...current, ...updatedDonation } : current));
      await fetchDonationSummary();
      const isFinancialDonation = selectedDonation.contribution_type === "Financial";
      toast.success(status === "Approved" ? (isFinancialDonation ? "Donation approved" : "Contribution verified") : `${isFinancialDonation ? "Donation" : "Contribution"} rejected`);
    } catch (error) {
      clientLogger.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update donation status");
    } finally {
      setSubmittingAction("");
    }
  };

  const requestMoreInfo = async () => {
    if (!selectedDonation) return;
    const isFinancialDonation = selectedDonation.contribution_type === "Financial";
    if (!actionNote.trim()) {
      toast.error(`Add the information you need from the ${isFinancialDonation ? "donor" : "contributor"} first`);
      return;
    }

    try {
      setSubmittingAction("request-info");
      const response = await fetch(`${API_URL}/donations/${selectedDonation.id}/request-info`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ notes: actionNote }),
      });
      await readApiResponse(response);
      toast.success(`More information requested from ${isFinancialDonation ? "donor" : "contributor"}`);
      setSelectedDonation((current) => (current ? { ...current, review_notes: actionNote, status: "Pending Review" } : current));
      setDonations((current) =>
        current.map((item) =>
          item.id === selectedDonation.id ? { ...item, review_notes: actionNote, status: "Pending Review" } : item,
        ),
      );
      await fetchDonationSummary();
    } catch (error) {
      clientLogger.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to request more info");
    } finally {
      setSubmittingAction("");
    }
  };

  const handleContributionEvidenceUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Supporting evidence must be an image or PDF file");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Supporting evidence must be 5 MB or smaller");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setWalkInForm((current) => ({ ...current, evidenceUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const submitWalkInDonation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSubmittingWalkIn(true);
      const response = await fetch(`${API_URL}/admin/donations/walk-in`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...walkInForm,
          amount: Number(walkInForm.amount),
        }),
      });
      await readApiResponse(response);
      setWalkInForm(EMPTY_WALK_IN_FORM);
      setShowWalkInForm(false);
      setFilter("Approved");
      await Promise.all([fetchDonations(), fetchDonationSummary()]);
      toast.success(walkInForm.contributionType === "Financial" ? "Donation recorded and approved" : "Contribution recorded as verified");
    } catch (error) {
      clientLogger.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to record walk-in donation");
    } finally {
      setSubmittingWalkIn(false);
    }
  };

  const moduleDonations = useMemo(
    () => donations.filter((donation) => CONTRIBUTION_TYPES.includes(donation.contribution_type)),
    [donations],
  );

  const filteredDonations = useMemo(() => {
    const searchText = search.toLowerCase();
    return (filter === "All" ? moduleDonations : moduleDonations.filter((donation) => donation.status === filter)).filter(
      (donation) =>
        (typeFilter === "All" ||
          (typeFilter === "Donation"
            ? donation.contribution_type === "Financial" || donation.contribution_type === "In-Kind"
            : donation.contribution_type === typeFilter)) &&
        (!searchText ||
          donation.profile.name.toLowerCase().includes(searchText) ||
          donation.id.toLowerCase().includes(searchText) ||
          (donation.profile.student_id || "").toLowerCase().includes(searchText) ||
          (donation.activity_name || "").toLowerCase().includes(searchText) ||
          (donation.purpose || "").toLowerCase().includes(searchText)),
    );
  }, [moduleDonations, filter, typeFilter, search]);

  const totalDonationPages = Math.max(1, Math.ceil(filteredDonations.length / DONATION_PAGE_SIZE));
  const paginatedDonations = useMemo(() => {
    const start = (donationPage - 1) * DONATION_PAGE_SIZE;
    return filteredDonations.slice(start, start + DONATION_PAGE_SIZE);
  }, [donationPage, filteredDonations]);

  useEffect(() => {
    setDonationPage(1);
  }, [filter, typeFilter, search]);

  useEffect(() => {
    setDonationPage((current) => Math.min(current, totalDonationPages));
  }, [totalDonationPages]);

  const totalApproved = summary.approvedTotal;
  const isDonationCategory = typeFilter === "Donation";
  const pendingCount = isDonationCategory
    ? summary.pendingCount
    : filteredDonations.filter((donation) => donation.status === "Pending Review").length;
  const recordButtonLabel = getRecordButtonLabel(typeFilter);
  const selectedIsFinancial = selectedDonation?.contribution_type === "Financial";
  const walkInIsFinancial = walkInForm.contributionType === "Financial";
  const walkInTypeOptions = typeFilter === "Donation"
    ? (["Financial", "In-Kind"] as ContributionType[])
    : typeFilter === "All"
      ? CONTRIBUTION_TYPES
      : ([typeFilter] as ContributionType[]);
  const filteredOpportunitySubmissions = opportunitySubmissions.filter((submission) =>
    (typeFilter === "Volunteer Service" || typeFilter === "Project Support") &&
    submission.opportunityType === typeFilter &&
    (!search || submission.profile.name.toLowerCase().includes(search.toLowerCase()) || submission.announcementTitle.toLowerCase().includes(search.toLowerCase())));

  const exportExcel = async () => {
    type DonationExportRow = Record<string, string | number>;
    const columns: Array<ReportColumn<DonationExportRow>> = [
      { key: "id", label: "ID" },
      { key: "donor", label: "Donor" },
      { key: "studentId", label: "Student ID" },
      { key: "type", label: "Contribution Type" },
      { key: "method", label: "Method" },
      { key: "amount", label: "Amount" },
      { key: "estimatedValue", label: "Estimated Value" },
      { key: "volunteerHours", label: "Volunteer Hours" },
      { key: "date", label: "Date" },
      { key: "activity", label: "Activity / Project" },
      { key: "purpose", label: "Purpose" },
      { key: "status", label: "Status" },
    ];
    const rows = filteredDonations.map((donation) => ({
      id: donation.id,
      donor: donation.profile.name,
      studentId: donation.profile.student_id ?? "",
      type: donation.contribution_type,
      method: donation.method,
      amount: donation.amount,
      estimatedValue: donation.estimated_value ?? 0,
      volunteerHours: donation.volunteer_hours ?? 0,
      date: donation.contribution_date ?? donation.created_at ?? "",
      activity: donation.activity_name ?? "",
      purpose: donation.purpose ?? "",
      status: donation.status,
    }));

    await downloadBrandedExcel({
      title: isDonationCategory ? "Donations Report" : "Alumni Contribution Tracking Report",
      filename: isDonationCategory ? "donations" : "alumni-contributions",
      columns,
      rows,
      preparedBy: profile?.name || user?.email || "System Administrator",
      summary: [
        { label: isDonationCategory ? "Displayed Donations" : "Displayed Contributions", value: filteredDonations.length },
        { label: "Displayed Value", value: `PHP ${filteredDonations.reduce((total, donation) => total + (donation.contribution_type === "Financial" ? donation.amount : Number(donation.estimated_value || 0)), 0).toLocaleString()}` },
        { label: "Approved Financial Donations", value: `PHP ${totalApproved.toLocaleString()}` },
        { label: "Pending Review", value: pendingCount },
      ],
    });
  };

  return (
    <AdminLayout title="Contributions">
      <div className="space-y-4">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm" aria-label="Contribution categories">
          {CONTRIBUTION_CATEGORIES.map((category) => (
            <button
              key={category.value}
              type="button"
              onClick={() => {
                setTypeFilter(category.value);
              }}
              className={cn("h-8 whitespace-nowrap rounded-md px-3 text-[11px] font-semibold transition-colors", typeFilter === category.value ? "bg-navy text-white" : "bg-white text-muted-foreground hover:text-navy-dark")}
            >
              {category.label}
            </button>
          ))}
        </div>

        {(typeFilter === "Volunteer Service" || typeFilter === "Project Support") && filteredOpportunitySubmissions.length > 0 && (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-navy">
                    <tr><th className="px-3 py-2">Alumni</th><th className="px-3 py-2">Opportunity</th><th className="px-3 py-2">Offer</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-center">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredOpportunitySubmissions.map((submission) => (
                      <tr key={submission.id}>
                        <td className="px-3 py-2"><p className="font-semibold text-navy-dark">{submission.profile.name}</p><p className="text-[10px] text-muted-foreground">{[submission.profile.course, submission.profile.batch].filter(Boolean).join(" / ") || submission.profile.studentId || "Alumni"}</p></td>
                        <td className="px-3 py-2 text-muted-foreground">{submission.announcementTitle}</td>
                        <td className="px-3 py-2 text-muted-foreground">{submission.opportunityType === "Volunteer Service" ? submission.preferredRole || submission.availability || "Volunteer" : submission.description || "Project support"}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{submission.status}</Badge></td>
                        <td className="px-3 py-2 text-center"><Button type="button" size="sm" variant="outline" onClick={() => openOpportunitySubmission(submission)}>Manage</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className={cn("border-b border-slate-200 bg-slate-50 px-4", isDonationCategory ? "py-4" : "py-3")}>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <div className={cn("relative w-full", isDonationCategory ? "sm:w-48" : "sm:w-52")}>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isDonationCategory ? "Search donor or ID" : "Search contributor or activity"} className={cn("w-full border-slate-300 bg-white pl-8 text-xs", isDonationCategory ? "h-10" : "h-9")} />
                </div>

                <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
                  <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                  {(["All", "Pending Review", "Approved", "Rejected"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setFilter(status)}
                      className={cn(
                        "h-7 whitespace-nowrap rounded-md px-2.5 text-[11px] font-medium transition-colors",
                        filter === status ? "bg-navy text-white" : "text-muted-foreground hover:text-navy-dark",
                      )}
                    >
                      {!isDonationCategory && status === "Approved" ? "Verified" : status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:items-center">
                {canVerifyContributions && <Button type="button" size="sm" className="w-full lg:w-auto" onClick={() => {
                  setWalkInForm((current) => ({
                    ...current,
                    contributionType: isDonationCategory
                      ? "Financial"
                      : (typeFilter !== "All" ? typeFilter : "Volunteer Service"),
                  }));
                  setShowWalkInForm(true);
                }}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {recordButtonLabel}
                </Button>}
                {isDonationCategory && canManagePaymentSettings && <Button type="button" size="sm" variant="outline" className="w-full lg:w-auto" onClick={() => void openSettingsAccess()}>
                  <Settings className="mr-1.5 h-3.5 w-3.5" />
                  Payment Settings
                </Button>}
                {canExportContributions && <Button type="button" size="sm" className="w-full lg:w-auto" onClick={() => void exportExcel()}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export Excel
                </Button>}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto" tabIndex={0} aria-label={isDonationCategory ? "Donation records table" : "Contribution records table"}>
              <table className="w-full table-fixed text-[13px]">
                {isDonationCategory ? <colgroup>
                  <col className="w-[20%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[11%]" />
                  <col className="w-[13%]" /><col className="w-[18%]" /><col className="w-[10%]" /><col className="w-[8%]" />
                </colgroup> : <colgroup>
                  <col className="w-[19%]" /><col className="w-[18%]" /><col className="w-[14%]" /><col className="w-[12%]" />
                  <col className="w-[19%]" /><col className="w-[10%]" /><col className="w-[8%]" />
                </colgroup>}
                <thead className="bg-slate-50">
                  <tr>
                    {(isDonationCategory
                      ? ["Donor", "Student ID", "Method / Type", "Amount / Items", "Date Submitted", "Purpose", "Status", "Action"]
                      : ["Contributor", "Type", "Value / Hours", "Date", "Activity / Purpose", "Status", "Action"]
                    ).map((heading) => (
                      <th key={heading} className={cn("px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-navy", heading === "Status" || heading === "Action" ? "text-center" : "text-left")}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {loading ? (
                    <tr>
                      <td colSpan={isDonationCategory ? 8 : 7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        Loading
                      </td>
                    </tr>
                  ) : filteredDonations.length === 0 ? (
                    <tr>
                      <td colSpan={isDonationCategory ? 8 : 7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        No {isDonationCategory ? "donations" : "contributions"} matched the current filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedDonations.map((donation) => (
                      <tr key={donation.id} className="odd:bg-white even:bg-slate-50/60 transition-colors hover:bg-navy/5">
                        <td className="px-3 py-2.5 align-middle" data-label={isDonationCategory ? "Donor" : "Contributor"}>
                          <div>
                            <p className="truncate text-[13px] font-semibold text-navy-dark" title={donation.profile.name}>{donation.profile.name}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={donation.profile.email || "No email"}>{donation.profile.email || "No email"}</p>
                          </div>
                        </td>
                        {isDonationCategory && <td className="truncate px-3 py-2.5 text-[13px] text-muted-foreground" data-label="Student ID" title={donation.profile.student_id || "Not set"}>{donation.profile.student_id || "Not set"}</td>}
                        <td className="px-3 py-2.5 align-middle" data-label={isDonationCategory ? "Method / Type" : "Type"}>
                          <span className={cn("inline-flex max-w-full truncate rounded-full px-2 py-1 text-xs font-medium", isDonationCategory ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700")} title={isDonationCategory && donation.contribution_type === "Financial" ? donation.method : donation.contribution_type}>
                            {isDonationCategory && donation.contribution_type === "Financial" ? donation.method : donation.contribution_type}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold text-navy-dark" data-label={isDonationCategory ? "Amount / Items" : "Value / Hours"}>{formatContributionMeasure(donation)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-muted-foreground" data-label={isDonationCategory ? "Date Submitted" : "Date"} title={donation.created_at ? new Date(donation.created_at).toLocaleString() : "Not set"}>{isDonationCategory ? (donation.created_at ? new Date(donation.created_at).toLocaleDateString() : "Not set") : formatContributionDate(donation)}</td>
                        <td className="truncate px-3 py-2.5 text-[13px] text-muted-foreground" data-label={isDonationCategory ? "Purpose" : "Activity / Purpose"} title={(isDonationCategory ? donation.purpose : donation.activity_name || donation.purpose) || "General support"}>{(isDonationCategory ? donation.purpose : donation.activity_name || donation.purpose) || "General support"}</td>
                        <td className="px-3 py-2.5 text-center align-middle" data-label="Status">
                          <Badge className={statusTone[donation.status]}>{!isDonationCategory && donation.status === "Approved" ? "Verified" : donation.status}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle" data-label="Action">
                          <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" title={isDonationCategory ? "View donation details" : "View contribution details"} onClick={() => openDonationDetail(donation.id)}>
                            <Eye className="h-3.5 w-3.5" />
                            <span className="ml-1.5">View</span>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={donationPage}
              pageSize={DONATION_PAGE_SIZE}
              totalItems={filteredDonations.length}
              totalPages={totalDonationPages}
              onPageChange={setDonationPage}
            />
          </CardContent>
        </Card>
        <div className="flex justify-end px-1">
          <p className="text-[11px] text-muted-foreground">
            Total approved amount <span className="ml-1 font-semibold text-navy-dark">PHP {totalApproved.toLocaleString()}</span>
          </p>
        </div>
      </div>

      <Dialog open={Boolean(selectedOpportunitySubmission)} onOpenChange={(open) => !savingOpportunityAction && !open && setSelectedOpportunitySubmission(null)}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
          {selectedOpportunitySubmission && <>
            <DialogHeader><DialogTitle>{selectedOpportunitySubmission.profile.name}</DialogTitle><DialogDescription>{selectedOpportunitySubmission.announcementTitle}</DialogDescription></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Lifecycle status">
                <select value={opportunityAction.status} onChange={(event) => setOpportunityAction((current) => ({ ...current, status: event.target.value }))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                  {(selectedOpportunitySubmission.opportunityType === "Volunteer Service" ? ["Registered", "Accepted", "Rejected", "Withdrawn", "Attended", "Completed", "Verified", "Cancelled"] : ["Offered", "Accepted", "In Progress", "Fulfilled", "Verified", "Rejected", "Cancelled"]).map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              {selectedOpportunitySubmission.opportunityType === "Volunteer Service" ? <>
                <Field label="Assigned role"><Input value={opportunityAction.assignedRole} onChange={(event) => setOpportunityAction((current) => ({ ...current, assignedRole: event.target.value }))} /></Field>
                <Field label="Attendance"><select value={opportunityAction.attendanceStatus} onChange={(event) => setOpportunityAction((current) => ({ ...current, attendanceStatus: event.target.value }))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">Not recorded</option><option>Attended</option><option>No-show</option><option>Cancelled</option></select></Field>
                <Field label="Actual hours"><Input type="number" min="0" step="0.25" value={opportunityAction.actualHours} onChange={(event) => setOpportunityAction((current) => ({ ...current, actualHours: event.target.value }))} /></Field>
              </> : <>
                <Field label="Fulfilled quantity"><Input type="number" min="0" step="0.01" value={opportunityAction.fulfilledQuantity} onChange={(event) => setOpportunityAction((current) => ({ ...current, fulfilledQuantity: event.target.value }))} /></Field>
                <Field label="Fulfilled value (PHP)"><Input type="number" min="0" step="0.01" value={opportunityAction.fulfilledValue} onChange={(event) => setOpportunityAction((current) => ({ ...current, fulfilledValue: event.target.value }))} /></Field>
              </>}
              <div className="sm:col-span-2"><Field label="Administrator notes"><Textarea rows={3} value={opportunityAction.adminNotes} onChange={(event) => setOpportunityAction((current) => ({ ...current, adminNotes: event.target.value }))} /></Field></div>
            </div>
            <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSelectedOpportunitySubmission(null)}>Cancel</Button><Button type="button" disabled={savingOpportunityAction || !canVerifyContributions} onClick={() => void updateOpportunitySubmission()}>{savingOpportunityAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save</Button></div>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedDonation)} onOpenChange={(open) => !submittingAction && !loadingDetail && !open && setSelectedDonation(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-slate-200 bg-white p-4 shadow-2xl sm:p-4">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading
            </div>
          ) : selectedDonation ? (
            <>
              <DialogHeader className="gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusTone[selectedDonation.status]}>{!selectedIsFinancial && selectedDonation.status === "Approved" ? "Verified" : selectedDonation.status}</Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white">
                    {selectedIsFinancial ? selectedDonation.method : selectedDonation.contribution_type}
                  </Badge>
                </div>
                <DialogTitle className="pr-8 text-base text-navy-dark">{selectedDonation.profile.name}</DialogTitle>
                <DialogDescription className="text-xs">{selectedIsFinancial ? "Review donor details before approval or rejection." : "Verify the alumnus, activity, and supporting evidence before making this an official contribution."}</DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailCard label={selectedIsFinancial ? "Donor Name" : "Contributor"} value={selectedDonation.profile.name} />
                  <DetailCard label={selectedIsFinancial ? "Donor Visibility" : "Visibility"} value={selectedDonation.is_anonymous ? "Anonymous publicly" : selectedIsFinancial ? "Named donor" : "Named contributor"} />
                  {!selectedIsFinancial && <DetailCard label="Contribution Type" value={selectedDonation.contribution_type} />}
                  <DetailCard label={selectedIsFinancial ? "Date Submitted" : "Contribution Date"} value={selectedIsFinancial ? (selectedDonation.created_at ? new Date(selectedDonation.created_at).toLocaleString() : "Not set") : formatContributionDate(selectedDonation)} />
                  <DetailCard label={selectedIsFinancial ? "Amount" : "Value / Hours"} value={formatContributionMeasure(selectedDonation)} />
                  {selectedIsFinancial && <DetailCard label="Payment Method" value={selectedDonation.method} />}
                  <DetailCard label="Student ID" value={selectedDonation.profile.student_id || "Not set"} />
                  <DetailCard label="Course / Batch" value={`${selectedDonation.profile.course || "No course"} / ${selectedDonation.profile.batch || "No batch"}`} />
                  <DetailCard label="Purpose" value={selectedDonation.purpose || (selectedIsFinancial ? "General donation" : "General support")} />
                  {!selectedIsFinancial && <DetailCard label="Activity / Project" value={selectedDonation.activity_name || "Not specified"} />}
                  {!selectedIsFinancial && <DetailCard label="Items / Quantity" value={selectedDonation.quantity_description || "Not applicable"} />}
                  <DetailCard label="Reference Number" value={selectedDonation.ref_number || (selectedIsFinancial ? "Not provided" : "Not applicable")} />
                  <DetailCard label="Email" value={selectedDonation.profile.email || "Not provided"} />
                </div>

                {(selectedDonation.receipt_url || selectedDonation.contribution_type === "Financial") && <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{selectedIsFinancial ? "Proof of Payment" : "Supporting Image"}</h3>
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {selectedDonation.receipt_url ? (
                      isPdfEvidence(selectedDonation.receipt_url)
                        ? <a href={selectedDonation.receipt_url} target="_blank" rel="noreferrer" className="flex min-h-20 items-center justify-center px-4 text-xs font-semibold text-navy underline">Open supporting PDF</a>
                        : <img src={resolveAssetUrl(selectedDonation.receipt_url) || selectedDonation.receipt_url} alt="Proof of payment" className="max-h-60 w-full object-contain" />
                    ) : (
                      <div className="px-4 py-8 text-center text-xs text-muted-foreground">{selectedIsFinancial ? "No proof of payment uploaded." : "No supporting image uploaded."}</div>
                    )}
                  </div>
                </section>}

                {selectedDonation.supporting_information && <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Supporting Information</h3>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-foreground">{selectedDonation.supporting_information}</p>
                </section>}

                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Notes / Message</h3>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-foreground">{selectedDonation.message || `No ${selectedIsFinancial ? "donor" : "contributor"} message provided.`}</p>
                </section>

                {(canVerifyContributions || canApproveContributions) && <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <Label htmlFor="review-note" className="text-xs font-semibold text-navy-dark">
                    Admin review notes
                  </Label>
                  <Textarea
                    id="review-note"
                    rows={2}
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                    className="mt-2 min-h-16 border-slate-300 bg-white text-xs"
                    placeholder="Add rejection notes, request details, or internal review remarks."
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Use this for rejection notes or information requests.</p>
                </section>}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end [&_button]:h-9 [&_button]:text-xs">
                  <Button type="button" variant="outline" onClick={() => setSelectedDonation(null)} disabled={Boolean(submittingAction)}>
                    Close
                  </Button>
                  {canVerifyContributions && <Button type="button" variant="outline" onClick={requestMoreInfo} disabled={Boolean(submittingAction)}>
                    {submittingAction === "request-info" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading
                      </>
                    ) : (
                      <>
                        <Pencil className="mr-2 h-4 w-4" />
                        Request More Info
                      </>
                    )}
                  </Button>}
                  {canApproveContributions && <Button type="button" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => updateDonationStatus("Rejected")} disabled={Boolean(submittingAction)}>
                    {submittingAction === "reject" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject {selectedIsFinancial ? "Donation" : "Contribution"}
                      </>
                    )}
                  </Button>}
                  {canApproveContributions && <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => updateDonationStatus("Approved")} disabled={Boolean(submittingAction)}>
                    {submittingAction === "approve" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {selectedIsFinancial ? "Approve Donation" : "Verify Contribution"}
                      </>
                    )}
                  </Button>}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showWalkInForm} onOpenChange={(open) => !submittingWalkIn && setShowWalkInForm(open)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
          <DialogHeader className="gap-1">
            <DialogTitle className="pr-8 text-lg text-navy-dark">{walkInIsFinancial ? "Record Personal / Walk-in Donation" : "Record Alumni Contribution"}</DialogTitle>
            <DialogDescription className="text-xs">
              {walkInIsFinancial ? "Enter the donor information. This record is approved immediately and does not require a receipt image." : "Record verified institutional support. Matching email or alumni ID links the alumnus account."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitWalkInDonation} className="mt-2 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={walkInIsFinancial ? "Donor Name *" : "Contributor Name *"}>
                <Input required maxLength={255} value={walkInForm.donorName} onChange={(event) => setWalkInForm((current) => ({ ...current, donorName: event.target.value }))} placeholder="Full name" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>
              <Field label="Email">
                <Input type="email" maxLength={255} value={walkInForm.donorEmail} onChange={(event) => setWalkInForm((current) => ({ ...current, donorEmail: event.target.value }))} placeholder="Optional email" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>
              <Field label="Alumni / Student ID">
                <Input maxLength={100} value={walkInForm.donorStudentId} onChange={(event) => setWalkInForm((current) => ({ ...current, donorStudentId: event.target.value }))} placeholder="e.g. 2026-0001" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>
              <Field label="Batch">
                <Input maxLength={100} value={walkInForm.donorBatch} onChange={(event) => setWalkInForm((current) => ({ ...current, donorBatch: event.target.value }))} placeholder="e.g. 2026" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>
              <Field label="Course">
                <Input maxLength={255} value={walkInForm.donorCourse} onChange={(event) => setWalkInForm((current) => ({ ...current, donorCourse: event.target.value }))} placeholder="Optional course" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>
              {walkInTypeOptions.length > 1 && <Field label={isDonationCategory ? "Donation Type *" : "Contribution Type *"}>
                <select required value={walkInForm.contributionType} onChange={(event) => setWalkInForm((current) => ({ ...current, contributionType: event.target.value as ContributionType }))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                  {walkInTypeOptions.map((type) => <option key={type} value={type}>{type === "Financial" ? "Financial Donation" : type === "In-Kind" ? "In-Kind Donation" : type}</option>)}
                </select>
              </Field>}
              {!walkInIsFinancial && <Field label="Contribution Date *">
                <Input required type="date" value={walkInForm.contributionDate} onChange={(event) => setWalkInForm((current) => ({ ...current, contributionDate: event.target.value }))} className="h-9 border-slate-300 bg-white text-sm" />
              </Field>}
              {walkInIsFinancial && <Field label="Donation Amount (PHP) *">
                <Input required type="number" inputMode="decimal" min="1" step="0.01" value={walkInForm.amount} onChange={(event) => setWalkInForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Enter exact amount" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>}
              {!walkInIsFinancial && <Field label="Estimated Value (PHP)">
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={walkInForm.estimatedValue} onChange={(event) => setWalkInForm((current) => ({ ...current, estimatedValue: event.target.value }))} placeholder="Optional equivalent value" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>}
              {walkInForm.contributionType === "Volunteer Service" && <Field label="Volunteer Hours *">
                <Input required type="number" min="0.25" step="0.25" value={walkInForm.volunteerHours} onChange={(event) => setWalkInForm((current) => ({ ...current, volunteerHours: event.target.value }))} placeholder="Service hours" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>}
              {walkInForm.contributionType === "In-Kind" && <Field label="Items / Quantity *">
                <Input required maxLength={255} value={walkInForm.quantityDescription} onChange={(event) => setWalkInForm((current) => ({ ...current, quantityDescription: event.target.value }))} placeholder="e.g. 10 desktop computers" className="h-9 border-slate-300 bg-white text-sm" />
              </Field>}
              <div className="sm:col-span-2">
                <Field label={walkInIsFinancial ? "Specific Purpose *" : "Purpose / Form of Support *"}>
                  <Input required maxLength={255} value={walkInForm.purpose} onChange={(event) => setWalkInForm((current) => ({ ...current, purpose: event.target.value }))} placeholder={walkInIsFinancial ? "What the donation is for" : "What the contribution supported"} className="h-9 border-slate-300 bg-white text-sm" />
                </Field>
              </div>
              {!walkInIsFinancial && <div className="sm:col-span-2">
                <Field label={walkInForm.contributionType === "Project Support" ? "Related Activity / Project *" : "Related Activity / Project"}>
                  <Input required={walkInForm.contributionType === "Project Support"} maxLength={255} value={walkInForm.activityName} onChange={(event) => setWalkInForm((current) => ({ ...current, activityName: event.target.value }))} placeholder="Institutional activity, project, session, or program" className="h-9 border-slate-300 bg-white text-sm" />
                </Field>
              </div>}
              {!walkInIsFinancial && <div className="sm:col-span-2">
                <Field label="Supporting Information">
                  <Textarea rows={2} maxLength={2000} value={walkInForm.supportingInformation} onChange={(event) => setWalkInForm((current) => ({ ...current, supportingInformation: event.target.value }))} placeholder="Evidence, contact person, location, or verification details" className="min-h-16 border-slate-300 bg-white text-sm" />
                </Field>
              </div>}
              {!walkInIsFinancial && <div className="sm:col-span-2">
                <Field label="Supporting Evidence">
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 text-xs text-muted-foreground hover:border-navy">
                    <Upload className="h-3.5 w-3.5" />
                    <span>{walkInForm.evidenceUrl ? "Evidence attached" : "Optional photo or PDF, up to 5 MB"}</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleContributionEvidenceUpload} />
                  </label>
                </Field>
              </div>}
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <Textarea rows={2} value={walkInForm.message} onChange={(event) => setWalkInForm((current) => ({ ...current, message: event.target.value }))} placeholder="Optional walk-in notes" className="min-h-16 border-slate-300 bg-white text-sm" />
                </Field>
              </div>
            </div>

            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-navy-dark">
              <input type="checkbox" checked={walkInForm.isAnonymous} onChange={(event) => setWalkInForm((current) => ({ ...current, isAnonymous: event.target.checked }))} className="h-3.5 w-3.5 accent-navy" />
              {walkInIsFinancial ? "Donate anonymously" : "Keep contributor anonymous publicly"}
            </label>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setShowWalkInForm(false)} disabled={submittingWalkIn}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={submittingWalkIn}>
                {submittingWalkIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</> : <><CheckCircle2 className="mr-2 h-4 w-4" />{walkInIsFinancial ? "Save as Approved" : "Save as Verified"}</>}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettingsVerify} onOpenChange={(open) => !verifyingSettings && setShowSettingsVerify(open)}>
        <DialogContent className="max-w-md border-slate-200 bg-white shadow-2xl">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-white">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <DialogTitle className="pr-8 text-xl text-navy-dark">Enter Verification Password</DialogTitle>
            <DialogDescription>
              Verification is required before opening Payment Settings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={verifySettingsPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="donation-settings-password" className="text-sm font-medium text-navy-dark">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="donation-settings-password"
                  type={showSettingsPassword ? "text" : "password"}
                  value={settingsPassword}
                  onChange={(event) => {
                    setSettingsPassword(event.target.value);
                    setSettingsVerifyError("");
                  }}
                  autoComplete="current-password"
                  className="border-slate-300 bg-white pr-11"
                  aria-invalid={Boolean(settingsVerifyError)}
                />
                <button
                  type="button"
                  onClick={() => setShowSettingsPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-slate-100 hover:text-navy"
                  aria-label={showSettingsPassword ? "Hide password" : "Show password"}
                >
                  {showSettingsPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {settingsVerifyError && (
                <p className="text-sm font-medium text-rose-600">
                  {settingsVerifyError}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setShowSettingsVerify(false)} disabled={verifyingSettings}>
                Cancel
              </Button>
              <Button type="submit" disabled={verifyingSettings || !settingsPassword.trim()} className="bg-navy text-white hover:bg-navy/90">
                {verifyingSettings ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Enter"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettings} onOpenChange={(open) => !savingSettings && setShowSettings(open)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">Donation Payment Settings</DialogTitle>
            <DialogDescription>Keep the payment instructions clean, visible, and easy for donors to follow.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-navy" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-navy-dark">GCash Details</h3>
              </div>

              <div className="mt-4 space-y-4">
                <Field label="Account Name">
                  <Input value={settings.gcash_name} onChange={(event) => setSettings((current) => ({ ...current, gcash_name: event.target.value }))} className="border-slate-300 bg-white" />
                </Field>
                <Field label="GCash Number">
                  <Input value={settings.gcash_number} onChange={(event) => setSettings((current) => ({ ...current, gcash_number: event.target.value }))} className="border-slate-300 bg-white" />
                </Field>
                <Field label="QR Code">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white">
                      {settings.gcash_qr ? <img src={settings.gcash_qr} alt="GCash QR" className="h-full w-full object-contain" /> : <QrCode className="h-10 w-10 text-slate-300" />}
                    </div>
                    <div className="flex-1">
                      <Button type="button" variant="outline" onClick={() => qrInputRef.current?.click()}>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload QR
                      </Button>
                      <input ref={qrInputRef} type="file" accept="image/*" className="hidden" onChange={handleQRUpload} />
                    </div>
                  </div>
                </Field>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-navy" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-navy-dark">Personal Payment</h3>
              </div>

              <div className="mt-4 space-y-4">
                <Field label="Contact Person">
                  <Input value={settings.personal_personnel} onChange={(event) => setSettings((current) => ({ ...current, personal_personnel: event.target.value }))} className="border-slate-300 bg-white" />
                </Field>
                <Field label="Contact Number">
                  <Input value={settings.personal_contact} onChange={(event) => setSettings((current) => ({ ...current, personal_contact: event.target.value }))} className="border-slate-300 bg-white" />
                </Field>
                <Field label="Office Address">
                  <Textarea value={settings.personal_office} onChange={(event) => setSettings((current) => ({ ...current, personal_office: event.target.value }))} className="border-slate-300 bg-white" rows={3} />
                </Field>
              </div>
            </section>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowSettings(false)} disabled={savingSettings}>
                Close
              </Button>
              <Button type="button" onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function PaginationControls({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {start}-{end} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          Previous
        </Button>
        <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-navy-dark">
          Page {page} of {totalPages}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          Next
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-navy-dark">{label}</span>
      {children}
    </label>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs text-foreground" title={value}>{value}</p>
    </div>
  );
}

function formatContributionMeasure(contribution: Donation) {
  if (contribution.contribution_type === "Financial") return `PHP ${contribution.amount.toLocaleString()}`;
  if (contribution.contribution_type === "Volunteer Service") return `${Number(contribution.volunteer_hours || 0).toLocaleString()} hours`;
  if (contribution.estimated_value) return `PHP ${contribution.estimated_value.toLocaleString()} est.`;
  return contribution.quantity_description || "Recorded";
}

function formatContributionDate(contribution: Donation) {
  const value = contribution.contribution_date || contribution.created_at;
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function isPdfEvidence(value: string) {
  return value.startsWith("data:application/pdf");
}

function getRecordButtonLabel(type: ContributionCategory) {
  switch (type) {
    case "Donation": return "Record Donation";
    case "Volunteer Service": return "Record Volunteer Service";
    case "Project Support": return "Record Project Support";
    default: return "Record Contribution";
  }
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
