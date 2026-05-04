import { ChangeEvent, useEffect, useState } from "react";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { AlertCircle, Clock, Heart, Loader2, MapPin, QrCode, Smartphone, Upload, User, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const PURPOSES = ["Scholarship Fund", "Campus Development", "General Fund", "Sports & Events", "Library Fund"];

interface DonationSettings {
  gcash_name: string;
  gcash_number: string;
  gcash_qr: string;
  personal_personnel: string;
  personal_contact: string;
  personal_office: string;
}

const EMPTY_SETTINGS: DonationSettings = {
  gcash_name: "",
  gcash_number: "",
  gcash_qr: "",
  personal_personnel: "",
  personal_contact: "",
  personal_office: "",
};

export default function AlumniDonate() {
  const { user, profile } = useAuth();
  const [method, setMethod] = useState<"GCash" | "Personal">("GCash");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settings, setSettings] = useState<DonationSettings>(EMPTY_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [showQrPreview, setShowQrPreview] = useState(false);
  const [form, setForm] = useState({
    fullName: profile?.name ?? "",
    alumniId: profile?.student_id ?? "",
    batch: profile?.batch ?? "",
    amount: "",
    purpose: "Scholarship Fund",
    refNumber: "",
    message: "",
    file: null as File | null,
    receiptPreview: "",
    personalConfirm: false,
  });
  const set = (k: string, v: string | File | null | boolean) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/settings/donation`, {
          headers: getAuthHeaders(),
        });

        if (!res.ok) {
          throw new Error("Failed to load donation settings");
        }

        const data = await res.json();
        setSettings({
          gcash_name: data?.gcash_name ?? "",
          gcash_number: data?.gcash_number ?? "",
          gcash_qr: data?.gcash_qr ?? "",
          personal_personnel: data?.personal_personnel ?? "",
          personal_contact: data?.personal_contact ?? "",
          personal_office: data?.personal_office ?? "",
        });
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingSettings(false);
      }
    };

    fetchSettings();
  }, []);

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        file,
        receiptPreview: String(reader.result || ""),
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.receiptPreview) {
      return;
    }

    if (method === "Personal" && !form.personalConfirm) {
      return;
    }

    setSubmitting(true);
    try {
      await fetch(`${API_URL}/donations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          purpose: form.purpose,
          method,
          ref_number: method === "GCash" ? form.refNumber || null : null,
          message: form.message || null,
          receipt_url: form.receiptPreview,
        }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <AlumniLayout title="Make a Donation">
        <div className="mx-auto mt-8 max-w-lg text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
            <Clock className="h-10 w-10 text-amber-600" />
          </div>
          <h2 className="mb-2 text-2xl font-display font-bold text-navy-dark">Donation Submitted for Review</h2>
          <p className="mb-6 text-muted-foreground">
            Your donation of <strong className="text-navy">PHP {parseFloat(form.amount || "0").toLocaleString()}</strong> for{" "}
            <strong className="text-navy">{form.purpose}</strong> is now{" "}
            <span className="font-semibold text-amber-600">Pending Review</span>.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="rounded-lg bg-navy px-6 py-3 font-medium text-white transition-colors hover:bg-navy-light"
            type="button"
          >
            Make Another Donation
          </button>
        </div>
      </AlumniLayout>
    );
  }

  return (
    <AlumniLayout title="Make a Donation" subtitle="Support SaCC students and programs">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 rounded-xl p-5 shadow-gold" style={{ background: "var(--gradient-gold)" }}>
          <div className="flex items-center gap-3">
            <Heart className="h-8 w-8 text-navy-dark" />
            <div>
              <p className="text-lg font-display font-bold text-navy-dark">Your Donation Matters</p>
              <p className="text-sm text-navy/70">Every contribution helps support SaCC students.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-display font-bold text-navy-dark">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">1</span>
              Donor Information
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Full Name</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Alumni ID</label>
                <input
                  type="text"
                  value={form.alumniId}
                  readOnly
                  className="w-full rounded-lg border border-border bg-muted px-3 py-3 text-sm font-mono"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Batch Year</label>
                <input
                  type="text"
                  value={form.batch}
                  readOnly
                  className="w-full rounded-lg border border-border bg-muted px-3 py-3 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-display font-bold text-navy-dark">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">2</span>
              Select Payment Method
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {(["GCash", "Personal"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 transition-all ${
                    method === m ? "border-navy bg-navy/5" : "border-border hover:border-navy/40"
                  }`}
                >
                  {m === "GCash" ? (
                    <Smartphone className={`h-6 w-6 ${method === m ? "text-navy" : "text-muted-foreground"}`} />
                  ) : (
                    <User className={`h-6 w-6 ${method === m ? "text-navy" : "text-muted-foreground"}`} />
                  )}
                  <div className="text-left">
                    <p className={`text-sm font-semibold ${method === m ? "text-navy-dark" : "text-muted-foreground"}`}>
                      {m === "GCash" ? "GCash" : "Personal Payment"}
                    </p>
                    <p className="text-xs text-muted-foreground">{m === "GCash" ? "Online transfer" : "Walk-in / cash"}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
              {loadingSettings ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading payment details...
                </div>
              ) : method === "GCash" ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-navy-dark">
                    <QrCode className="h-4 w-4" />
                    GCash Payment Details
                  </div>
                  <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
                    <button
                      type="button"
                      onClick={() => settings.gcash_qr && setShowQrPreview(true)}
                      className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-border bg-white p-4 transition hover:border-navy/40"
                    >
                      {settings.gcash_qr ? (
                        <img src={settings.gcash_qr} alt="GCash QR" className="max-h-44 w-auto object-contain" />
                      ) : (
                        <div className="text-center text-sm text-muted-foreground">
                          <QrCode className="mx-auto mb-2 h-10 w-10 text-muted-foreground/50" />
                          QR code not uploaded yet.
                        </div>
                      )}
                    </button>
                    <div className="space-y-3">
                      <InfoRow label="Account Name" value={settings.gcash_name || "Not set yet"} />
                      <InfoRow label="GCash Number" value={settings.gcash_number || "Not set yet"} />
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                        Click the QR code to view it larger, send your donation, then enter the reference number and upload the receipt image below.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-navy-dark">
                    <MapPin className="h-4 w-4" />
                    Walk-In / Personal Payment Details
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <InfoCard label="Contact Person" value={settings.personal_personnel || "Not set yet"} />
                    <InfoCard label="Contact Number" value={settings.personal_contact || "Not set yet"} />
                    <InfoCard label="Office / Location" value={settings.personal_office || "Not set yet"} />
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Bring your donation personally to the contact person or office above, then upload your receipt or acknowledgment image before submitting this form.
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={form.personalConfirm}
                      onChange={(e) => set("personalConfirm", e.target.checked)}
                      className="mt-1"
                    />
                    <span>I understand that this method is for walk-in or personal donation payment and I will coordinate using the details shown above.</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-display font-bold text-navy-dark">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">3</span>
              Donation Information
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-navy">Donation Amount (PHP) *</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => set("amount", e.target.value)}
                    required
                    min="1"
                    placeholder="Enter amount"
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm focus:border-navy focus:outline-none"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[100, 500, 1000, 5000].map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => set("amount", String(a))}
                        className={`rounded border px-2 py-1 text-xs transition-colors ${
                          form.amount === String(a)
                            ? "border-navy bg-navy text-white"
                            : "border-border text-muted-foreground hover:border-navy"
                        }`}
                      >
                        PHP {a.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-navy">Donation Purpose *</label>
                  <select
                    value={form.purpose}
                    onChange={(e) => set("purpose", e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm focus:border-navy focus:outline-none"
                  >
                    {PURPOSES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {method === "GCash" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-navy">GCash Reference Number *</label>
                  <input
                    type="text"
                    value={form.refNumber}
                    onChange={(e) => set("refNumber", e.target.value)}
                    required
                    placeholder="e.g. 231507XXXXXX"
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm font-mono focus:border-navy focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Receipt Image *</label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4 text-sm text-muted-foreground transition hover:border-navy">
                  <Upload className="h-5 w-5" />
                  <span>{form.file ? form.file.name : "Upload receipt or proof of payment"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleReceiptChange} required />
                </label>
                {form.receiptPreview && (
                  <img
                    src={form.receiptPreview}
                    alt="Receipt preview"
                    className="mt-3 h-48 w-full rounded-xl border border-border object-cover"
                  />
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-navy">Notes / Message</label>
                <textarea
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  rows={3}
                  placeholder="Optional note for the admin review team"
                  className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm resize-none focus:border-navy focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <p>
                Donations are submitted for admin approval first. Please make sure your payment method, receipt image, and details are complete before sending this form.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !form.receiptPreview || (method === "Personal" && !form.personalConfirm)}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-navy-dark shadow-gold transition-all disabled:opacity-50"
            style={{ background: "var(--gradient-gold)" }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
            {submitting ? "Submitting..." : "Submit Donation for Approval"}
          </button>
        </form>
      </div>

      {showQrPreview && settings.gcash_qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setShowQrPreview(false)}>
          <div className="relative max-w-3xl rounded-2xl bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowQrPreview(false)}
              className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white transition hover:bg-black"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={settings.gcash_qr} alt="GCash QR enlarged" className="max-h-[80vh] w-full rounded-xl object-contain" />
          </div>
        </div>
      )}
    </AlumniLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}
