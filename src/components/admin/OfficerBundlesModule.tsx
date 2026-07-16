import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, History, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { API_URL, fetchApi, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";

type ModuleMode = "directory" | "add";
type PositionKey = "president" | "vice_president" | "secretary" | "treasurer" | "auditor" | "pio" | "assistant_secretary" | "assistant_treasurer";

type Profile = { id: string; name: string; email: string | null; course: string | null; batch: string | null; contact_number: string | null; photo: string | null };
type SchoolYear = { id: number; startYear: number; endYear: number; label: string; isCurrent: boolean; officerCount: number };
type Officer = { id: number; alumniId: string; position: PositionKey | "board_member"; positionLabel: string; customPosition: string | null; displayOrder: number; name: string; email: string | null; course: string | null; batch: string | null; contactNumber: string | null; photo: string | null };
type Overview = { currentSchoolYearId: number | null; schoolYears: SchoolYear[] };
type Detail = { schoolYear: SchoolYear; officers: Officer[] };
type Drafts = Record<PositionKey, string>;
type ManualOfficer = { name: string; email: string; course: string; batch: string; contactNumber: string; photo: string };

type Slot = { key: PositionKey; label: string; required?: boolean; description: string };
const SLOTS: Slot[] = [
  { key: "president", label: "President", required: true, description: "Lead the alumni organization." },
  { key: "vice_president", label: "Vice President", required: true, description: "Support and represent the president." },
  { key: "secretary", label: "Secretary", required: true, description: "Maintain records and communications." },
  { key: "treasurer", label: "Treasurer", required: true, description: "Manage financial records and reports." },
  { key: "auditor", label: "Auditor", required: true, description: "Review financial accountability." },
  { key: "pio", label: "Public Information Officer", required: true, description: "Handle public information and outreach." },
  { key: "assistant_secretary", label: "Assistant Secretary", description: "Optional support role for the secretary." },
  { key: "assistant_treasurer", label: "Assistant Treasurer", description: "Optional support role for the treasurer." },
];

const emptyManuals = (): Record<PositionKey, ManualOfficer> => SLOTS.reduce((drafts, slot) => ({ ...drafts, [slot.key]: { name: "", email: "", course: "", batch: "", contactNumber: "", photo: "" } }), {} as Record<PositionKey, ManualOfficer>);
const emptyDrafts = (): Drafts => SLOTS.reduce((drafts, slot) => ({ ...drafts, [slot.key]: "" }), {} as Drafts);
const getError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const defaultSchoolYear = () => { const year = new Date().getFullYear(); return `${year} - ${year + 1}`; };

export default function OfficerBundlesModule({ mode }: { mode: ModuleMode }) {
  return mode === "add" ? <OfficerBundleWizard /> : <OfficerDirectory />;
}

function OfficerDirectory() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<Overview>({ currentSchoolYearId: null, schoolYears: [] });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = async (schoolYearId: number) => {
    const response = await fetchApi(`${API_URL}/officers/${schoolYearId}`, { headers: getAuthHeaders() });
    setDetail(await readApiResponse<Detail>(response));
  };
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchApi(`${API_URL}/officers`, { headers: getAuthHeaders() });
      const nextOverview = await readApiResponse<Overview>(response);
      setOverview(nextOverview);
      if (nextOverview.currentSchoolYearId) await loadDetail(nextOverview.currentSchoolYearId);
    } catch (error) { toast.error(getError(error)); } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Initial directory load only.
  useEffect(() => { void load(); }, []);
  const archivedYears = overview.schoolYears.filter((schoolYear) => !schoolYear.isCurrent);
  const shownYear = history ? selectedHistoryId : overview.currentSchoolYearId;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Load only when the selected directory year changes.
  useEffect(() => { if (shownYear && detail?.schoolYear.id !== shownYear) void loadDetail(shownYear).catch((error) => toast.error(getError(error))); }, [shownYear]);

  const selectHistory = (schoolYearId: number) => { setSelectedHistoryId(schoolYearId); setHistory(true); };
  const title = history ? "Officer History" : "Officer Directory";
  return <AdminLayout title={title} subtitle="Alumni Officers"><div className="mx-auto w-full max-w-7xl space-y-4">
    <div className="ml-auto flex w-fit flex-wrap items-center justify-end gap-2 rounded-xl border border-border/70 bg-card p-2 shadow-sm">
      <Button variant={history ? "outline" : "default"} onClick={() => { setHistory(false); setSelectedHistoryId(null); }}><Users className="mr-2 h-4 w-4" />Current Officers</Button>
      <Button variant={history ? "default" : "outline"} onClick={() => { setHistory(true); setSelectedHistoryId((current) => current || archivedYears[0]?.id || null); }}><History className="mr-2 h-4 w-4" />Officer History</Button>
      <Button onClick={() => navigate("/admin/officers/add")}><Plus className="mr-2 h-4 w-4" />Add Officer</Button>
    </div>
    {history && <ArchiveList years={archivedYears} selectedId={selectedHistoryId} onSelect={selectHistory} />}
    {loading ? <Card><CardContent className="space-y-3 p-4"><Skeleton className="h-10 w-52" /><Skeleton className="h-64 w-full" /></CardContent></Card> : <RosterCard detail={history && !selectedHistoryId ? null : detail} archived={history} />}
  </div></AdminLayout>;
}

