import { clientLogger } from "@/lib/logger";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Heart,
  History as HistoryIcon,
  Loader2,
  Printer,
  QrCode,
  Smartphone,
  Upload,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSystemSettings } from "@/context/SystemSettingsContext";

interface DonationSettings {
  gcash_name: string;
  gcash_number: string;
  gcash_qr: string;
  personal_personnel: string;
  personal_contact: string;
  personal_office: string;
}

interface DonationConfirmation {
  id: number;
  contributionType: string;
  contributionDate: string;
  amount: number;
  method: string;
  status: string;
  purpose: string;
  refNumber?: string | null;
  message?: string | null;
  isAnonymous: boolean;
  createdAt: string;
}

type ContributionType = "Financial" | "In-Kind";

interface ContributionHistoryItem {
  id: number;
  contribution_type: ContributionType;
  contribution_date: string | null;
  amount: number;
  status: string;
  purpose: string;
  activity_name: string | null;
  volunteer_hours: number | null;
  quantity_description: string | null;
  estimated_value: number | null;
  review_notes: string | null;
}

const DONATION_TYPES: ContributionType[] = ["Financial", "In-Kind"];
const isContributionModule = false;
const opportunityHistory: Array<{
  id: number;
  announcementTitle: string;
  opportunityType: string;
  preferredRole?: string | null;
  description?: string | null;
  availability?: string | null;
  status: string;
  adminNotes?: string | null;
}> = [];

interface DonationSubmissionResponse {
  success: boolean;
  donation: DonationConfirmation | null;
}

const EMPTY_SETTINGS: DonationSettings = {
  gcash_name: "",
  gcash_number: "",
  gcash_qr: "",
  personal_personnel: "",
  personal_contact: "",
  personal_office: "",
};

const STEP_LABELS = ["Contribution", "Details", "Review"];

const createEmptyForm = (profile?: { name?: string | null; student_id?: string | null; batch?: string | null } | null) => ({
  fullName: profile?.name ?? "",
  alumniId: profile?.student_id ?? "",
  batch: profile?.batch ?? "",
  contributionType: "Financial" as ContributionType,
  contributionDate: new Date().toISOString().slice(0, 10),
  amount: "",
  purpose: "",
  activityName: "",
  volunteerHours: "",
  quantityDescription: "",
  estimatedValue: "",
  supportingInformation: "",
  refNumber: "",
  message: "",
  file: null as File | null,
  receiptPreview: "",
  personalConfirm: false,
});

