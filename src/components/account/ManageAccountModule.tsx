import { ChangeEvent, DragEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, Camera, ClipboardList, Film, GripVertical, ImagePlus, Lock, LogOut, MessageSquareWarning, Pencil, Save, Shield, Trash2, User, X, Youtube } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { canAccessModule, getRoleLabel, type OfficerRole } from "@/lib/rbac";
import { COURSE_OPTIONS } from "@/lib/courseCatalog";
import {
  getYouTubeVideoId,
  getSlideMediaType,
  isUploadedVideoMedia,
  toYouTubeEmbedUrl,
  type SlideMediaType,
} from "@/lib/slideshowMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import ReportExportsPanel from "@/components/account/ReportExportsPanel";
import ReportProblemPanel from "@/components/account/ReportProblemPanel";
import MyPostsPanel from "@/components/account/MyPostsPanel";

type ModuleMode = "alumni" | "admin";
type SectionKey = "profile" | "security" | "notifications" | "problem" | "reports";

interface ManageAccountModuleProps {
  mode: ModuleMode;
}

interface ProfileFormState {
  fullName: string;
  email: string;
  contactNumber: string;
  studentId: string;
  course: string;
  yearGraduated: string;
}

interface NotificationSettings {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  eventAnnouncements: boolean;
  tracerNotifications: boolean;
}

interface SecurityState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface HomepageSlide {
  id: number | string;
  title: string;
  caption?: string | null;
  mediaType?: SlideMediaType | string | null;
  mediaUrl?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  isHighlighted?: boolean;
  displayOrder?: number;
  status?: string | null;
}

interface HomepageSlideForm {
  title: string;
  caption: string;
  mediaType: SlideMediaType;
  mediaUrl: string;
  youtubeUrl: string;
  linkUrl: string;
  displayOrder: number;
  status: string;
  isHighlighted: boolean;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailNotifications: true,
  inAppNotifications: true,
  eventAnnouncements: true,
  tracerNotifications: true,
};

const EMPTY_HOMEPAGE_SLIDE: HomepageSlideForm = {
  title: "",
  caption: "",
  mediaType: "image",
  mediaUrl: "",
  youtubeUrl: "",
  linkUrl: "",
  displayOrder: 0,
  status: "active",
  isHighlighted: false,
};

function isOfficerRole(role: string | null): role is OfficerRole {
  if (!role) return false;
  return role !== "alumni";
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy-dark">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function getUploadTitle(file: File) {
  return file.name.replace(/\.[^/.]+$/, "").trim() || "Homepage advertisement";
}