function ArchiveList({ years, selectedId, onSelect }: { years: SchoolYear[]; selectedId: number | null; onSelect: (id: number) => void }) {
  return <Card className="border-border/70 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">Archived Officer Years</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{years.length === 0 ? <p className="text-sm text-muted-foreground">No archived officer bundles yet.</p> : years.map((year) => <Button key={year.id} variant={selectedId === year.id ? "default" : "outline"} size="sm" onClick={() => onSelect(year.id)}>{year.label}<Badge variant="outline" className="ml-2 border-current/30 bg-transparent text-current">{year.officerCount}</Badge></Button>)}</CardContent></Card>;
}

function RosterCard({ detail, archived }: { detail: Detail | null; archived: boolean }) {
  if (!detail) return <Card className="border-border/70 shadow-sm"><CardContent className="py-14 text-center text-sm text-muted-foreground">{archived ? "Choose an archived year to view its assigned officers." : "No current officer bundle has been set."}</CardContent></Card>;
  const officers = [...detail.officers].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  return <Card className="border-border/70 shadow-sm"><CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60"><div><CardTitle>{archived ? `${detail.schoolYear.label} Archived Officers` : "Current Officers"}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{detail.schoolYear.label} | {officers.length} assigned officer{officers.length === 1 ? "" : "s"}</p></div><Badge variant="outline" className={archived ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{archived ? "Archived" : "Current"}</Badge></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Position</TableHead><TableHead>Course / Batch</TableHead><TableHead>Contact</TableHead></TableRow></TableHeader><TableBody>{officers.map((officer) => <TableRow key={officer.id}><TableCell><div className="flex items-center gap-3"><Avatar officer={officer} /><div><p className="font-medium">{officer.name}</p><p className="text-xs text-muted-foreground">{officer.email || "No email"}</p></div></div></TableCell><TableCell className="font-medium">{officer.positionLabel}</TableCell><TableCell>{officer.course || "N/A"}<span className="block text-xs text-muted-foreground">{officer.batch || "No batch"}</span></TableCell><TableCell>{officer.contactNumber || "N/A"}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>;
}