export default function AlumniDonate() {
  const { user, profile } = useAuth();
  const { settings: brandingSettings } = useSystemSettings();
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState<"named" | "anonymous">("named");
  const [method, setMethod] = useState<"GCash" | "Personal">("GCash");
  const [history, setHistory] = useState<ContributionHistoryItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<DonationConfirmation | null>(null);
  const [settings, setSettings] = useState<DonationSettings>(EMPTY_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [showQrPreview, setShowQrPreview] = useState(false);
  const [donationHistoryOpen, setDonationHistoryOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(() => createEmptyForm(profile));
  const visibleHistory = history.filter((item) => DONATION_TYPES.includes(item.contribution_type));

  const set = (key: keyof typeof form, value: string | File | null | boolean) => {
    setFormError("");
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    setForm((current) => ({
      ...current,
      fullName: current.fullName || profile?.name || "",
      alumniId: current.alumniId || profile?.student_id || "",
      batch: current.batch || profile?.batch || "",
    }));
  }, [profile]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch(`${API_URL}/settings/donation`, { headers: getAuthHeaders() });
        const data = await readApiResponse<Partial<DonationSettings>>(response);
        setSettings({
          gcash_name: data?.gcash_name ?? "",
          gcash_number: data?.gcash_number ?? "",
          gcash_qr: data?.gcash_qr ?? "",
          personal_personnel: data?.personal_personnel ?? "",
          personal_contact: data?.personal_contact ?? "",
          personal_office: data?.personal_office ?? "",
        });
      } catch (error) {
        clientLogger.error(error);
      } finally {
        setLoadingSettings(false);
      }
    };

    void fetchSettings();
  }, []);

  const fetchHistory = async () => {
    try {
      const historyResponse = await fetch(`${API_URL}/alumni/donations`, { headers: getAuthHeaders() });
      setHistory(await readApiResponse<ContributionHistoryItem[]>(historyResponse));
    } catch (error) {
      clientLogger.error(error);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, []);

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isFinancialDonation = form.contributionType === "Financial";
    const acceptsEvidence = !isFinancialDonation && file.type === "application/pdf";
    if (!file.type.startsWith("image/") && !acceptsEvidence) {
      setFormError(isFinancialDonation ? "Receipt must be an image file." : "Supporting evidence must be an image or PDF file.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError(`${isFinancialDonation ? "Receipt image" : "Supporting evidence"} must be 5 MB or smaller.`);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, file, receiptPreview: String(reader.result || "") }));
      setFormError("");
    };
    reader.readAsDataURL(file);
  };

  const validateStep = (currentStep: number) => {
    if (currentStep === 1) {
      if (!user) return "You must be signed in to submit a contribution.";
      if (!form.contributionDate) return "Enter the contribution date.";
      if (form.contributionType === "Financial") {
        const amount = Number(form.amount);
        if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid donation amount.";
      }
      if (form.contributionType === "In-Kind" && !form.quantityDescription.trim()) return "Describe the donated items and quantity.";
      if (form.estimatedValue && Number(form.estimatedValue) < 0) return "Estimated value cannot be negative.";
      if (!form.purpose.trim()) return "Enter the purpose or form of support.";
    }

    if (currentStep === 2 && form.contributionType === "Financial") {
      if (method === "GCash" && !form.refNumber.trim()) return "Enter the GCash reference number.";
      if (method === "GCash" && !form.receiptPreview) return "Upload a receipt image before continuing.";
      if (method === "Personal" && !form.personalConfirm) return "Confirm the walk-in payment instruction before continuing.";
    }

    return "";
  };

  const goNext = () => {
    const error = validateStep(step);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError("");
    setStep((current) => Math.min(3, current + 1));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < 3) {
      goNext();
      return;
    }

    const validationError = validateStep(1) || validateStep(2);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const response = await fetch(`${API_URL}/donations`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          contribution_type: form.contributionType,
          contribution_date: form.contributionDate,
          amount: form.contributionType === "Financial" ? Number(form.amount) : 0,
          purpose: form.purpose.trim(),
          activity_name: form.activityName.trim() || null,
          volunteer_hours: null,
          quantity_description: form.quantityDescription.trim() || null,
          estimated_value: form.estimatedValue ? Number(form.estimatedValue) : null,
          supporting_information: form.supportingInformation.trim() || null,
          method: form.contributionType === "Financial" ? method : "Non-Monetary",
          ref_number: form.contributionType === "Financial" && method === "GCash" ? form.refNumber.trim() : null,
          message: form.message.trim() || null,
          receipt_url: form.receiptPreview || null,
          isAnonymous: identity === "anonymous",
        }),
      });
      const data = await readApiResponse<DonationSubmissionResponse>(response);
      setConfirmation(data.donation || {
        id: 0,
        contributionType: form.contributionType,
        contributionDate: form.contributionDate,
        amount: form.contributionType === "Financial" ? Number(form.amount) : 0,
        method: form.contributionType === "Financial" ? method : "Non-Monetary",
        status: "Pending Review",
        purpose: form.purpose.trim(),
        refNumber: method === "GCash" ? form.refNumber.trim() : null,
        message: form.message.trim() || null,
        isAnonymous: identity === "anonymous",
        createdAt: new Date().toISOString(),
      });
      await fetchHistory();
    } catch (error) {
      clientLogger.error(error);
      setFormError(error instanceof Error ? error.message : "Failed to submit contribution.");
    } finally {
      setSubmitting(false);
    }
  };

  const startAnotherDonation = () => {
    setConfirmation(null);
    setStep(1);
    setIdentity("named");
    setMethod("GCash");
    setForm({ ...createEmptyForm(profile), contributionType: "Financial" });
    setFormError("");
  };

  if (confirmation) {
    const receiptNumber = confirmation.id > 0 ? `CON-${String(confirmation.id).padStart(6, "0")}` : "Pending assignment";
    return (
      <AlumniLayout title="Donation Receipt">
        <div className="mobile-compact-donation mx-auto max-w-xl">
          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-card print:shadow-none">
            <div className="bg-navy px-5 py-4 text-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">Submission receipt</p>
                  <h2 className="mt-1 text-lg font-bold">Donation Received</h2>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-300" />
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                This confirms submission only. Your donation remains pending until an administrator reviews its details.
              </div>

              <div className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm min-[360px]:grid-cols-2">
                <ReceiptField label="Receipt Number" value={receiptNumber} />
                <ReceiptField label="Status" value={confirmation.status || "Pending Review"} />
                <ReceiptField label="Submitted" value={formatDateTime(confirmation.createdAt)} />
                <ReceiptField label="Contributor" value={confirmation.isAnonymous ? "Anonymous Contributor" : form.fullName || "Alumni Contributor"} />
                <ReceiptField label="Type" value={confirmation.contributionType} />
                <ReceiptField label="Contribution Date" value={confirmation.contributionDate} />
                {confirmation.contributionType === "Financial" && <ReceiptField label="Amount" value={`PHP ${confirmation.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />}
                {confirmation.contributionType === "Financial" && <ReceiptField label="Payment Method" value={confirmation.method} />}
                <div className="min-[360px]:col-span-2"><ReceiptField label="Purpose" value={confirmation.purpose} /></div>
                {confirmation.refNumber && <ReceiptField label="Reference Number" value={confirmation.refNumber} />}
              </div>

              {form.receiptPreview && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Uploaded proof</p>
                  <img src={form.receiptPreview} alt="Submitted payment receipt" className="max-h-52 w-full rounded-lg border border-border object-contain" />
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row print:hidden">
                <button type="button" onClick={() => window.print()} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-xs font-semibold text-navy hover:bg-muted">
                  <Printer className="h-4 w-4" /> Print Receipt
                </button>
                <button type="button" onClick={startAnotherDonation} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-navy text-xs font-semibold text-white hover:bg-navy-light">
                  Add Another Donation
                </button>
              </div>
            </div>
          </section>
        </div>
      </AlumniLayout>
    );
  }

  return (
    <AlumniLayout title="Donation" subtitle={`Support ${brandingSettings.institutionName} through financial or in-kind donations`}>
      <div className="mobile-compact-donation mx-auto max-w-2xl">
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-border bg-white p-1.5 shadow-sm">
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            return (
              <button
                key={label}
                type="button"
                onClick={() => number < step && setStep(number)}
                disabled={number > step}
                className={`rounded-lg px-1.5 py-2 text-center transition ${number === step ? "bg-navy text-white" : number < step ? "text-navy" : "text-muted-foreground/60"}`}
              >
                <span className="block text-[10px] font-bold">{number}</span>
                <span className="hidden text-[10px] font-semibold sm:block">{label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit}>
          <section key={step} className="animate-in slide-in-from-right-4 rounded-xl border border-border bg-card p-4 shadow-card duration-200 sm:p-5">
            {step === 1 && (
              <div>
                <StepHeading number={1} title={`Donating as ${identity === "anonymous" ? "Anonymous Contributor" : form.fullName || "Alumni Contributor"}`} description="Select a donation type and provide its details." />
                <p className="mt-3 truncate text-[11px] text-muted-foreground">
                  Contributing as <span className="font-semibold text-foreground">{identity === "anonymous" ? "Anonymous Contributor" : form.fullName || "Alumni Contributor"}</span>
                  {form.alumniId ? ` · ID ${form.alumniId}` : ""}{form.batch ? ` · Batch ${form.batch}` : ""}
                </p>
                <label className="mt-3 inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/15 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={identity === "anonymous"}
                    onChange={(event) => setIdentity(event.target.checked ? "anonymous" : "named")}
                    className="h-3.5 w-3.5 accent-navy"
                  />
                  <span className="text-[11px] font-semibold text-navy-dark">Keep my name anonymous publicly</span>
                </label>
                <div className="mt-4 border-t border-border pt-4">
                  <h3 className="text-xs font-bold text-navy-dark">Donation details</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Financial and in-kind donations are reviewed in one donation workflow.</p>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Donation Type *</span>
                    <select value={form.contributionType} onChange={(event) => set("contributionType", event.target.value as ContributionType)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none">
                      {DONATION_TYPES.map((type) => <option key={type} value={type}>{type === "Financial" ? "Financial Donation" : "In-Kind Donation"}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Contribution Date *</span>
                    <input type="date" value={form.contributionDate} onChange={(event) => set("contributionDate", event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none" />
                  </label>
                  {form.contributionType === "Financial" && <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Donation Amount (PHP) *</span>
                    <input type="number" inputMode="decimal" min="1" step="0.01" value={form.amount} onChange={(event) => set("amount", event.target.value)} placeholder="Type amount" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none" />
                  </label>}
                  {form.contributionType === "In-Kind" && <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Items / Quantity *</span>
                    <input maxLength={255} value={form.quantityDescription} onChange={(event) => set("quantityDescription", event.target.value)} placeholder="e.g. 10 desktop computers" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none" />
                  </label>}
                  {form.contributionType !== "Financial" && <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Estimated Value (PHP)</span>
                    <input type="number" min="0" step="0.01" value={form.estimatedValue} onChange={(event) => set("estimatedValue", event.target.value)} placeholder="Optional equivalent value" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none" />
                  </label>}
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Purpose / Form of Support *</span>
                    <input type="text" maxLength={255} value={form.purpose} onChange={(event) => set("purpose", event.target.value)} placeholder="What your contribution supported" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Related Activity / Project</span>
                    <input type="text" maxLength={255} value={form.activityName} onChange={(event) => set("activityName", event.target.value)} placeholder="Institutional activity, project, or program" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-navy focus:outline-none" />
                  </label>
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-semibold text-navy">Supporting Information</span>
                  <textarea maxLength={2000} value={form.supportingInformation} onChange={(event) => set("supportingInformation", event.target.value)} rows={2} placeholder="Evidence, coordinator, location, or other verification details" className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-navy focus:outline-none" />
                </label>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-semibold text-navy">Notes / Message</span>
                  <textarea value={form.message} onChange={(event) => set("message", event.target.value)} rows={3} placeholder="Optional note for the admin review team" className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-navy focus:outline-none" />
                </label>
              </div>
            )}

            {step === 2 && (
              <div>
                <StepHeading number={2} title={form.contributionType === "Financial" ? "Payment details" : "Supporting evidence"} description={form.contributionType === "Financial" ? "Choose a payment method and follow its instructions." : "Optionally attach an image that helps administrators verify this contribution."} />
                {form.contributionType === "Financial" ? <>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(["GCash", "Personal"] as const).map((option) => (
                    <button key={option} type="button" onClick={() => setMethod(option)} className={`flex items-center gap-2 rounded-lg border p-3 text-left ${method === option ? "border-navy bg-navy/5 text-navy" : "border-border text-muted-foreground"}`}>
                      {option === "GCash" ? <Smartphone className="h-5 w-5" /> : <User className="h-5 w-5" />}
                      <span className="text-xs font-semibold">{option === "GCash" ? "GCash" : "Personal / Walk-in"}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
                  {loadingSettings ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading</div>
                  ) : method === "GCash" ? (
                    <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                      <button type="button" onClick={() => settings.gcash_qr && setShowQrPreview(true)} className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-white p-2">
                        {settings.gcash_qr ? <img src={settings.gcash_qr} alt="GCash QR" className="max-h-28 object-contain" /> : <QrCode className="h-8 w-8 text-muted-foreground" />}
                      </button>
                      <div className="space-y-2">
                        <InfoRow label="Account Name" value={settings.gcash_name || "Not set yet"} />
                        <InfoRow label="GCash Number" value={settings.gcash_number || "Not set yet"} />
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold text-navy">Reference Number *</span>
                          <input value={form.refNumber} onChange={(event) => set("refNumber", event.target.value)} placeholder="Enter GCash reference" className="h-9 w-full rounded-md border border-border bg-white px-2.5 text-xs font-mono" />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <InfoCard label="Contact Person" value={settings.personal_personnel || "Not set yet"} />
                        <InfoCard label="Contact Number" value={settings.personal_contact || "Not set yet"} />
                        <InfoCard label="Office / Location" value={settings.personal_office || "Not set yet"} />
                      </div>
                      <label className="flex items-start gap-2 rounded-lg border border-border bg-white p-2.5 text-xs">
                        <input type="checkbox" checked={form.personalConfirm} onChange={(event) => set("personalConfirm", event.target.checked)} className="mt-0.5" />
                        I understand the walk-in instructions and have coordinated the payment.
                      </label>
                    </div>
                  )}
                </div>

                {method === "GCash" && (
                  <div className="mt-3">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Receipt Image *</span>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground hover:border-navy">
                      <Upload className="h-4 w-4" />
                      <span className="truncate">{form.file ? form.file.name : "Upload receipt or proof of payment"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleReceiptChange} />
                    </label>
                    {form.receiptPreview && <img src={form.receiptPreview} alt="Receipt preview" className="mt-2 max-h-48 w-full rounded-lg border border-border object-contain" />}
                  </div>
                )}
                </> : (
                  <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
                    <span className="mb-1.5 block text-xs font-semibold text-navy">Supporting Evidence</span>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-white px-3 py-3 text-xs text-muted-foreground hover:border-navy">
                      <Upload className="h-4 w-4" />
                      <span className="truncate">{form.file ? form.file.name : "Upload an optional photo or PDF"}</span>
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleReceiptChange} />
                    </label>
                    {form.receiptPreview && (form.file?.type === "application/pdf"
                      ? <p className="mt-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-navy">PDF ready: {form.file.name}</p>
                      : <img src={form.receiptPreview} alt="Contribution supporting preview" className="mt-2 max-h-48 w-full rounded-lg border border-border object-contain" />)}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div>
                <StepHeading number={3} title="Review and confirm" description="Check every detail before submitting for administrator verification." />
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <ReviewItem label="Contributor" value={identity === "anonymous" ? "Anonymous Contributor" : form.fullName || "Alumni Contributor"} />
                  <ReviewItem label="Type" value={form.contributionType} />
                  <ReviewItem label="Date" value={form.contributionDate} />
                  {form.contributionType === "Financial" && <ReviewItem label="Amount" value={`PHP ${Number(form.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />}
                  {form.contributionType === "In-Kind" && <ReviewItem label="Items / Quantity" value={form.quantityDescription} />}
                  {form.contributionType !== "Financial" && form.estimatedValue && <ReviewItem label="Estimated Value" value={`PHP ${Number(form.estimatedValue).toLocaleString()}`} />}
                  <ReviewItem label="Purpose" value={form.purpose} />
                  {form.activityName && <ReviewItem label="Activity / Project" value={form.activityName} />}
                  {form.contributionType === "Financial" && <ReviewItem label="Payment" value={method} />}
                  {form.contributionType === "Financial" && method === "GCash" && <ReviewItem label="Reference" value={form.refNumber} />}
                  {form.file && <ReviewItem label="Proof" value={form.file.name} />}
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  Submission creates a confirmation receipt, but the contribution remains Pending Review until verified by an administrator.
                </div>
              </div>
            )}

            {formError && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</div>}

            <div className="mobile-action-group mt-5 flex items-center justify-between gap-2 min-[380px]:flex-row">
              <button type="button" onClick={() => { setStep((current) => Math.max(1, current - 1)); setFormError(""); }} disabled={step === 1 || submitting} className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-navy disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              {step < 3 ? (
                <button type="button" onClick={goNext} className="inline-flex h-10 items-center gap-1 rounded-lg bg-navy px-4 text-xs font-semibold text-white hover:bg-navy-light">
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button type="submit" disabled={submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy px-4 text-xs font-semibold text-white hover:bg-navy-light disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
                  {submitting ? "Loading" : "Submit Donation"}
                </button>
              )}
            </div>
          </section>
        </form>

        {isContributionModule && opportunityHistory.length > 0 && (
          <section className="mt-4 rounded-xl border border-border bg-white p-3 shadow-sm">
            <div className="space-y-2">
              {opportunityHistory.map((item) => (
                <div key={item.id} className="grid gap-1 rounded-lg border border-border px-3 py-2 text-xs sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold text-navy-dark">{item.announcementTitle}</p><p className="truncate text-[10px] text-muted-foreground">{item.opportunityType} · {item.preferredRole || item.description || item.availability || "Submission"}</p></div>
                  <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{item.status}</span>
                  {item.adminNotes && <p className="text-[10px] text-muted-foreground sm:col-span-2">Admin note: {item.adminNotes}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <button
        type="button"
        onClick={() => setDonationHistoryOpen(true)}
        className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1.5 rounded-l-xl bg-navy px-2.5 py-3 text-[10px] font-semibold text-white shadow-lg transition hover:bg-navy-light focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        aria-label="Open donation history"
        aria-controls="alumni-donation-history"
        aria-expanded={donationHistoryOpen}
      >
        <HistoryIcon className="h-4 w-4" />
        <span className="hidden sm:inline">History</span>
      </button>

      {donationHistoryOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/35"
            onClick={() => setDonationHistoryOpen(false)}
            aria-label="Close donation history"
          />
          <aside
            id="alumni-donation-history"
            className="fixed inset-y-0 right-0 z-50 flex w-[min(92vw,24rem)] animate-in flex-col border-l border-border bg-white shadow-2xl slide-in-from-right-full duration-200"
            aria-label="My Donation History"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <HistoryIcon className="h-4 w-4 text-navy" />
                <h2 className="text-sm font-bold text-navy-dark">My Donation History</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">{visibleHistory.length} records</span>
                <button type="button" onClick={() => setDonationHistoryOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-navy" aria-label="Close donation history panel">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
              {visibleHistory.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-dark">{item.activity_name || item.purpose}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.contribution_type} · {item.contribution_date || "Date not set"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.status === "Approved" ? "bg-emerald-100 text-emerald-700" : item.status === "Rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{item.status}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{formatHistoryMeasure(item)}</p>
                  {item.review_notes && <p className="mt-1 text-[10px] text-muted-foreground">Admin note: {item.review_notes}</p>}
                </div>
              ))}
              {visibleHistory.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No donations submitted yet.</p>}
            </div>
          </aside>
        </>
      )}

      {showQrPreview && settings.gcash_qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setShowQrPreview(false)}>
          <div className="relative max-w-3xl rounded-2xl bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setShowQrPreview(false)} className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white" aria-label="Close QR preview"><X className="h-4 w-4" /></button>
            <img src={settings.gcash_qr} alt="GCash QR enlarged" className="max-h-[80vh] w-full rounded-xl object-contain" />
          </div>
        </div>
      )}
    </AlumniLayout>
  );
}

function StepHeading({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">{number}</span>
      <div><h2 className="text-sm font-bold text-navy-dark">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-white px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 text-xs font-medium text-foreground">{value}</p></div>;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-white px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 text-[11px] leading-4 text-foreground">{value}</p></div>;
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/15 px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 break-words text-xs font-medium text-foreground">{value}</p></div>;
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-0.5 break-words text-xs font-semibold text-navy-dark">{value}</p></div>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatHistoryMeasure(item: ContributionHistoryItem) {
  if (item.contribution_type === "Financial") return `PHP ${Number(item.amount || 0).toLocaleString()}`;
  if (item.estimated_value) return `PHP ${Number(item.estimated_value).toLocaleString()} est.`;
  return item.quantity_description || "Recorded";
}