export default function ManageAccountModule({ mode }: ManageAccountModuleProps) {
  const { profile, user, role, signOut, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isAdminView = mode === "admin";
  const canViewReports = isAdminView && isOfficerRole(role) && canAccessModule(role, "reports");

  const [activeSection, setActiveSection] = useState<SectionKey>("profile");
  const [photoPreview, setPhotoPreview] = useState<string | null>(resolveAssetUrl(profile?.photo));
  const [photoValue, setPhotoValue] = useState<string | null>(profile?.photo ?? null);

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    fullName: profile?.name ?? "",
    email: user?.email ?? "",
    contactNumber: profile?.contact_number ?? "",
    studentId: profile?.student_id ?? "",
    course: profile?.course ?? "",
    yearGraduated: profile?.batch ?? "",
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileMessage, setProfileMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [security, setSecurity] = useState<SecurityState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [securityErrors, setSecurityErrors] = useState<Record<string, string>>({});
  const [securityMessage, setSecurityMessage] = useState("");
  const [savingSecurity, setSavingSecurity] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [homepageSlides, setHomepageSlides] = useState<HomepageSlide[]>([]);
  const [homepageSlideForm, setHomepageSlideForm] = useState<HomepageSlideForm>(EMPTY_HOMEPAGE_SLIDE);
  const [editingHomepageSlideId, setEditingHomepageSlideId] = useState<number | string | null>(null);
  const [loadingHomepageSlides, setLoadingHomepageSlides] = useState(false);
  const [savingHomepageSlide, setSavingHomepageSlide] = useState(false);
  const [homepageSlideMessage, setHomepageSlideMessage] = useState("");
  const [draggedHomepageSlideId, setDraggedHomepageSlideId] = useState<number | string | null>(null);

  const loadHomepageSlides = useCallback(async () => {
    if (!isAdminView) return;

    setLoadingHomepageSlides(true);
    try {
      const response = await fetch(`${API_URL}/admin/slideshow`, {
        headers: getAuthHeaders(),
      });
      const slides = await readApiResponse<HomepageSlide[]>(response);
      setHomepageSlides(slides);
    } catch (error) {
      setHomepageSlideMessage(error instanceof Error ? error.message : "Failed to load homepage slides.");
    } finally {
      setLoadingHomepageSlides(false);
    }
  }, [isAdminView]);

  useEffect(() => {
    const requestedSection = searchParams.get("section");

    if (requestedSection === "reports" && canViewReports) {
      setActiveSection("reports");
    } else if (requestedSection === "reports" && !canViewReports) {
      setActiveSection("profile");
    }
  }, [canViewReports, searchParams]);

  useEffect(() => {
    void loadHomepageSlides();
  }, [loadHomepageSlides]);

  useEffect(() => {
    setProfileForm({
      fullName: profile?.name ?? "",
      email: user?.email ?? "",
      contactNumber: profile?.contact_number ?? "",
      studentId: profile?.student_id ?? "",
      course: profile?.course ?? "",
      yearGraduated: profile?.batch ?? "",
    });
    setPhotoValue(profile?.photo ?? null);
    setPhotoPreview(resolveAssetUrl(profile?.photo));
  }, [profile, user]);

  useEffect(() => {
    const loadNotificationData = async () => {
      setLoadingNotifications(true);
      try {
        const settingsResponse = await fetch(`${API_URL}/account/settings`, {
          headers: getAuthHeaders(),
        });

        const settingsData = await readApiResponse<{ settings: NotificationSettings }>(settingsResponse);

        setNotificationSettings(settingsData.settings);
      } catch (error) {
        setNotificationMessage(error instanceof Error ? error.message : "Failed to load notifications.");
      } finally {
        setLoadingNotifications(false);
      }
    };

    void loadNotificationData();
  }, []);

  const roleLabel = isOfficerRole(role) ? getRoleLabel(role) : isAdminView ? "Admin" : "Alumni";
  const profileBadge = useMemo(() => {
    if (isAdminView) return roleLabel;
    const course = profileForm.course || "Program pending";
    const batch = profileForm.yearGraduated || "----";
    return `${course} • Class of ${batch}`;
  }, [isAdminView, profileForm.course, profileForm.yearGraduated, roleLabel]);

  const sections = [
    { key: "profile" as SectionKey, label: "Profile", icon: User },
    { key: "security" as SectionKey, label: "Account Settings", icon: Lock },
    { key: "notifications" as SectionKey, label: "Notifications", icon: Bell },
    ...(canViewReports ? [{ key: "reports" as SectionKey, label: "Reports", icon: ClipboardList }] : []),
    ...(!isAdminView ? [{ key: "problem" as SectionKey, label: "Report a Problem", icon: MessageSquareWarning }] : []),
  ];

  const selectSection = (section: SectionKey) => {
    setActiveSection(section);
    setSearchParams(section === "reports" ? { section: "reports" } : {});
  };

  const handleProfileChange = (key: keyof ProfileFormState, value: string) => {
    setProfileMessage("");
    setProfileErrors((current) => ({ ...current, [key]: "" }));
    setProfileForm((current) => ({ ...current, [key]: value }));
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setPhotoValue(reader.result);
      setPhotoPreview(reader.result);
      setProfileMessage("Photo selected. Save profile to apply the change.");
    };
    reader.readAsDataURL(file);
  };

  const validateProfile = () => {
    const errors: Record<string, string> = {};
    if (!profileForm.fullName.trim()) errors.fullName = "Full name is required.";
    if (!profileForm.email.trim()) {
      errors.email = "Email is required.";
    } else if (!/\S+@\S+\.\S+/.test(profileForm.email)) {
      errors.email = "Enter a valid email address.";
    }
    if (profileForm.contactNumber && !/^[0-9+\-\s()]{7,20}$/.test(profileForm.contactNumber)) {
      errors.contactNumber = "Enter a valid contact number.";
    }
    if (!isAdminView) {
      if (!profileForm.course.trim()) errors.course = "Course or program is required.";
      if (!profileForm.yearGraduated.trim()) errors.yearGraduated = "Year graduated is required.";
    }
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveProfile = async () => {
    if (!validateProfile()) {
      setProfileMessage("Please resolve the highlighted profile fields.");
      return;
    }

    setSavingProfile(true);
    setProfileMessage("");

    try {
      const response = await fetch(`${API_URL}/account/profile`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          fullName: profileForm.fullName,
          email: profileForm.email,
          contactNumber: profileForm.contactNumber,
          course: isAdminView ? null : profileForm.course,
          yearGraduated: isAdminView ? null : profileForm.yearGraduated,
          photo: photoValue,
        }),
      });

      const data = await readApiResponse<{ message: string }>(response);
      setProfileMessage(data.message);
      await refreshProfile();
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveSecurity = async () => {
    const errors: Record<string, string> = {};
    if (!security.currentPassword.trim()) errors.currentPassword = "Current password is required.";
    if (security.newPassword.length < 8) errors.newPassword = "New password must be at least 8 characters.";
    if (security.newPassword !== security.confirmPassword) errors.confirmPassword = "Passwords do not match.";
    setSecurityErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSecurityMessage("Please review your password fields.");
      return;
    }

    setSavingSecurity(true);
    setSecurityMessage("");

    try {
      const response = await fetch(`${API_URL}/account/password`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          currentPassword: security.currentPassword,
          newPassword: security.newPassword,
        }),
      });

      const data = await readApiResponse<{ message: string }>(response);
      setSecurityMessage(data.message);
      setSecurity({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      setSecurityMessage(error instanceof Error ? error.message : "Failed to update password.");
    } finally {
      setSavingSecurity(false);
    }
  };

  const saveNotificationSettings = async () => {
    setSavingNotifications(true);
    setNotificationMessage("");

    try {
      const response = await fetch(`${API_URL}/account/notifications`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(notificationSettings),
      });

      const data = await readApiResponse<{ message: string; settings: NotificationSettings }>(response);
      setNotificationSettings(data.settings);
      setNotificationMessage(data.message);
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Failed to update notifications.");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleHomepageSlideImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const mediaType: SlideMediaType = file.type.startsWith("video/") ? "video" : "image";
      setHomepageSlideMessage("");
      setHomepageSlideForm((current) => ({
        ...current,
        title: getUploadTitle(file),
        mediaType,
        mediaUrl: reader.result as string,
        youtubeUrl: "",
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleHomepageYouTubeChange = (value: string) => {
    setHomepageSlideMessage("");
    setHomepageSlideForm((current) => ({
      ...current,
      mediaType: "youtube",
      youtubeUrl: value,
      mediaUrl: value ? toYouTubeEmbedUrl(value) || value : "",
    }));
  };

  const resetHomepageSlideForm = () => {
    setHomepageSlideForm(EMPTY_HOMEPAGE_SLIDE);
    setEditingHomepageSlideId(null);
  };

  const editHomepageSlide = (slide: HomepageSlide) => {
    const mediaUrl = slide.mediaUrl || slide.imageUrl || "";
    const mediaType = getSlideMediaType(slide.mediaType, mediaUrl);
    setHomepageSlideMessage("");
    setEditingHomepageSlideId(slide.id);
    setHomepageSlideForm({
      title: slide.title || "",
      caption: slide.caption || "",
      mediaType,
      mediaUrl,
      youtubeUrl: mediaType === "youtube" ? mediaUrl : "",
      linkUrl: slide.linkUrl || "",
      displayOrder: Number(slide.displayOrder || 0),
      status: slide.status || "active",
      isHighlighted: Boolean(slide.isHighlighted),
    });
  };

  const saveHomepageSlide = async () => {
    const selectedMediaUrl = homepageSlideForm.mediaType === "youtube"
      ? homepageSlideForm.youtubeUrl.trim()
      : homepageSlideForm.mediaUrl;

    if (!selectedMediaUrl) {
      setHomepageSlideMessage("Upload media or paste a YouTube link before saving.");
      return;
    }

    if (homepageSlideForm.mediaType === "youtube" && !getYouTubeVideoId(selectedMediaUrl)) {
      setHomepageSlideMessage("Enter a valid YouTube watch, Shorts, Live, embed, or youtu.be link.");
      return;
    }

    setSavingHomepageSlide(true);
    setHomepageSlideMessage("");

    try {
      const response = await fetch(
        editingHomepageSlideId ? `${API_URL}/admin/slideshow/${editingHomepageSlideId}` : `${API_URL}/admin/slideshow`,
        {
        method: editingHomepageSlideId ? "PUT" : "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...homepageSlideForm,
          title: homepageSlideForm.title.trim() || "Homepage advertisement",
          mediaUrl: selectedMediaUrl,
          imageUrl: selectedMediaUrl,
        }),
      }
      );
      await readApiResponse(response);
      resetHomepageSlideForm();
      setHomepageSlideMessage(editingHomepageSlideId ? "Homepage slide updated." : "Homepage slide posted.");
      await loadHomepageSlides();
    } catch (error) {
      setHomepageSlideMessage(error instanceof Error ? error.message : "Failed to save homepage slide.");
    } finally {
      setSavingHomepageSlide(false);
    }
  };

  const saveHomepageSlideOrder = async (nextSlides: HomepageSlide[]) => {
    const reorderedSlides = nextSlides.map((slide, index) => ({ ...slide, displayOrder: index + 1 }));
    setHomepageSlides(reorderedSlides);
    setHomepageSlideMessage("");

    try {
      const response = await fetch(`${API_URL}/admin/slideshow/reorder`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          slides: reorderedSlides.map((slide) => ({
            id: slide.id,
            displayOrder: slide.displayOrder,
          })),
        }),
      });
      const updatedSlides = await readApiResponse<HomepageSlide[]>(response);
      setHomepageSlides(updatedSlides);
      setHomepageSlideMessage("Homepage slide order updated.");
    } catch (error) {
      setHomepageSlideMessage(error instanceof Error ? error.message : "Failed to reorder homepage slides.");
      await loadHomepageSlides();
    }
  };

  const handleHomepageSlideDragStart = (event: DragEvent<HTMLDivElement>, slideId: number | string) => {
    setDraggedHomepageSlideId(slideId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(slideId));
  };

  const handleHomepageSlideDrop = async (event: DragEvent<HTMLDivElement>, targetSlideId: number | string) => {
    event.preventDefault();
    const sourceSlideId = draggedHomepageSlideId ?? event.dataTransfer.getData("text/plain");
    setDraggedHomepageSlideId(null);
    if (!sourceSlideId || String(sourceSlideId) === String(targetSlideId)) return;

    const sourceIndex = homepageSlides.findIndex((slide) => String(slide.id) === String(sourceSlideId));
    const targetIndex = homepageSlides.findIndex((slide) => String(slide.id) === String(targetSlideId));
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextSlides = [...homepageSlides];
    const [movedSlide] = nextSlides.splice(sourceIndex, 1);
    nextSlides.splice(targetIndex, 0, movedSlide);
    await saveHomepageSlideOrder(nextSlides);
  };

  const deleteHomepageSlide = async (slideId: number | string) => {
    const confirmed = window.confirm("Delete this homepage slide?");
    if (!confirmed) return;

    setHomepageSlideMessage("");

    try {
      const response = await fetch(`${API_URL}/admin/slideshow/${slideId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      await readApiResponse(response);
      setHomepageSlides((current) => current.filter((slide) => String(slide.id) !== String(slideId)));
      if (String(editingHomepageSlideId) === String(slideId)) {
        resetHomepageSlideForm();
      }
      setHomepageSlideMessage("Homepage slide deleted.");
    } catch (error) {
      setHomepageSlideMessage(error instanceof Error ? error.message : "Failed to delete homepage slide.");
    }
  };

  const homepageYouTubePreviewUrl = homepageSlideForm.mediaType === "youtube"
    ? toYouTubeEmbedUrl(homepageSlideForm.youtubeUrl)
    : "";
  const homepageSlidePreviewUrl = homepageSlideForm.mediaType === "youtube"
    ? homepageYouTubePreviewUrl
    : resolveAssetUrl(homepageSlideForm.mediaUrl) || homepageSlideForm.mediaUrl;
  const isHomepageYouTubeInvalid = Boolean(
    homepageSlideForm.mediaType === "youtube" &&
    homepageSlideForm.youtubeUrl.trim() &&
    !homepageYouTubePreviewUrl
  );
  const canSaveHomepageSlide = Boolean(
    homepageSlideForm.mediaType === "youtube"
      ? homepageSlideForm.youtubeUrl.trim() && homepageYouTubePreviewUrl
      : homepageSlideForm.mediaUrl
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-5">
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
          <div className="p-6 text-white" style={{ background: "var(--gradient-navy)" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
              Manage Account
            </p>
            <div className="mt-5 flex items-center gap-4">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10">
                  {photoPreview ? (
                    <img src={photoPreview} alt={profileForm.fullName || "Profile"} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-2xl font-bold text-gold">
                      {(profileForm.fullName || "A")[0]}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 rounded-full bg-gold p-2 text-navy-dark shadow-lg transition-transform hover:scale-105"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl font-bold">{profileForm.fullName || "Account"}</h2>
                <p className="mt-1 text-sm text-white/75">{roleLabel}</p>
                <span className="mt-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                  {profileBadge}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-5">
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm">
              <p className="font-semibold text-navy-dark">Profile Photo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload or remove your profile image, then save your profile.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" />
                  Change Photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhotoValue(null);
                    setPhotoPreview(null);
                    setProfileMessage("Photo removed. Save profile to apply the change.");
                  }}
                >
                  Remove
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>

            <div className="space-y-2">
              {sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => selectSection(section.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
                    activeSection === section.key
                      ? "bg-navy text-white shadow-card"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <section.icon className="h-4 w-4" />
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="space-y-6">
        {activeSection === "profile" && (
          <>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
            <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">Profile Information</p>
                <h3 className="font-display text-2xl font-bold text-navy-dark">
                  {isAdminView ? "Administrator Profile" : "Personal Alumni Profile"}
                </h3>
              </div>
              <Button type="button" onClick={() => void saveProfile()} disabled={savingProfile}>
                <Save className="mr-2 h-4 w-4" />
                {savingProfile ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Full Name" error={profileErrors.fullName}>
                <Input
                  value={profileForm.fullName}
                  onChange={(event) => handleProfileChange("fullName", event.target.value)}
                  placeholder="Enter full name"
                />
              </Field>

              <Field label="Email Address" error={profileErrors.email}>
                <Input
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => handleProfileChange("email", event.target.value)}
                  placeholder="name@example.com"
                />
              </Field>

              <Field label="Contact Number" error={profileErrors.contactNumber}>
                <Input
                  value={profileForm.contactNumber}
                  onChange={(event) => handleProfileChange("contactNumber", event.target.value)}
                  placeholder="+63 912 345 6789"
                />
              </Field>

              {!isAdminView && (
                <Field label="Student ID">
                  <Input value={profileForm.studentId} disabled />
                </Field>
              )}

              {!isAdminView && (
                <>
                  <Field label="Course / Program" error={profileErrors.course}>
                    <select
                      value={profileForm.course}
                      onChange={(event) => handleProfileChange("course", event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="">Select a course</option>
                      {COURSE_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Year Graduated" error={profileErrors.yearGraduated}>
                    <Input
                      value={profileForm.yearGraduated}
                      onChange={(event) => handleProfileChange("yearGraduated", event.target.value)}
                      placeholder="2024"
                    />
                  </Field>
                </>
              )}
            </div>

            {profileMessage && (
              <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                {profileMessage}
              </div>
            )}
          </div>

          {!isAdminView && <MyPostsPanel />}

          {isAdminView && (
            <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
              <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">Homepage Slides</p>
                  <h3 className="font-display text-2xl font-bold text-navy-dark">
                    {editingHomepageSlideId ? "Edit Slide" : "Post Media"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload an image or video, or paste a YouTube link for the alumni homepage slideshow.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingHomepageSlideId && (
                    <Button type="button" variant="outline" onClick={resetHomepageSlideForm}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => void saveHomepageSlide()}
                    disabled={savingHomepageSlide || !canSaveHomepageSlide}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {savingHomepageSlide ? "Saving..." : editingHomepageSlideId ? "Save Slide" : "Post"}
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Slide Title">
                      <Input
                        value={homepageSlideForm.title}
                        onChange={(event) => setHomepageSlideForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Homepage advertisement"
                      />
                    </Field>
                    <Field label="Status">
                      <select
                        value={homepageSlideForm.status}
                        onChange={(event) => setHomepageSlideForm((current) => ({ ...current, status: event.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                      <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center text-sm text-muted-foreground transition hover:border-navy">
                        <ImagePlus className="h-8 w-8 text-navy" />
                        <span className="font-semibold text-navy-dark">Upload image or video</span>
                        <span className="text-xs">Images and short videos stay inside the slideshow frame.</span>
                        <input type="file" accept="image/*,video/*" className="hidden" onChange={handleHomepageSlideImage} />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/20 p-3">
                      <Field label="YouTube Link">
                        <div className="relative">
                          <Youtube className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-600" />
                          <Input
                            value={homepageSlideForm.youtubeUrl}
                            onChange={(event) => handleHomepageYouTubeChange(event.target.value)}
                            placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
                            className="pl-9"
                          />
                        </div>
                      </Field>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Normal YouTube links are saved as embedded slideshow videos automatically.
                      </p>
                      {isHomepageYouTubeInvalid && (
                        <p className="mt-2 text-xs font-medium text-red-600">
                          This YouTube link is not valid. Use a watch, Shorts, Live, embed, or youtu.be link.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-gray-950 p-3 text-white">
                  <div className="aspect-video overflow-hidden rounded-xl bg-black">
                    {homepageSlidePreviewUrl && homepageSlideForm.mediaType === "youtube" ? (
                      <iframe
                        src={homepageSlidePreviewUrl}
                        title="YouTube slide preview"
                        className="h-full w-full"
                        loading="lazy"
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        allowFullScreen
                      />
                    ) : homepageSlidePreviewUrl && isUploadedVideoMedia(homepageSlidePreviewUrl) ? (
                      <video src={homepageSlidePreviewUrl} className="h-full w-full object-contain" controls muted playsInline preload="metadata" />
                    ) : homepageSlidePreviewUrl ? (
                      <img src={homepageSlidePreviewUrl} alt="Slide preview" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-white/70">
                        <Film className="h-8 w-8" />
                        <span>Slide preview</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 font-semibold uppercase">
                      {homepageSlideForm.mediaType}
                    </span>
                    {homepageSlideForm.isHighlighted && <span>Highlighted</span>}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy-dark">Posted Media</p>
                    <p className="text-xs text-muted-foreground">Edit, reorder, or remove slides shown on the homepage.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadHomepageSlides()} disabled={loadingHomepageSlides}>
                    {loadingHomepageSlides ? "Loading..." : "Refresh"}
                  </Button>
                </div>

                <div className="mt-4 space-y-3">
                  {loadingHomepageSlides ? (
                    <p className="text-sm text-muted-foreground">Loading homepage slides...</p>
                  ) : homepageSlides.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No homepage slides posted yet.</p>
                  ) : (
                    homepageSlides.map((slide) => {
                      const slideMedia = resolveAssetUrl(slide.mediaUrl || slide.imageUrl) || slide.mediaUrl || slide.imageUrl || "";
                      const slideType = getSlideMediaType(slide.mediaType, slideMedia);
                      const isDragging = String(draggedHomepageSlideId) === String(slide.id);
                      return (
                        <div
                          key={slide.id}
                          draggable
                          onDragStart={(event) => handleHomepageSlideDragStart(event, slide.id)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => void handleHomepageSlideDrop(event, slide.id)}
                          onDragEnd={() => setDraggedHomepageSlideId(null)}
                          className={`grid cursor-grab gap-3 rounded-xl border border-border bg-background p-3 transition active:cursor-grabbing sm:grid-cols-[32px_120px_minmax(0,1fr)_auto] sm:items-center ${
                            isDragging ? "opacity-55 ring-2 ring-navy/30" : "hover:border-navy/35"
                          }`}
                        >
                          <div className="flex items-center justify-center text-muted-foreground" title="Drag to reorder">
                            <GripVertical className="h-5 w-5" />
                          </div>
                          <div className="aspect-video overflow-hidden rounded-lg bg-gray-100">
                            {slideMedia && slideType === "youtube" ? (
                              <div className="flex h-full w-full items-center justify-center bg-gray-950 text-white">
                                <Youtube className="h-6 w-6" />
                              </div>
                            ) : slideMedia && slideType === "video" ? (
                              <video src={slideMedia} className="h-full w-full object-contain" muted playsInline preload="metadata" />
                            ) : slideMedia ? (
                              <img src={slideMedia} alt={slide.title} className="h-full w-full object-contain" loading="lazy" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No media</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-navy-dark">{slide.title}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{slide.caption || slideMedia}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
                                {slideType}
                              </span>
                            {slide.status && (
                              <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
                                {slide.status}
                              </span>
                            )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Button type="button" variant="outline" size="sm" onClick={() => editHomepageSlide(slide)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => void deleteHomepageSlide(slide.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {homepageSlideMessage && (
                <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  {homepageSlideMessage}
                </div>
              )}
            </div>
          )}
          </>
        )}

        {activeSection === "security" && (
          <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
            <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">Account Settings</p>
                <h3 className="font-display text-2xl font-bold text-navy-dark">Password Management</h3>
              </div>
              <Button type="button" onClick={() => void saveSecurity()} disabled={savingSecurity}>
                <Shield className="mr-2 h-4 w-4" />
                {savingSecurity ? "Saving..." : "Change Password"}
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Current Password" error={securityErrors.currentPassword}>
                <Input
                  type="password"
                  value={security.currentPassword}
                  onChange={(event) => {
                    setSecurityErrors((current) => ({ ...current, currentPassword: "" }));
                    setSecurityMessage("");
                    setSecurity((current) => ({ ...current, currentPassword: event.target.value }));
                  }}
                  placeholder="Enter current password"
                />
              </Field>

              <Field label="New Password" error={securityErrors.newPassword}>
                <Input
                  type="password"
                  value={security.newPassword}
                  onChange={(event) => {
                    setSecurityErrors((current) => ({ ...current, newPassword: "" }));
                    setSecurityMessage("");
                    setSecurity((current) => ({ ...current, newPassword: event.target.value }));
                  }}
                  placeholder="Enter new password"
                />
              </Field>

              <Field label="Confirm Password" error={securityErrors.confirmPassword}>
                <Input
                  type="password"
                  value={security.confirmPassword}
                  onChange={(event) => {
                    setSecurityErrors((current) => ({ ...current, confirmPassword: "" }));
                    setSecurityMessage("");
                    setSecurity((current) => ({ ...current, confirmPassword: event.target.value }));
                  }}
                  placeholder="Confirm new password"
                />
              </Field>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-4">
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => void signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout from this device
              </Button>
            </div>

            {securityMessage && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {securityMessage}
              </div>
            )}
          </div>
        )}

        {activeSection === "notifications" && (
          <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
            <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy">Notification Settings</p>
                <h3 className="font-display text-2xl font-bold text-navy-dark">Alerts & Preferences</h3>
              </div>
              <Button type="button" onClick={() => void saveNotificationSettings()} disabled={savingNotifications || loadingNotifications}>
                <Save className="mr-2 h-4 w-4" />
                {savingNotifications ? "Saving..." : "Save Preferences"}
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              <ToggleRow
                title="Email Notifications"
                description="Receive important account updates through email."
                checked={notificationSettings.emailNotifications}
                onCheckedChange={(checked) => {
                  setNotificationMessage("");
                  setNotificationSettings((current) => ({ ...current, emailNotifications: checked }));
                }}
              />
              <ToggleRow
                title="In-app Notifications"
                description="Show updates inside the alumni management system."
                checked={notificationSettings.inAppNotifications}
                onCheckedChange={(checked) => {
                  setNotificationMessage("");
                  setNotificationSettings((current) => ({ ...current, inAppNotifications: checked }));
                }}
              />
              <ToggleRow
                title="Event Announcements"
                description="Be notified when events and announcements are published."
                checked={notificationSettings.eventAnnouncements}
                onCheckedChange={(checked) => {
                  setNotificationMessage("");
                  setNotificationSettings((current) => ({ ...current, eventAnnouncements: checked }));
                }}
              />
              <ToggleRow
                title="Survey / Tracer Notifications"
                description="Receive survey reminders and tracer follow-up notices."
                checked={notificationSettings.tracerNotifications}
                onCheckedChange={(checked) => {
                  setNotificationMessage("");
                  setNotificationSettings((current) => ({ ...current, tracerNotifications: checked }));
                }}
              />
            </div>

            {notificationMessage && (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notificationMessage}
              </div>
            )}
          </div>
        )}

        {activeSection === "problem" && !isAdminView && <ReportProblemPanel />}

        {activeSection === "reports" && canViewReports && <ReportExportsPanel />}
      </section>
    </div>
  );
}