function Avatar({ officer }: { officer: Officer }) { const photo = resolveAssetUrl(officer.photo); return <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">{photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : officer.name.split(" ").map((item) => item[0]).slice(0, 2).join("")}</div>; }

function OfficerBundleWizard() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts()); const [manuals, setManuals] = useState<Record<PositionKey, ManualOfficer>>(emptyManuals());
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear());
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const currentSlot = SLOTS[step];
  const selectedProfile = profileById.get(drafts[currentSlot.key]); const manual = manuals[currentSlot.key];

  useEffect(() => { const load = async () => { try { const [profilesResponse, overviewResponse] = await Promise.all([fetchApi(`${API_URL}/profiles`, { headers: getAuthHeaders() }), fetchApi(`${API_URL}/officers`, { headers: getAuthHeaders() })]); const nextProfiles = await readApiResponse<Profile[]>(profilesResponse); const overview = await readApiResponse<Overview>(overviewResponse); setProfiles(nextProfiles); const current = overview.schoolYears.find((year) => year.isCurrent); if (current) setSchoolYear(`${current.endYear} - ${current.endYear + 1}`); } catch (error) { toast.error(getError(error)); } finally { setLoading(false); } }; void load(); }, []);

  const choose = (profileId: string) => {
    const duplicate = SLOTS.some((slot) => slot.key !== currentSlot.key && drafts[slot.key] === profileId);
    if (profileId && duplicate) { toast.error("An alumni profile can only be assigned once in a bundle."); return; }
    setDrafts((current) => ({ ...current, [currentSlot.key]: profileId }));
  };
  const updateManual = (field: keyof ManualOfficer, value: string) => setManuals((current) => ({ ...current, [currentSlot.key]: { ...current[currentSlot.key], [field]: value } }));
  const handleManualPhotoUpload = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { toast.error("Choose an image file smaller than 5 MB."); event.target.value = ""; return; } const reader = new FileReader(); reader.addEventListener("load", () => updateManual("photo", typeof reader.result === "string" ? reader.result : "")); reader.readAsDataURL(file); };
  const next = () => { if (currentSlot.required && !drafts[currentSlot.key] && !manual.name.trim()) { toast.error(`Select an alumni profile or enter the ${currentSlot.label} details.`); return; } setStep((current) => Math.min(current + 1, SLOTS.length - 1)); };
  const save = async () => {
    const missing = SLOTS.filter((slot) => slot.required && !drafts[slot.key] && !manuals[slot.key].name.trim());
    if (missing.length > 0) { toast.error(`Complete ${missing[0].label} before saving the bundle.`); setStep(SLOTS.findIndex((slot) => slot.key === missing[0].key)); return; }
    const officers = SLOTS.filter((slot) => drafts[slot.key] || manuals[slot.key].name.trim()).map((slot) => { const profile = profileById.get(drafts[slot.key]); const manualOfficer = manuals[slot.key]; return { alumniId: profile?.id || "", position: slot.key, name: profile?.name || manualOfficer.name.trim(), email: profile?.email || manualOfficer.email.trim(), course: profile?.course || manualOfficer.course.trim(), batch: profile?.batch || manualOfficer.batch.trim(), contactNumber: profile?.contact_number || manualOfficer.contactNumber.trim(), photoBase64: profile?.photo || manualOfficer.photo || null }; });
    setSaving(true);
    try { const response = await fetchApi(`${API_URL}/officers/bundles`, { method: "POST", headers: getAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ schoolYear, makeCurrent: true, officers }) }); await readApiResponse(response); toast.success("Officer bundle saved. It is now the current officer directory."); navigate("/admin/officers"); } catch (error) { toast.error(getError(error)); } finally { setSaving(false); }
  };

  return <AdminLayout title="Add Officer" subtitle="Officer Bundle"><div className="mx-auto w-full max-w-4xl space-y-4"><div className="flex items-center justify-between"><Button variant="outline" onClick={() => navigate("/admin/officers")}><ArrowLeft className="mr-2 h-4 w-4" />Back to directory</Button><Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">Step {step + 1} of {SLOTS.length}</Badge></div>{loading ? <Card><CardContent className="space-y-3 p-4"><Skeleton className="h-9 w-44" /><Skeleton className="h-80 w-full" /></CardContent></Card> : <><Card className="border-border/70 shadow-sm"><CardContent className="p-4"><Label htmlFor="school-year" className="mb-2 block">Officer Year</Label><Input id="school-year" value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} placeholder="2026 - 2027" /><p className="mt-2 text-xs text-muted-foreground">The selected bundle becomes the current officer directory. The previous bundle is automatically kept in Officer History.</p></CardContent></Card><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{SLOTS.map((slot, index) => <button key={slot.key} type="button" onClick={() => setStep(index)} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm ${index === step ? "border-primary bg-primary/5 text-primary" : drafts[slot.key] ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-card text-muted-foreground"}`}><span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px]">{drafts[slot.key] ? <Check className="h-3 w-3" /> : index + 1}</span><span className="truncate">{slot.label}</span></button>)}</div><Card className="border-border/70 shadow-sm"><CardHeader className="border-b border-border/60"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div><div><CardTitle>{currentSlot.label}{currentSlot.required && <span className="ml-1 text-rose-600">*</span>}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{currentSlot.description}</p></div></div></CardHeader><CardContent className="space-y-4 p-4"><div><Label className="mb-2 block">Select alumni officer</Label><select value={drafts[currentSlot.key]} onChange={(event) => choose(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{currentSlot.required ? "Select a registered alumni or enter details below" : "Skip this optional position"}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id} disabled={SLOTS.some((slot) => slot.key !== currentSlot.key && drafts[slot.key] === profile.id)}>{profile.name}{profile.batch ? ` - ${profile.batch}` : ""}{profile.course ? ` - ${profile.course}` : ""}</option>)}</select></div>{!selectedProfile && <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-3"><p className="mb-3 text-sm font-medium">Manual officer information</p><div className="grid gap-3 sm:grid-cols-2"><div><Label className="mb-1.5 block">Full Name{currentSlot.required && <span className="ml-1 text-rose-600">*</span>}</Label><Input value={manual.name} onChange={(event) => updateManual("name", event.target.value)} placeholder="Officer full name" /></div><div><Label className="mb-1.5 block">Email Address</Label><Input type="email" value={manual.email} onChange={(event) => updateManual("email", event.target.value)} placeholder="Email address" /></div><div><Label className="mb-1.5 block">Course / Department</Label><Input value={manual.course} onChange={(event) => updateManual("course", event.target.value)} placeholder="Course or department" /></div><div><Label className="mb-1.5 block">Batch Year</Label><Input value={manual.batch} onChange={(event) => updateManual("batch", event.target.value)} placeholder="e.g. 2022" /></div><div className="sm:col-span-2"><Label className="mb-1.5 block">Contact Number</Label><Input value={manual.contactNumber} onChange={(event) => updateManual("contactNumber", event.target.value)} placeholder="Contact number" /></div><div className="sm:col-span-2"><Label className="mb-1.5 block">Profile Photo</Label><div className="flex flex-wrap items-center gap-3"><div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">{manual.photo ? <img src={manual.photo} alt="Officer photo preview" className="h-full w-full object-cover" /> : "Photo"}</div><label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">Upload Photo<input type="file" accept="image/*" className="hidden" onChange={handleManualPhotoUpload} /></label>{manual.photo && <Button type="button" variant="ghost" size="sm" onClick={() => updateManual("photo", "")}>Remove</Button>}</div><p className="mt-1.5 text-xs text-muted-foreground">Image files up to 5 MB.</p></div></div></div>}{selectedProfile && <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 p-3"><Avatar officer={{ id: 0, alumniId: selectedProfile.id, position: currentSlot.key, positionLabel: currentSlot.label, customPosition: null, displayOrder: step, name: selectedProfile.name, email: selectedProfile.email, course: selectedProfile.course, batch: selectedProfile.batch, contactNumber: selectedProfile.contact_number, photo: selectedProfile.photo }} /><div><p className="font-medium">{selectedProfile.name}</p><p className="text-sm text-muted-foreground">{selectedProfile.course || "No course"}{selectedProfile.batch ? ` - Batch ${selectedProfile.batch}` : ""}</p></div></div>}<div className="flex items-center justify-between gap-2 border-t border-border/60 pt-4"><Button variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}>Previous</Button>{step === SLOTS.length - 1 ? <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save Officer Bundle</Button> : <Button onClick={next}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>}</div></CardContent></Card></>}</div></AdminLayout>;
}
