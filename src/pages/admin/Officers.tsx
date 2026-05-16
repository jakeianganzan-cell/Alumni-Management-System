import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPageIntro } from "@/components/admin/AdminPageIntro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { API_URL, fetchApi, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type OfficerPosition =
  | "president"
  | "vice_president"
  | "secretary"
  | "assistant_secretary"
  | "treasurer"
  | "assistant_treasurer"
  | "auditor"
  | "pio";

interface ProfileRecord {
  id: string;
  name: string;
  email: string;
  student_id: string | null;
  course: string | null;
  batch: string | null;
  contact_number: string | null;
  photo: string | null;
  role?: string | null;
}

interface SchoolYearSummary {
  id: number;
  startYear: number;
  endYear: number;
  label: string;
  isCurrent: boolean;
  officerCount: number;
  createdAt: string;
  updatedAt: string;
}

interface OfficerDetail {
  id: number;
  schoolYearId: number;
  alumniId: string;
  position: string;
  positionLabel: string;
  customPosition?: string | null;
  displayOrder: number;
  name: string;
  email: string | null;
  course: string | null;
  batch: string | null;
  contactNumber: string | null;
  photo: string | null;
}

interface SchoolYearDetailResponse {
  schoolYear: SchoolYearSummary;
  officers: OfficerDetail[];
}

interface OfficersOverviewResponse {
  currentSchoolYearId: number | null;
  schoolYears: SchoolYearSummary[];
}

type OfficerSlot = {
  key: OfficerPosition;
  label: string;
  required?: boolean;
};

type OfficerDraft = {
  alumniId: string;
  name: string;
  email: string | null;
  course: string | null;
  batch: string | null;
  contactNumber: string;
  currentPhoto: string | null;
  photoBase64: string | null;
};

type BoardMemberDraft = OfficerDraft & {
  localId: string;
  customPosition: string;
};

interface BundleFormState {
  schoolYear: string;
  makeCurrent: boolean;
  positions: Record<OfficerPosition, OfficerDraft>;
  boardMembers: BoardMemberDraft[];
}

const PRIMARY_SLOTS: OfficerSlot[] = [
  { key: "president", label: "President", required: true },
  { key: "vice_president", label: "Vice President", required: true },
  { key: "secretary", label: "Secretary", required: true },
  { key: "treasurer", label: "Treasurer", required: true },
  { key: "auditor", label: "Auditor", required: true },
  { key: "pio", label: "PRO", required: true },
];

const SUPPORT_SLOTS: OfficerSlot[] = [
  { key: "assistant_secretary", label: "Assistant Secretary" },
  { key: "assistant_treasurer", label: "Assistant Treasurer" },
];

const OFFICER_SLOTS: OfficerSlot[] = [...PRIMARY_SLOTS, ...SUPPORT_SLOTS];

const POSITION_FILTERS = ["All Positions", "Board Members", ...OFFICER_SLOTS.map((slot) => slot.label)];

const createEmptyOfficerDraft = (): OfficerDraft => ({
  alumniId: "",
  name: "",
  email: null,
  course: null,
  batch: null,
  contactNumber: "",
  currentPhoto: null,
  photoBase64: null,
});

const createEmptyBoardMemberDraft = (): BoardMemberDraft => ({
  ...createEmptyOfficerDraft(),
  localId: crypto.randomUUID(),
  customPosition: "",
});

const createBundleForm = (): BundleFormState => ({
  schoolYear: "",
  makeCurrent: true,
  positions: {
    president: createEmptyOfficerDraft(),
    vice_president: createEmptyOfficerDraft(),
    secretary: createEmptyOfficerDraft(),
    assistant_secretary: createEmptyOfficerDraft(),
    treasurer: createEmptyOfficerDraft(),
    assistant_treasurer: createEmptyOfficerDraft(),
    auditor: createEmptyOfficerDraft(),
    pio: createEmptyOfficerDraft(),
  },
  boardMembers: [],
});

