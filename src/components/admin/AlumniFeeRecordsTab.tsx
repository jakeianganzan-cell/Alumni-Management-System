import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, ClipboardList, Download, Eye, FilePlus2, Loader2, Pencil, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import { downloadBrandedExcel, openPrintableReport, type ReportColumn } from "@/lib/reportExport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Profile = { id: string; name: string; email?: string | null; student_id?: string | null; batch?: string | null; course?: string | null };
type CompletionStatus = "Complete" | "Incomplete";
type FeeTypeStatus = "Active" | "Archived";
type FeeType = { id: number; feeName: string; amount: number; description: string; applicableBatchYear: string; applicableProgramId: string; dueDate: string | null; assignedOfficerId: string; assignedOfficerName: string; isRequired: boolean; status: FeeTypeStatus; paymentInstruction: string };
type FeeItem = FeeType & { paymentId: number | null; paid: boolean; amountPaid: number; paidDate: string | null; receivedByName: string | null; paymentNote: string };
type FeeRecord = { alumniId: string; alumni: { name: string; email: string | null; studentId: string | null; batch: string | null; program: string | null }; status: CompletionStatus; requiredFeeCount: number; paidFeeCount: number; unpaidFeeCount: number; totalRequired: number; totalPaid: number; totalUnpaid: number; requiredFees: FeeItem[]; paidFees: FeeItem[]; unpaidFees: FeeItem[]; paymentInstruction: string };
type Summary = { totalAlumni: number; completeCount: number; incompleteCount: number; totalRequired: number; totalCollected: number; totalUnpaid: number; requiredFeeAssignments: number; paidFeeAssignments: number; unpaidFeeAssignments: number };
type FeeForm = { feeName: string; amount: string; description: string; applicableBatchYear: string; applicableProgramId: string; dueDate: string; assignedOfficerId: string; isRequired: boolean; status: FeeTypeStatus };
type MarkPaidForm = { amountPaid: string; paidDate: string; paymentNote: string };
type FeeRecordExportRow = { alumni: string; alumniId: string; batch: string; program: string; status: CompletionStatus; required: number; paid: number; unpaid: number; unpaidFees: string; totalUnpaid: number };

const statuses: CompletionStatus[] = ["Complete", "Incomplete"];
const feeStatuses: FeeTypeStatus[] = ["Active", "Archived"];
const blankSummary: Summary = { totalAlumni: 0, completeCount: 0, incompleteCount: 0, totalRequired: 0, totalCollected: 0, totalUnpaid: 0, requiredFeeAssignments: 0, paidFeeAssignments: 0, unpaidFeeAssignments: 0 };
const emptyFeeForm = (): FeeForm => ({ feeName: "", amount: "", description: "", applicableBatchYear: "", applicableProgramId: "", dueDate: "", assignedOfficerId: "", isRequired: true, status: "Active" });
const statusTone: Record<CompletionStatus, string> = { Complete: "bg-emerald-100 text-emerald-700", Incomplete: "bg-amber-100 text-amber-700" };
const feeStatusTone: Record<FeeTypeStatus, string> = { Active: "bg-emerald-100 text-emerald-700", Archived: "bg-slate-200 text-slate-700" };
const paymentInstruction = "Please pay personally or in person to the assigned alumni officer or authorized staff. The system records payment completion only and does not process online payments.";
const FEE_RECORDS_PAGE_SIZE = 10;

