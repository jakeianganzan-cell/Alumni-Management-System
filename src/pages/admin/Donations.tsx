import { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Filter,
  Heart,
  Loader2,
  LockKeyhole,
  Pencil,
  QrCode,
  Search,
  Settings,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { downloadBrandedCsv, type ReportColumn } from "@/lib/reportExport";

type DonationStatus = "Pending Review" | "Approved" | "Rejected";

interface Donation {
  id: string;
  user_id: string;
  method: string;
  amount: number;
  created_at: string | null;
  purpose: string | null;
  status: DonationStatus;
  ref_number: string | null;
  receipt_url: string | null;
  message: string | null;
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

const statusTone: Record<DonationStatus, string> = {
  Approved: "bg-emerald-100 text-emerald-700",
  "Pending Review": "bg-amber-100 text-amber-700",
  Rejected: "bg-rose-100 text-rose-700",
};

const methodTone: Record<string, string> = {
  GCash: "bg-blue-100 text-blue-700",
  Personal: "bg-violet-100 text-violet-700",
};

export default function AdminDonations() {
  const { profile, user } = useAuth();
  const [search, setSearch] = useState("");
  const [donations, setDonations] = useState<Donation[]>([]);
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filter, setFilter] = useState<"All" | DonationStatus>("All");
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
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
  const qrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void Promise.all([fetchDonations(), fetchDonationSummary()]);
  }, []);

  const fetchDonations = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/donations`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<Donation[]>(res);
      setDonations(data.map((donation) => ({ ...donation, amount: Number(donation.amount || 0) })));
    } catch (error) {
      console.error(error);
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
      console.error(error);
      toast.error("Failed to load donation totals");
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
      console.error(error);
      toast.error("Failed to load donation settings");
    }
  };

  const openDonationDetail = async (donationId: string) => {
    try {
      setLoadingDetail(true);
      const [detailResponse] = await Promise.all([
        fetch(`${API_URL}/donations/${donationId}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/donations/${donationId}/review`, { method: "POST", headers: getAuthHeaders() }),
      ]);
      const detail = await readApiResponse<Donation>(detailResponse);
      setSelectedDonation(detail);
      setActionNote(detail.review_notes || "");
    } catch (error) {
      console.error(error);
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
      console.error(error);
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
      toast.success(status === "Approved" ? "Donation approved" : "Donation rejected");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update donation status");
    } finally {
      setSubmittingAction("");
    }
  };

  const requestMoreInfo = async () => {
    if (!selectedDonation) return;
    if (!actionNote.trim()) {
      toast.error("Add the information you need from the donor first");
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
      toast.success("More information requested from donor");
      setSelectedDonation((current) => (current ? { ...current, review_notes: actionNote, status: "Pending Review" } : current));
      setDonations((current) =>
        current.map((item) =>
          item.id === selectedDonation.id ? { ...item, review_notes: actionNote, status: "Pending Review" } : item,
        ),
      );
      await fetchDonationSummary();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to request more info");
    } finally {
      setSubmittingAction("");
    }
  };

  const filteredDonations = (filter === "All" ? donations : donations.filter((donation) => donation.status === filter)).filter(
    (donation) =>
      !search ||
      donation.profile.name.toLowerCase().includes(search.toLowerCase()) ||
      donation.id.includes(search) ||
      (donation.profile.student_id || "").toLowerCase().includes(search.toLowerCase()),
  );

  const totalApproved = summary.approvedTotal;
  const pendingCount = summary.pendingCount;
  const rejectedCount = summary.rejectedCount;
  const donorCount = summary.donorCount;

  const exportCSV = () => {
    type DonationCsvRow = Record<string, string | number>;
    const columns: Array<ReportColumn<DonationCsvRow>> = [
      { key: "id", label: "ID" },
      { key: "donor", label: "Donor" },
      { key: "studentId", label: "Student ID" },
      { key: "method", label: "Method" },
      { key: "amount", label: "Amount" },
      { key: "date", label: "Date" },
      { key: "purpose", label: "Purpose" },
      { key: "status", label: "Status" },
    ];
    const rows = filteredDonations.map((donation) => ({
      id: donation.id,
      donor: donation.profile.name,
      studentId: donation.profile.student_id ?? "",
      method: donation.method,
      amount: donation.amount,
      date: donation.created_at ?? "",
      purpose: donation.purpose ?? "",
      status: donation.status,
    }));

    downloadBrandedCsv({
      title: "Donation Monitoring Report",
      filename: "donations",
      columns,
      rows,
      preparedBy: profile?.name || user?.email || "System Administrator",
      summary: [
        { label: "Displayed Records", value: filteredDonations.length },
        { label: "Displayed Amount", value: `PHP ${filteredDonations.reduce((total, donation) => total + Number(donation.amount || 0), 0).toLocaleString()}` },
        { label: "Approved Total", value: `PHP ${totalApproved.toLocaleString()}` },
        { label: "Pending Review", value: pendingCount },
      ],
    });
  };

  return (
    <AdminLayout title="Donation Monitoring" subtitle="Review donor details, confirm approvals carefully, and keep the review flow consistent">
      <div className="space-y-6">
        <div className="grid gap-3 lg:grid-cols-4">
          <SummaryCard label="Total Approved" value={`PHP ${totalApproved.toLocaleString()}`} toneClassName="bg-navy text-white" icon={<Heart className="h-4 w-4" />} />
          <SummaryCard label="Pending Review" value={String(pendingCount)} toneClassName="bg-white text-navy-dark" icon={<Clock3 className="h-4 w-4 text-amber-600" />} />
          <SummaryCard label="Rejected" value={String(rejectedCount)} toneClassName="bg-white text-navy-dark" icon={<XCircle className="h-4 w-4 text-rose-600" />} />
          <SummaryCard label="Total Donors" value={String(donorCount)} toneClassName="bg-white text-navy-dark" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-slate-50">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle className="text-lg text-navy-dark">Donation Review Queue</CardTitle>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search donor or ID" className="h-10 w-48 border-slate-300 bg-white pl-8" />
                </div>

                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                  <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                  {(["All", "Pending Review", "Approved", "Rejected"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setFilter(status)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        filter === status ? "bg-navy text-white" : "text-muted-foreground hover:text-navy-dark",
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                <Button type="button" variant="outline" onClick={() => void openSettingsAccess()}>
                  <Settings className="mr-2 h-4 w-4" />
                  Payment Settings
                </Button>
                <Button type="button" onClick={exportCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {["Donor", "Student ID", "Method", "Amount", "Date Submitted", "Purpose", "Status", "Action"].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-navy">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        Loading donations...
                      </td>
                    </tr>
                  ) : filteredDonations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        No donations matched the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredDonations.map((donation) => (
                      <tr key={donation.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3.5" data-label="Donor">
                          <div>
                            <p className="font-semibold text-navy-dark">{donation.profile.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{donation.profile.email || "No email"}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground" data-label="Student ID">{donation.profile.student_id || "Not set"}</td>
                        <td className="px-4 py-3.5" data-label="Method">
                          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", methodTone[donation.method] || "bg-slate-100 text-slate-700")}>
                            {donation.method}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-navy-dark" data-label="Amount">PHP {donation.amount.toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-muted-foreground" data-label="Date Submitted">{donation.created_at ? new Date(donation.created_at).toLocaleString() : "Not set"}</td>
                        <td className="px-4 py-3.5 text-muted-foreground" data-label="Purpose">{donation.purpose || "General donation"}</td>
                        <td className="px-4 py-3.5" data-label="Status">
                          <Badge className={statusTone[donation.status]}>{donation.status}</Badge>
                        </td>
                        <td className="px-4 py-3.5" data-label="Action">
                          <Button type="button" variant="outline" size="sm" onClick={() => openDonationDetail(donation.id)}>
                            <Eye className="mr-2 h-3.5 w-3.5" />
                            View Details
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedDonation)} onOpenChange={(open) => !submittingAction && !loadingDetail && !open && setSelectedDonation(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading donation details...
            </div>
          ) : selectedDonation ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusTone[selectedDonation.status]}>{selectedDonation.status}</Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white">
                    {selectedDonation.method}
                  </Badge>
                </div>
                <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">{selectedDonation.profile.name}</DialogTitle>
                <DialogDescription>Review all donor details here before confirming approval or rejection.</DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailCard label="Donor Name" value={selectedDonation.profile.name} />
                  <DetailCard label="Amount" value={`PHP ${selectedDonation.amount.toLocaleString()}`} />
                  <DetailCard label="Payment Method" value={selectedDonation.method} />
                  <DetailCard label="Date Submitted" value={selectedDonation.created_at ? new Date(selectedDonation.created_at).toLocaleString() : "Not set"} />
                  <DetailCard label="Student ID" value={selectedDonation.profile.student_id || "Not set"} />
                  <DetailCard label="Course / Batch" value={`${selectedDonation.profile.course || "No course"} / ${selectedDonation.profile.batch || "No batch"}`} />
                  <DetailCard label="Purpose" value={selectedDonation.purpose || "General donation"} />
                  <DetailCard label="Reference Number" value={selectedDonation.ref_number || "Not provided"} />
                  <DetailCard label="Email" value={selectedDonation.profile.email || "Not provided"} />
                </div>

                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Proof of Payment</h3>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {selectedDonation.receipt_url ? (
                      <img src={resolveAssetUrl(selectedDonation.receipt_url) || selectedDonation.receipt_url} alt="Proof of payment" className="max-h-[420px] w-full object-contain" />
                    ) : (
                      <div className="px-6 py-16 text-center text-sm text-muted-foreground">No proof of payment uploaded.</div>
                    )}
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Notes / Message</h3>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{selectedDonation.message || "No donor message provided."}</p>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5">
                  <Label htmlFor="review-note" className="text-sm font-semibold text-navy-dark">
                    Admin review notes
                  </Label>
                  <Textarea
                    id="review-note"
                    rows={4}
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                    className="mt-3 border-slate-300 bg-white"
                    placeholder="Add rejection notes, request details, or internal review remarks."
                  />
                  <p className="mt-2 text-xs text-muted-foreground">Use this when rejecting a donation or when you need more information from the donor.</p>
                </section>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setSelectedDonation(null)} disabled={Boolean(submittingAction)}>
                    Close
                  </Button>
                  <Button type="button" variant="outline" onClick={requestMoreInfo} disabled={Boolean(submittingAction)}>
                    {submittingAction === "request-info" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Pencil className="mr-2 h-4 w-4" />
                        Request More Info
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => updateDonationStatus("Rejected")} disabled={Boolean(submittingAction)}>
                    {submittingAction === "reject" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject Donation
                      </>
                    )}
                  </Button>
                  <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => updateDonationStatus("Approved")} disabled={Boolean(submittingAction)}>
                    {submittingAction === "approve" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Approve Donation
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showSettingsVerify} onOpenChange={(open) => !verifyingSettings && setShowSettingsVerify(open)}>
        <DialogContent className="max-w-md border-slate-200 bg-white shadow-2xl">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-white">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <DialogTitle className="pr-8 text-xl text-navy-dark">Verify Admin Password</DialogTitle>
            <DialogDescription>
              Enter your current admin account password before opening Donation Settings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={verifySettingsPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="donation-settings-password" className="text-sm font-medium text-navy-dark">
                Current Password
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
                  "Confirm"
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
                    Saving...
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

function SummaryCard({
  label,
  value,
  toneClassName,
  icon,
}: {
  label: string;
  value: string;
  toneClassName: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 p-4 shadow-sm", toneClassName)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <div>{icon}</div>
      </div>
      <p className="mt-4 text-xl font-bold sm:text-2xl">{value}</p>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  );
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