const createDraftFromProfile = (profile: ProfileRecord | undefined | null): OfficerDraft => ({
  alumniId: profile?.id || "",
  name: profile?.name || "",
  email: profile?.email || null,
  course: profile?.course || null,
  batch: profile?.batch || null,
  contactNumber: profile?.contact_number || "",
  currentPhoto: profile?.photo || null,
  photoBase64: null,
});

const createDraftFromOfficer = (officer: OfficerDetail): OfficerDraft => ({
  alumniId: officer.alumniId,
  name: officer.name,
  email: officer.email,
  course: officer.course,
  batch: officer.batch,
  contactNumber: officer.contactNumber || "",
  currentPhoto: officer.photo,
  photoBase64: null,
});

const createBoardMemberFromOfficer = (officer: OfficerDetail): BoardMemberDraft => ({
  ...createDraftFromOfficer(officer),
  localId: crypto.randomUUID(),
  customPosition: officer.customPosition || officer.positionLabel || "Board Member",
});

const schoolYearPattern = /^(19|20)\d{2}\s*-\s*(19|20)\d{2}$/;

export default function AdminOfficers() {
  const [overview, setOverview] = useState<OfficersOverviewResponse>({ currentSchoolYearId: null, schoolYears: [] });
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SchoolYearDetailResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchYear, setSearchYear] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<"all" | "current" | "history">("all");
  const [rosterSearch, setRosterSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("All Positions");
  const [bundleOpen, setBundleOpen] = useState(false);
  const [bundleMode, setBundleMode] = useState<"create" | "edit">("create");
  const [bundleForm, setBundleForm] = useState<BundleFormState>(createBundleForm());
  const [bundleError, setBundleError] = useState("");
  const [savingBundle, setSavingBundle] = useState(false);

  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const loadOverview = async (preferredSchoolYearId?: number | null) => {
    setLoadingOverview(true);
    try {
      const [officersResponse, profilesResponse] = await Promise.all([
        fetchApi(`${API_URL}/officers`, { headers: getAuthHeaders() }),
        fetchApi(`${API_URL}/profiles`, { headers: getAuthHeaders() }),
      ]);

      const officersData = await readApiResponse<OfficersOverviewResponse>(officersResponse);
      const profilesData = await readApiResponse<ProfileRecord[]>(profilesResponse);
      setOverview(officersData);
      setProfiles(profilesData);

      const nextSelectedId =
        preferredSchoolYearId ||
        (selectedSchoolYearId && officersData.schoolYears.some((item) => item.id === selectedSchoolYearId)
          ? selectedSchoolYearId
          : officersData.currentSchoolYearId || officersData.schoolYears[0]?.id || null);

      setSelectedSchoolYearId(nextSelectedId);
    } catch (error) {
      console.error(error);
      setOverview({ currentSchoolYearId: null, schoolYears: [] });
      setProfiles([]);
      setSelectedSchoolYearId(null);
      toast.error("Failed to load officer records");
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadSchoolYearDetail = async (schoolYearId: number) => {
    setLoadingDetail(true);
    try {
      const response = await fetchApi(`${API_URL}/officers/${schoolYearId}`, {
        headers: getAuthHeaders(),
      });
      const data = await readApiResponse<SchoolYearDetailResponse>(response);
      setSelectedDetail(data);
    } catch (error) {
      console.error(error);
      setSelectedDetail(null);
      toast.error("Failed to load officer bundle details");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (!selectedSchoolYearId) {
      setSelectedDetail(null);
      return;
    }

    void loadSchoolYearDetail(selectedSchoolYearId);
  }, [selectedSchoolYearId]);

  const selectedSummary =
    selectedDetail?.schoolYear || overview.schoolYears.find((item) => item.id === selectedSchoolYearId) || null;

  const filteredSchoolYears = useMemo(() => {
    return overview.schoolYears.filter((schoolYear) => {
      const matchesSearch = schoolYear.label.toLowerCase().includes(searchYear.toLowerCase());
      const matchesFilter =
        archiveFilter === "all" ||
        (archiveFilter === "current" && schoolYear.isCurrent) ||
        (archiveFilter === "history" && !schoolYear.isCurrent);

      return matchesSearch && matchesFilter;
    });
  }, [archiveFilter, overview.schoolYears, searchYear]);

  const filteredOfficers = useMemo(() => {
    if (!selectedDetail) return [];

    return selectedDetail.officers.filter((officer) => {
      const matchesSearch =
        !rosterSearch ||
        officer.name.toLowerCase().includes(rosterSearch.toLowerCase()) ||
        officer.positionLabel.toLowerCase().includes(rosterSearch.toLowerCase());

      const matchesPosition =
        positionFilter === "All Positions" ||
        (positionFilter === "Board Members" && officer.position === "board_member") ||
        officer.positionLabel === positionFilter;

      return matchesSearch && matchesPosition;
    });
  }, [positionFilter, rosterSearch, selectedDetail]);

  const missingRequiredLabels = useMemo(() => {
    return PRIMARY_SLOTS.filter((slot) => {
      const draft = bundleForm.positions[slot.key];
      return !draft.alumniId;
    }).map((slot) => slot.label);
  }, [bundleForm.positions]);

  const duplicateAssignments = useMemo(() => {
    const labels = new Map<string, string[]>();

    OFFICER_SLOTS.forEach((slot) => {
      const draft = bundleForm.positions[slot.key];
      if (!draft.alumniId) return;
      labels.set(draft.alumniId, [...(labels.get(draft.alumniId) || []), slot.label]);
    });

    bundleForm.boardMembers.forEach((member, index) => {
      if (!member.alumniId) return;
      labels.set(member.alumniId, [...(labels.get(member.alumniId) || []), member.customPosition.trim() || `Board Member ${index + 1}`]);
    });

    return Array.from(labels.values()).filter((value) => value.length > 1);
  }, [bundleForm.boardMembers, bundleForm.positions]);

  const incompleteBoardMember = useMemo(
    () =>
      bundleForm.boardMembers.find(
        (member) => Boolean(member.alumniId || member.name.trim() || member.customPosition.trim()) && !member.alumniId,
      ) || null,
    [bundleForm.boardMembers],
  );

  const schoolYearHasValidFormat = schoolYearPattern.test(bundleForm.schoolYear.trim());

  const readyToSaveBundle =
    schoolYearHasValidFormat &&
    missingRequiredLabels.length === 0 &&
    duplicateAssignments.length === 0 &&
    !incompleteBoardMember;

  const openCreateBundle = () => {
    const nextForm = createBundleForm();
    if (selectedSummary) {
      nextForm.schoolYear = `${selectedSummary.endYear} - ${selectedSummary.endYear + 1}`;
    }
    setBundleMode("create");
    setBundleForm(nextForm);
    setBundleError("");
    setBundleOpen(true);
  };

  const openEditBundle = () => {
    if (!selectedDetail) return;

    const nextForm = createBundleForm();
    nextForm.schoolYear = selectedDetail.schoolYear.label;
    nextForm.makeCurrent = selectedDetail.schoolYear.isCurrent;

    OFFICER_SLOTS.forEach((slot) => {
      const officer = selectedDetail.officers.find((item) => item.position === slot.key);
      if (officer) {
        nextForm.positions[slot.key] = createDraftFromOfficer(officer);
      }
    });

    nextForm.boardMembers = selectedDetail.officers
      .filter((item) => item.position === "board_member")
      .map((officer) => createBoardMemberFromOfficer(officer));

    setBundleMode("edit");
    setBundleForm(nextForm);
    setBundleError("");
    setBundleOpen(true);
  };

  const updateOfficerDraft = (position: OfficerPosition, changes: Partial<OfficerDraft>) => {
    setBundleForm((current) => ({
      ...current,
      positions: {
        ...current.positions,
        [position]: { ...current.positions[position], ...changes },
      },
    }));
    setBundleError("");
  };

  const updateBoardMemberDraft = (localId: string, changes: Partial<BoardMemberDraft>) => {
    setBundleForm((current) => ({
      ...current,
      boardMembers: current.boardMembers.map((member) => (member.localId === localId ? { ...member, ...changes } : member)),
    }));
    setBundleError("");
  };

  const handleOfficerSelection = (position: OfficerPosition, profileId: string) => {
    const alreadyAssigned =
      profileId &&
      (OFFICER_SLOTS.some((slot) => slot.key !== position && bundleForm.positions[slot.key].alumniId === profileId) ||
        bundleForm.boardMembers.some((member) => member.alumniId === profileId));

    if (alreadyAssigned) {
      const message = "That alumni profile is already assigned in this officer bundle.";
      setBundleError(message);
      toast.error(message);
      return;
    }

    const profile = profilesById.get(profileId);
    updateOfficerDraft(position, {
      ...createDraftFromProfile(profile),
      alumniId: profileId,
      name: profile?.name || bundleForm.positions[position].name,
    });
  };

  const handleBoardMemberSelection = (localId: string, profileId: string) => {
    const alreadyAssigned =
      profileId &&
      (OFFICER_SLOTS.some((slot) => bundleForm.positions[slot.key].alumniId === profileId) ||
        bundleForm.boardMembers.some((member) => member.localId !== localId && member.alumniId === profileId));

    if (alreadyAssigned) {
      const message = "That alumni profile is already assigned in this officer bundle.";
      setBundleError(message);
      toast.error(message);
      return;
    }

    const profile = profilesById.get(profileId);
    const nextDraft = {
      ...createEmptyBoardMemberDraft(),
      ...createDraftFromProfile(profile),
      alumniId: profileId,
      name: profile?.name || draftNameForBoardMember(bundleForm.boardMembers, localId),
      localId,
    };
    updateBoardMemberDraft(localId, nextDraft);
  };

  const handleOfficerPhotoChange = (position: OfficerPosition, file: File | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      updateOfficerDraft(position, { photoBase64: String(reader.result || "") });
    };
    reader.readAsDataURL(file);
  };

  const handleBoardPhotoChange = (localId: string, file: File | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      updateBoardMemberDraft(localId, { photoBase64: String(reader.result || "") });
    };
    reader.readAsDataURL(file);
  };

  const addBoardMember = () => {
    setBundleForm((current) => ({
      ...current,
      boardMembers: [...current.boardMembers, createEmptyBoardMemberDraft()],
    }));
  };

  const removeBoardMember = (localId: string) => {
    setBundleForm((current) => ({
      ...current,
      boardMembers: current.boardMembers.filter((member) => member.localId !== localId),
    }));
  };

  const validateBundle = () => {
    if (!bundleForm.schoolYear.trim()) {
      return "Enter the school year before saving.";
    }

    if (!schoolYearHasValidFormat) {
      return "School year must use the format YYYY - YYYY.";
    }

    if (missingRequiredLabels.length > 0) {
      return `Complete the required officer set before confirming: ${missingRequiredLabels.join(", ")}.`;
    }

    if (duplicateAssignments.length > 0) {
      return `Each alumni profile can only appear once per bundle. Duplicate assignments found in: ${duplicateAssignments
        .map((labels) => labels.join(" / "))
        .join(", ")}.`;
    }

    if (incompleteBoardMember) {
      return "Select an alumni profile for every board member entry before confirming.";
    }

    return "";
  };

  const saveBundle = async () => {
    const validationError = validateBundle();
    if (validationError) {
      setBundleError(validationError);
      toast.error(validationError);
      return;
    }

    setSavingBundle(true);
    setBundleError("");

    const assignments = [
      ...OFFICER_SLOTS.filter((slot) => bundleForm.positions[slot.key].alumniId).map((slot) => {
        const draft = bundleForm.positions[slot.key];
        return {
          alumniId: draft.alumniId,
          position: slot.key,
          name: draft.name.trim(),
          contactNumber: draft.contactNumber.trim(),
          photoBase64: draft.photoBase64,
        };
      }),
      ...bundleForm.boardMembers
        .filter((member) => member.alumniId)
        .map((member) => ({
          alumniId: member.alumniId,
          position: "board_member",
          customPosition: member.customPosition.trim() || "Board Member",
          name: member.name.trim(),
          contactNumber: member.contactNumber.trim(),
          photoBase64: member.photoBase64,
        })),
    ];

    try {
      const response = await fetchApi(`${API_URL}/officers/bundles`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolYear: bundleForm.schoolYear,
          makeCurrent: bundleForm.makeCurrent,
          officers: assignments,
        }),
      });

      const payload = await readApiResponse<{ success: boolean; schoolYearId: number }>(response);
      setBundleOpen(false);
      setBundleForm(createBundleForm());
      toast.success(bundleMode === "edit" ? "Officer bundle updated and synced to the alumni dashboard" : "Officer bundle saved and synced to the alumni dashboard");
      await loadOverview(payload.schoolYearId);
      setSelectedSchoolYearId(payload.schoolYearId);
      await loadSchoolYearDetail(payload.schoolYearId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save officer bundle";
      setBundleError(message);
      toast.error(message);
    } finally {
      setSavingBundle(false);
    }
  };

  return (
    <AdminLayout title="Officer Management" subtitle="Create, review, edit, and publish officer bundles with a cleaner workflow">
      <div className="space-y-6">
        <AdminPageIntro
          eyebrow="Officer Archive"
          title="Officer bundles by school year"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={openEditBundle} disabled={!selectedDetail}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit selected bundle
              </Button>
              <Button onClick={openCreateBundle}>
                <Plus className="mr-2 h-4 w-4" />
                Add school year bundle
              </Button>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg text-navy-dark">School Year Archive</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Choose a school year to inspect or edit the full officer bundle.</p>
                </div>
                <Badge variant="outline">{overview.schoolYears.length}</Badge>
              </div>

              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchYear} onChange={(event) => setSearchYear(event.target.value)} placeholder="Search school year..." className="border-slate-300 bg-white pl-9" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all", label: "All" },
                    { key: "current", label: "Current" },
                    { key: "history", label: "History" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setArchiveFilter(item.key as typeof archiveFilter)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                        archiveFilter === item.key ? "bg-navy text-white" : "border border-slate-200 bg-white text-muted-foreground hover:border-navy/30 hover:text-navy-dark",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {loadingOverview ? (
                Array.from({ length: 4 }).map((_, index) => <SchoolYearCardSkeleton key={index} />)
              ) : filteredSchoolYears.length === 0 ? (
                <EmptyState title="No school year found" description="Create the first bundle or adjust the archive filter." />
              ) : (
                filteredSchoolYears.map((schoolYear) => (
                  <button
                    key={schoolYear.id}
                    type="button"
                    onClick={() => setSelectedSchoolYearId(schoolYear.id)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition-colors",
                      selectedSchoolYearId === schoolYear.id
                        ? "border-navy bg-slate-50"
                        : "border-slate-200 bg-white hover:border-navy/30 hover:bg-slate-50/60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-navy-dark">{schoolYear.label}</p>
                          {schoolYear.isCurrent && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Current</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {schoolYear.officerCount} officer{schoolYear.officerCount === 1 ? "" : "s"} saved
                        </p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{schoolYear.startYear}</div>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-slate-50">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle className="text-lg text-navy-dark">{selectedSummary?.label || "Officer Bundle"}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Search officers, filter by position, and review the published snapshot for this school year.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder="Search roster..." className="border-slate-300 bg-white pl-9" />
                  </div>
                  <select
                    value={positionFilter}
                    onChange={(event) => setPositionFilter(event.target.value)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-foreground outline-none transition focus:border-navy"
                  >
                    {POSITION_FILTERS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 p-5">
              {loadingDetail ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-24 rounded-2xl" />
                    ))}
                  </div>
                  <Skeleton className="h-[360px] rounded-2xl" />
                </>
              ) : !selectedSummary || !selectedDetail ? (
                <EmptyState title="No officer bundle selected" description="Choose a school year from the archive to open its roster." />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoTile label="Total officers" value={String(selectedDetail.officers.length)} />
                    <InfoTile label="Board members" value={String(selectedDetail.officers.filter((item) => item.position === "board_member").length)} />
                    <InfoTile label="Updated" value={new Date(selectedSummary.updatedAt).toLocaleDateString()} />
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="w-[80px] text-[11px] uppercase tracking-[0.16em] text-navy">Photo</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-[0.16em] text-navy">Full Name</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-[0.16em] text-navy">Position</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-[0.16em] text-navy">Contact Number</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOfficers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                              No officers matched the current search or filter.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredOfficers.map((officer) => (
                            <TableRow key={officer.id} className="hover:bg-slate-50/70">
                              <TableCell data-label="Photo">
                                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                  {officer.photo ? (
                                    <img src={resolveAssetUrl(officer.photo) || officer.photo} alt={officer.name} className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="text-sm font-semibold text-muted-foreground">{getInitials(officer.name)}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell data-label="Full Name">
                                <p className="font-semibold text-navy-dark">{officer.name}</p>
                              </TableCell>
                              <TableCell data-label="Position">
                                <Badge variant="outline" className="border-navy/20 bg-navy/5 text-navy-dark">
                                  {officer.positionLabel}
                                </Badge>
                              </TableCell>
                              <TableCell data-label="Contact Number">{officer.contactNumber || "No contact number"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={bundleOpen} onOpenChange={(open) => !savingBundle && setBundleOpen(open)}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto border-slate-200 bg-white shadow-2xl">
          <DialogHeader className="space-y-2">
            <DialogTitle className="pr-8 text-xl text-navy-dark sm:text-2xl">{bundleMode === "edit" ? "Edit Officer Bundle" : "Create Officer Bundle"}</DialogTitle>
            <DialogDescription>
              Use solid officer cards, complete the required set, and save the bundle to sync the current organization chart.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Bundle status</p>
                  <h3 className="mt-1 text-lg font-semibold text-navy-dark">
                    {missingRequiredLabels.length === 0 ? "Required officer set is complete" : `${missingRequiredLabels.length} required role${missingRequiredLabels.length === 1 ? "" : "s"} still missing`}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The system validates the required set before confirmation: President, Vice President, Secretary, Treasurer, Auditor, and PRO.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge className={readyToSaveBundle ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
                    {readyToSaveBundle ? "Ready to confirm" : "Needs completion"}
                  </Badge>
                  {selectedSummary?.isCurrent && bundleMode === "edit" && (
                    <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                      Editing current roster
                    </Badge>
                  )}
                </div>
              </div>

              {(missingRequiredLabels.length > 0 || duplicateAssignments.length > 0 || !schoolYearHasValidFormat || Boolean(incompleteBoardMember)) && (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <StatusPanel
                    title="Missing required roles"
                    toneClassName="border-amber-200 bg-amber-50 text-amber-900"
                    lines={missingRequiredLabels.length > 0 ? missingRequiredLabels : ["None"]}
                  />
                  <StatusPanel
                    title="Duplicate alumni assignments"
                    toneClassName="border-rose-200 bg-rose-50 text-rose-900"
                    lines={duplicateAssignments.length > 0 ? duplicateAssignments.map((labels) => labels.join(" / ")) : ["None"]}
                  />
                  <StatusPanel
                    title="School year format"
                    toneClassName="border-sky-200 bg-sky-50 text-sky-900"
                    lines={schoolYearHasValidFormat ? ["Ready"] : ["Use the format YYYY - YYYY"]}
                  />
                  <StatusPanel
                    title="Board member entries"
                    toneClassName="border-violet-200 bg-violet-50 text-violet-900"
                    lines={incompleteBoardMember ? ["Every board member row must link to one alumni profile."] : ["Ready"]}
                  />
                </div>
              )}
            </section>

            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label className="mb-2 block text-sm font-semibold text-navy-dark">School Year</label>
                <Input
                  value={bundleForm.schoolYear}
                  onChange={(event) => {
                    setBundleForm((current) => ({ ...current, schoolYear: event.target.value }));
                    setBundleError("");
                  }}
                  placeholder="2025 - 2026"
                  className="border-slate-300 bg-white"
                />
                <p className={`mt-2 text-xs ${bundleForm.schoolYear.trim() && !schoolYearHasValidFormat ? "text-rose-600" : "text-muted-foreground"}`}>
                  Use the format `YYYY - YYYY`.
                </p>
              </div>

              <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={bundleForm.makeCurrent}
                  onChange={(event) => setBundleForm((current) => ({ ...current, makeCurrent: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-navy focus:ring-navy"
                />
                Mark as current roster
              </label>
            </section>

            <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
              <div>
                <h3 className="text-base font-semibold text-navy-dark">Primary officers</h3>
                <p className="text-sm text-muted-foreground">Select the core officers and adjust the saved snapshot details if needed.</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {PRIMARY_SLOTS.map((slot) => (
                  <OfficerEditorCard
                    key={slot.key}
                    slot={slot}
                    draft={bundleForm.positions[slot.key]}
                    profiles={profiles}
                    onSelectProfile={(profileId) => handleOfficerSelection(slot.key, profileId)}
                    onChange={(changes) => updateOfficerDraft(slot.key, changes)}
                    onUploadPhoto={(file) => handleOfficerPhotoChange(slot.key, file)}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
              <div>
                <h3 className="text-base font-semibold text-navy-dark">Support officers</h3>
                <p className="text-sm text-muted-foreground">Add assistant roles when they are part of the organization set for this school year.</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {SUPPORT_SLOTS.map((slot) => (
                  <OfficerEditorCard
                    key={slot.key}
                    slot={slot}
                    draft={bundleForm.positions[slot.key]}
                    profiles={profiles}
                    onSelectProfile={(profileId) => handleOfficerSelection(slot.key, profileId)}
                    onChange={(changes) => updateOfficerDraft(slot.key, changes)}
                    onUploadPhoto={(file) => handleOfficerPhotoChange(slot.key, file)}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-navy-dark">Board members</h3>
                  <p className="text-sm text-muted-foreground">Add as many board members as needed and set their display titles.</p>
                </div>
                <Button type="button" variant="outline" onClick={addBoardMember}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add board member
                </Button>
              </div>

              {bundleForm.boardMembers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-muted-foreground">
                  No board members added yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {bundleForm.boardMembers.map((member, index) => (
                    <BoardMemberEditorCard
                      key={member.localId}
                      draft={member}
                      index={index}
                      profiles={profiles}
                      onSelectProfile={(profileId) => handleBoardMemberSelection(member.localId, profileId)}
                      onChange={(changes) => updateBoardMemberDraft(member.localId, changes)}
                      onUploadPhoto={(file) => handleBoardPhotoChange(member.localId, file)}
                      onRemove={() => removeBoardMember(member.localId)}
                    />
                  ))}
                </div>
              )}
            </section>

            {bundleError && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{bundleError}</div>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setBundleOpen(false)} disabled={savingBundle}>
                Cancel
              </Button>
              <Button type="button" onClick={saveBundle} disabled={savingBundle}>
                {savingBundle ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving bundle...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Confirm and save
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function OfficerEditorCard({
  slot,
  draft,
  profiles,
  onSelectProfile,
  onChange,
  onUploadPhoto,
}: {
  slot: OfficerSlot;
  draft: OfficerDraft;
  profiles: ProfileRecord[];
  onSelectProfile: (profileId: string) => void;
  onChange: (changes: Partial<OfficerDraft>) => void;
  onUploadPhoto: (file: File | undefined) => void;
}) {
  const previewPhoto = draft.photoBase64 || draft.currentPhoto;

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-navy-dark">{slot.label}</h4>
          {slot.required && <Badge className="bg-navy/10 text-navy-dark hover:bg-navy/10">Required</Badge>}
        </div>
        {draft.alumniId && (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Selected
          </Badge>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <Field label="Linked alumni profile" required={slot.required}>
            <select
              value={draft.alumniId}
              onChange={(event) => onSelectProfile(event.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-navy"
            >
              <option value="">Select alumni profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {formatProfileOption(profile)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Display name" required={slot.required}>
            <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} className="border-slate-300 bg-white" />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Contact number">
              <Input value={draft.contactNumber} onChange={(event) => onChange({ contactNumber: event.target.value })} className="border-slate-300 bg-white" />
            </Field>
            <Field label="Photo upload">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm text-muted-foreground transition hover:border-navy">
                <ImagePlus className="h-4 w-4" />
                <span>{previewPhoto ? "Change photo" : "Upload photo"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(event) => onUploadPhoto(event.target.files?.[0])} />
              </label>
            </Field>
          </div>

        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preview</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {previewPhoto ? (
                <img src={previewPhoto} alt={draft.name || slot.label} className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">{getInitials(draft.name || slot.label)}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-navy-dark">{draft.name || `Select ${slot.label}`}</p>
              <p className="mt-1 text-sm text-muted-foreground">{slot.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{draft.contactNumber || "No contact number"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardMemberEditorCard({
  draft,
  index,
  profiles,
  onSelectProfile,
  onChange,
  onUploadPhoto,
  onRemove,
}: {
  draft: BoardMemberDraft;
  index: number;
  profiles: ProfileRecord[];
  onSelectProfile: (profileId: string) => void;
  onChange: (changes: Partial<BoardMemberDraft>) => void;
  onUploadPhoto: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  const previewPhoto = draft.photoBase64 || draft.currentPhoto;

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy-dark">Board Member {index + 1}</p>
          <p className="text-sm text-muted-foreground">Pick the alumni account and set the title shown in the organization chart.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-rose-600" />
        </Button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Linked alumni profile">
              <select
                value={draft.alumniId}
                onChange={(event) => onSelectProfile(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-navy"
              >
                <option value="">Select alumni profile</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {formatProfileOption(profile)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Board title">
              <Input value={draft.customPosition} onChange={(event) => onChange({ customPosition: event.target.value })} className="border-slate-300 bg-white" placeholder="Board Member" />
            </Field>
          </div>

          <Field label="Display name">
            <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} className="border-slate-300 bg-white" />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Contact number">
              <Input value={draft.contactNumber} onChange={(event) => onChange({ contactNumber: event.target.value })} className="border-slate-300 bg-white" />
            </Field>
            <Field label="Photo upload">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm text-muted-foreground transition hover:border-navy">
                <ImagePlus className="h-4 w-4" />
                <span>{previewPhoto ? "Change photo" : "Upload photo"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(event) => onUploadPhoto(event.target.files?.[0])} />
              </label>
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preview</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {previewPhoto ? (
                <img src={previewPhoto} alt={draft.name || draft.customPosition || "Board Member"} className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">{getInitials(draft.name || draft.customPosition || "Board")}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-navy-dark">{draft.name || "Select board member"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{draft.customPosition.trim() || "Board Member"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPanel({ title, lines, toneClassName }: { title: string; lines: string[]; toneClassName: string }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3", toneClassName)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{title}</p>
      <div className="mt-2 space-y-1 text-sm">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-navy-dark">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-navy-dark">{value}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
      <Users className="h-8 w-8 text-muted-foreground" />
      <h3 className="mt-4 text-base font-semibold text-navy-dark">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SchoolYearCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-4 w-24" />
    </div>
  );
}

function draftNameForBoardMember(boardMembers: BoardMemberDraft[], localId: string) {
  return boardMembers.find((member) => member.localId === localId)?.name || "";
}

function formatProfileOption(profile: ProfileRecord) {
  return profile.name;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