export function AlumniFeeRecordsTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [records, setRecords] = useState<FeeRecord[]>([]);
  const [summary, setSummary] = useState<Summary>(blankSummary);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeType | null>(null);
  const [feeForm, setFeeForm] = useState<FeeForm>(emptyFeeForm());
  const [selectedRecord, setSelectedRecord] = useState<FeeRecord | null>(null);
  const [markTarget, setMarkTarget] = useState<{ record: FeeRecord; fee: FeeItem } | null>(null);
  const [markForm, setMarkForm] = useState<MarkPaidForm>({ amountPaid: "", paidDate: new Date().toISOString().slice(0, 10), paymentNote: "" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [batchYear, setBatchYear] = useState("");
  const [program, setProgram] = useState("");
  const [assignedOfficerId, setAssignedOfficerId] = useState("");
  const [recordsPage, setRecordsPage] = useState(1);

  const query = useMemo(() => new URLSearchParams(Object.entries({ search, status, batchYear, program, assignedOfficerId }).filter(([, value]) => value)), [search, status, batchYear, program, assignedOfficerId]);
  const totalRecordPages = Math.max(1, Math.ceil(records.length / FEE_RECORDS_PAGE_SIZE));
  const paginatedRecords = useMemo(() => {
    const start = (recordsPage - 1) * FEE_RECORDS_PAGE_SIZE;
    return records.slice(start, start + FEE_RECORDS_PAGE_SIZE);
  }, [records, recordsPage]);

  const load = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [profilesResponse, feesResponse, recordsResponse, summaryResponse] = await Promise.all([
        fetch(`${API_URL}/profiles`, { headers }),
        fetch(`${API_URL}/admin/donations/fee-records/types?includeArchived=1`, { headers }),
        fetch(`${API_URL}/admin/donations/fee-records?${query}`, { headers }),
        fetch(`${API_URL}/admin/donations/fee-records/reports/summary?${query}`, { headers }),
      ]);
      setProfiles(await readApiResponse<Profile[]>(profilesResponse));
      setFeeTypes(await readApiResponse<FeeType[]>(feesResponse));
      setRecords(await readApiResponse<FeeRecord[]>(recordsResponse));
      setSummary({ ...blankSummary, ...(await readApiResponse<Partial<Summary>>(summaryResponse)) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load alumni fee records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setRecordsPage(1); }, [query]);
  useEffect(() => { setRecordsPage((current) => Math.min(current, totalRecordPages)); }, [totalRecordPages]);
  useEffect(() => { void load(); }, [query]);

  const openNewFee = () => { setEditingFee(null); setFeeForm(emptyFeeForm()); setFeeDialogOpen(true); };
  const openEditFee = (fee: FeeType) => {
    setEditingFee(fee);
    setFeeForm({ feeName: fee.feeName, amount: String(fee.amount), description: fee.description || "", applicableBatchYear: fee.applicableBatchYear || "", applicableProgramId: fee.applicableProgramId || "", dueDate: fee.dueDate?.slice(0, 10) || "", assignedOfficerId: fee.assignedOfficerId || "", isRequired: fee.isRequired, status: fee.status });
    setFeeDialogOpen(true);
  };

  const saveFee = async () => {
    if (!feeForm.feeName.trim() || !feeForm.amount) return toast.error("Fee name and amount are required.");
    setSaving(true);
    try {
      const response = await fetch(editingFee ? `${API_URL}/admin/donations/fee-records/types/${editingFee.id}` : `${API_URL}/admin/donations/fee-records/types`, {
        method: editingFee ? "PUT" : "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(feeForm),
      });
      await readApiResponse(response);
      toast.success(editingFee ? "Required fee updated." : "Required fee added.");
      setFeeDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save required fee.");
    } finally {
      setSaving(false);
    }
  };

  const archiveFee = async (fee: FeeType) => {
    if (!window.confirm(`Archive ${fee.feeName}? Alumni will no longer be required to pay this fee.`)) return;
    try {
      const response = await fetch(`${API_URL}/admin/donations/fee-records/types/${fee.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!response.ok) throw new Error("Archive failed.");
      toast.success("Required fee archived.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Archive failed.");
    }
  };

  const openMarkPaid = (record: FeeRecord, fee: FeeItem) => {
    setMarkTarget({ record, fee });
    setMarkForm({ amountPaid: String(fee.amount), paidDate: new Date().toISOString().slice(0, 10), paymentNote: "" });
  };

  const markPaid = async () => {
    if (!markTarget) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/admin/donations/fee-records/payments/mark-paid`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ alumniId: markTarget.record.alumniId, feeTypeId: markTarget.fee.id, ...markForm }),
      });
      await readApiResponse(response);
      toast.success("Fee marked as paid.");
      setMarkTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark fee as paid.");
    } finally {
      setSaving(false);
    }
  };

  const exportRows: FeeRecordExportRow[] = records.map((record) => ({ alumni: record.alumni.name, alumniId: record.alumni.studentId || "", batch: record.alumni.batch || "", program: record.alumni.program || "", status: record.status, required: record.requiredFeeCount, paid: record.paidFeeCount, unpaid: record.unpaidFeeCount, unpaidFees: record.unpaidFees.map((fee) => `${fee.feeName} - PHP ${fee.amount.toLocaleString()}`).join("; "), totalUnpaid: record.totalUnpaid }));
  const report = { title: "Alumni Fee Records", filename: "alumni-fee-records", rows: exportRows, columns: [{ key: "alumni", label: "Alumni" }, { key: "alumniId", label: "Alumni ID" }, { key: "batch", label: "Batch" }, { key: "program", label: "Program" }, { key: "status", label: "Status" }, { key: "required", label: "Required Fees" }, { key: "paid", label: "Paid Fees" }, { key: "unpaid", label: "Unpaid Fees" }, { key: "unpaidFees", label: "Need to Pay" }, { key: "totalUnpaid", label: "Total Unpaid" }] satisfies ReportColumn<FeeRecordExportRow>[], summary: [{ label: "Complete", value: summary.completeCount }, { label: "Incomplete", value: summary.incompleteCount }, { label: "Collected", value: `PHP ${summary.totalCollected.toLocaleString()}` }, { label: "Unpaid", value: `PHP ${summary.totalUnpaid.toLocaleString()}` }] };

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900 lg:flex-row lg:items-center lg:justify-between">
      <p>{paymentInstruction}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-8 bg-white text-xs" onClick={() => void downloadBrandedExcel(report)}><Download className="mr-1 h-3.5 w-3.5" />Excel</Button><Button size="sm" variant="outline" className="h-8 bg-white text-xs" onClick={() => openPrintableReport(report)}><Printer className="mr-1 h-3.5 w-3.5" />PDF / Print</Button><Button size="sm" className="h-8 text-xs" onClick={openNewFee}><FilePlus2 className="mr-1 h-3.5 w-3.5" />Add Required Fee</Button></div>
    </div>
    <SummaryCards summary={summary} />
    <FeeTypesTable fees={feeTypes} loading={loading} onEdit={openEditFee} onArchive={archiveFee} />
    <Card className="border-slate-200"><CardHeader className="border-b bg-slate-50 px-4 py-3"><CardTitle className="text-base text-navy-dark">Alumni Payment Completion</CardTitle></CardHeader><CardContent className="p-3"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5"><div className="relative xl:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 pl-8 text-[13px]" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search alumni, ID, or fee" /></div><Select value={status} onChange={setStatus} options={["", ...statuses]} label="All statuses" /><Input className="h-9 text-[13px]" value={batchYear} onChange={(e) => setBatchYear(e.target.value)} placeholder="Batch year" /><Input className="h-9 text-[13px]" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="Program" /><select value={assignedOfficerId} onChange={(e) => setAssignedOfficerId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"><option value="">All officers</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div></CardContent></Card>
    <RecordTable loading={loading} records={paginatedRecords} onView={setSelectedRecord} onMarkPaid={openMarkPaid} />
    <PaginationControls page={recordsPage} pageSize={FEE_RECORDS_PAGE_SIZE} totalItems={records.length} totalPages={totalRecordPages} onPageChange={setRecordsPage} />
    <FeeDialog open={feeDialogOpen} onOpenChange={setFeeDialogOpen} form={feeForm} setForm={setFeeForm} profiles={profiles} editing={editingFee} saving={saving} save={saveFee} />
    <MarkPaidDialog target={markTarget} form={markForm} setForm={setMarkForm} saving={saving} onOpenChange={(open) => !open && setMarkTarget(null)} onSave={markPaid} />
    <DetailsDialog record={selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)} />
  </div>;
}

function SummaryCards({ summary }: { summary: Summary }) { const cards = [["Complete", summary.completeCount, "bg-emerald-50 text-emerald-700"], ["Incomplete", summary.incompleteCount, "bg-amber-50 text-amber-700"], ["Collected", `PHP ${summary.totalCollected.toLocaleString()}`, "bg-navy text-white"], ["Unpaid", `PHP ${summary.totalUnpaid.toLocaleString()}`, "bg-white text-navy-dark"], ["Required Fees", summary.requiredFeeAssignments, "bg-white text-navy-dark"], ["Paid Fees", summary.paidFeeAssignments, "bg-white text-navy-dark"]] as const; return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{cards.map(([label, value, className]) => <Card key={label} className={`border-slate-200 shadow-sm ${className}`}><CardContent className="p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">{label}</p><p className="mt-1 text-lg font-bold leading-none">{value}</p></CardContent></Card>)}</div>; }
function FeeTypesTable({ fees, loading, onEdit, onArchive }: { fees: FeeType[]; loading: boolean; onEdit: (fee: FeeType) => void; onArchive: (fee: FeeType) => void }) { return <Card className="border-slate-200"><CardHeader className="border-b bg-slate-50 px-4 py-3"><CardTitle className="text-base text-navy-dark">Required Fee Items</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-auto"><table className="w-full table-fixed text-[13px]"><colgroup><col className="w-[18%]" /><col className="w-[10%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[12%]" /><col className="w-[15%]" /><col className="w-[8%]" /><col className="w-[7%]" /></colgroup><thead className="bg-slate-100"><tr>{["Fee", "Amount", "Batch", "Program", "Due Date", "Officer", "Status", "Actions"].map((heading) => <th key={heading} className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy ${heading === "Status" || heading === "Actions" ? "text-center" : "text-left"}`}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-200/80">{loading ? <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading fees...</td></tr> : fees.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">No required fees have been created.</td></tr> : fees.map((fee) => <tr key={fee.id} className="odd:bg-white even:bg-slate-50/60"><td className="px-3 py-2.5"><p className="truncate font-semibold text-navy-dark" title={fee.feeName}>{fee.feeName}</p><p className="truncate text-xs text-muted-foreground" title={fee.description || "No description"}>{fee.description || "No description"}</p></td><td className="whitespace-nowrap px-3 py-2.5 font-semibold text-navy-dark">PHP {fee.amount.toLocaleString()}</td><td className="truncate px-3 py-2.5 text-muted-foreground">{fee.applicableBatchYear || "All batches"}</td><td className="truncate px-3 py-2.5 text-muted-foreground">{fee.applicableProgramId || "All programs"}</td><td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{fee.dueDate ? new Date(fee.dueDate).toLocaleDateString() : "No due date"}</td><td className="truncate px-3 py-2.5 text-muted-foreground" title={fee.assignedOfficerName}>{fee.assignedOfficerName}</td><td className="px-3 py-2.5 text-center"><Badge className={feeStatusTone[fee.status]}>{fee.status}</Badge></td><td className="px-3 py-2.5"><div className="flex justify-center gap-1"><Action label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(fee)} /><Action label="Archive" icon={<Archive className="h-3.5 w-3.5 text-rose-700" />} onClick={() => onArchive(fee)} disabled={fee.status === "Archived"} /></div></td></tr>)}</tbody></table></div></CardContent></Card>; }
function RecordTable({ loading, records, onView, onMarkPaid }: { loading: boolean; records: FeeRecord[]; onView: (record: FeeRecord) => void; onMarkPaid: (record: FeeRecord, fee: FeeItem) => void }) { return <Card className="border-slate-200"><CardContent className="p-0"><div className="overflow-auto"><table className="w-full table-fixed text-[13px]"><colgroup><col className="w-[18%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[28%]" /><col className="w-[10%]" /><col className="w-[12%]" /></colgroup><thead className="bg-slate-100"><tr>{["Alumni", "Batch", "Program", "Status", "Need to Pay", "Unpaid", "Actions"].map((heading) => <th key={heading} className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy ${heading === "Status" || heading === "Actions" ? "text-center" : "text-left"}`}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-200/80">{loading ? <tr><td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading payment records...</td></tr> : records.length === 0 ? <tr><td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground">No alumni payment records match the current filters.</td></tr> : records.map((record) => <tr key={record.alumniId} className="odd:bg-white even:bg-slate-50/60 hover:bg-navy/5"><td className="px-3 py-2.5"><p className="truncate font-semibold text-navy-dark" title={record.alumni.name}>{record.alumni.name}</p><p className="truncate text-xs text-muted-foreground" title={record.alumni.studentId || "No alumni ID"}>{record.alumni.studentId || "No alumni ID"}</p></td><td className="truncate px-3 py-2.5 text-muted-foreground">{record.alumni.batch || "Not set"}</td><td className="truncate px-3 py-2.5 text-muted-foreground">{record.alumni.program || "Not set"}</td><td className="px-3 py-2.5 text-center"><Badge className={statusTone[record.status]}>{record.status}</Badge></td><td className="px-3 py-2.5">{record.unpaidFees.length === 0 ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />All required fees paid</span> : <div className="space-y-1">{record.unpaidFees.slice(0, 3).map((fee) => <div key={fee.id} className="flex items-center justify-between gap-2"><span className="truncate" title={`${fee.feeName} - PHP ${fee.amount.toLocaleString()}`}>{fee.feeName} - PHP {fee.amount.toLocaleString()}</span><button type="button" className="whitespace-nowrap rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => onMarkPaid(record, fee)}>Mark paid</button></div>)}{record.unpaidFees.length > 3 && <p className="text-xs text-muted-foreground">+{record.unpaidFees.length - 3} more unpaid fees</p>}</div>}</td><td className="whitespace-nowrap px-3 py-2.5 font-semibold text-navy-dark">PHP {record.totalUnpaid.toLocaleString()}</td><td className="px-3 py-2.5"><div className="flex justify-center"><Action label="View" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => onView(record)} /></div></td></tr>)}</tbody></table></div></CardContent></Card>; }
function FeeDialog({ open, onOpenChange, form, setForm, profiles, editing, saving, save }: { open: boolean; onOpenChange: (open: boolean) => void; form: FeeForm; setForm: React.Dispatch<React.SetStateAction<FeeForm>>; profiles: Profile[]; editing: FeeType | null; saving: boolean; save: () => void }) { const set = (key: keyof FeeForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value })); return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Edit Required Fee" : "Add Required Fee"}</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="Fee Name *"><Input value={form.feeName} onChange={(e) => set("feeName", e.target.value)} placeholder="Membership Fee" /></Field><Field label="Amount (PHP) *"><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field><Field label="Applicable Batch Year"><Input value={form.applicableBatchYear} onChange={(e) => set("applicableBatchYear", e.target.value)} placeholder="Leave blank for all batches" /></Field><Field label="Applicable Program"><Input value={form.applicableProgramId} onChange={(e) => set("applicableProgramId", e.target.value)} placeholder="Leave blank for all programs" /></Field><Field label="Due Date"><Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field><Field label="Assigned Collecting Officer"><select value={form.assignedOfficerId} onChange={(e) => set("assignedOfficerId", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Authorized staff</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.email ? ` - ${profile.email}` : ""}</option>)}</select></Field><Field label="Fee Status"><Select value={form.status} onChange={(value) => set("status", value as FeeTypeStatus)} options={feeStatuses} /></Field><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={form.isRequired} onChange={(e) => set("isRequired", e.target.checked)} />Required fee</label><div className="sm:col-span-2"><Label>Description</Label><Textarea className="mt-1.5" value={form.description} onChange={(e) => set("description", e.target.value)} /></div></div><div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{paymentInstruction}</div><div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Save Changes" : "Save Fee"}</Button></div></DialogContent></Dialog>; }
function MarkPaidDialog({ target, form, setForm, saving, onOpenChange, onSave }: { target: { record: FeeRecord; fee: FeeItem } | null; form: MarkPaidForm; setForm: React.Dispatch<React.SetStateAction<MarkPaidForm>>; saving: boolean; onOpenChange: (open: boolean) => void; onSave: () => void }) { const set = (key: keyof MarkPaidForm, value: string) => setForm((current) => ({ ...current, [key]: value })); return <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>{target && <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Mark Fee as Paid</DialogTitle></DialogHeader><div className="space-y-3"><div className="rounded-lg bg-slate-50 p-3"><p className="font-semibold text-navy-dark">{target.record.alumni.name}</p><p className="text-sm text-muted-foreground">{target.fee.feeName} - PHP {target.fee.amount.toLocaleString()}</p></div><Field label="Amount Received"><Input type="number" min="0" step="0.01" value={form.amountPaid} onChange={(e) => set("amountPaid", e.target.value)} /></Field><Field label="Paid Date"><Input type="date" value={form.paidDate} onChange={(e) => set("paidDate", e.target.value)} /></Field><Field label="Remarks / Receipt Reference"><Textarea value={form.paymentNote} onChange={(e) => set("paymentNote", e.target.value)} placeholder="Receipt number, OR number, or collection note" /></Field><div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Confirm only after the alumni has paid personally or in person to the assigned officer or authorized staff.</div></div><div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mark Paid</Button></div></DialogContent>}</Dialog>; }
function DetailsDialog({ record, onOpenChange }: { record: FeeRecord | null; onOpenChange: (open: boolean) => void }) { return <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>{record && <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Alumni Fee Status</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Detail label="Alumni" value={record.alumni.name} /><Detail label="Status" value={record.status} /><Detail label="Need to Pay" value={`PHP ${record.totalUnpaid.toLocaleString()}`} /></div><section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy-dark"><ClipboardList className="h-4 w-4" />Unpaid Fees</h3>{record.unpaidFees.length === 0 ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">All required fees are paid.</p> : <div className="space-y-2">{record.unpaidFees.map((fee) => <div key={fee.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-navy-dark">{fee.feeName}</p><p className="font-semibold">PHP {fee.amount.toLocaleString()}</p></div><p className="mt-1 text-sm text-muted-foreground">Officer: {fee.assignedOfficerName} | Due: {fee.dueDate ? new Date(fee.dueDate).toLocaleDateString() : "No due date"}</p></div>)}</div>}</section><section><h3 className="mb-2 text-sm font-semibold text-navy-dark">Paid Fees</h3>{record.paidFees.length === 0 ? <p className="text-sm text-muted-foreground">No paid fees recorded yet.</p> : <div className="space-y-2">{record.paidFees.map((fee) => <div key={fee.id} className="rounded-lg border border-emerald-100 bg-emerald-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-emerald-800">{fee.feeName}</p><p className="font-semibold text-emerald-800">PHP {fee.amountPaid.toLocaleString()}</p></div><p className="mt-1 text-sm text-emerald-700">Received by {fee.receivedByName || "Authorized staff"}{fee.paidDate ? ` on ${new Date(fee.paidDate).toLocaleDateString()}` : ""}</p>{fee.paymentNote && <p className="mt-1 text-sm text-emerald-700">{fee.paymentNote}</p>}</div>)}</div>}</section><div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{record.paymentInstruction}</div></div></DialogContent>}</Dialog>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold text-navy-dark">{value}</p></div>; }
function Action({ label, icon, onClick, disabled }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) { return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white hover:text-navy disabled:cursor-not-allowed disabled:opacity-40">{icon}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="mb-1.5 block">{label}</Label>{children}</div>; }
function Select({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: readonly string[]; label?: string }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]">{options.map((option) => <option key={option} value={option}>{option || label || "Select"}</option>)}</select>; }
function PaginationControls({ page, pageSize, totalItems, totalPages, onPageChange }: { page: number; pageSize: number; totalItems: number; totalPages: number; onPageChange: (page: number) => void }) { if (totalItems <= pageSize) return null; const start = (page - 1) * pageSize + 1; const end = Math.min(page * pageSize, totalItems); return <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Showing {start}-{end} of {totalItems}</span><div className="flex items-center gap-2"><button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">Previous</button><span className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-navy-dark">Page {page} of {totalPages}</span><button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>; }
