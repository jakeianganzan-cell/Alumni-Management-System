import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Camera, Lock, LogOut, Save, Shield, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { getRoleLabel, type OfficerRole } from "@/lib/rbac";
import { COURSE_OPTIONS } from "@/lib/courseCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type ModuleMode = "alumni" | "admin";
type SectionKey = "profile" | "security" | "notifications";

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

interface UserNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailNotifications: true,
  inAppNotifications: true,
  eventAnnouncements: true,
  tracerNotifications: true,
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

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ManageAccountModule({ mode }: ManageAccountModuleProps) {
  const { profile, user, role, signOut, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isAdminView = mode === "admin";

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
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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
        const [settingsResponse, notificationsResponse] = await Promise.all([
          fetch(`${API_URL}/account/settings`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API_URL}/user-notifications`, {
            headers: getAuthHeaders(),
          }),
        ]);

        const settingsData = await readApiResponse<{ settings: NotificationSettings }>(settingsResponse);
        const notificationData = await readApiResponse<{
          notifications: UserNotification[];
          unreadCount: number;
        }>(notificationsResponse);

        setNotificationSettings(settingsData.settings);
        setNotifications(notificationData.notifications);
        setUnreadCount(notificationData.unreadCount);
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
  ];

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

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`${API_URL}/user-notifications/${notificationId}/read`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });

      await readApiResponse<{ success: true }>(response);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item))
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Failed to update notification.");
    }
  };

  const markAllNotificationsAsRead = async () => {
    try {
      const response = await fetch(`${API_URL}/user-notifications/read-all`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      await readApiResponse<{ success: true }>(response);
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      setNotificationMessage("All notifications marked as read.");
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Failed to update notifications.");
    }
  };

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
                  onClick={() => setActiveSection(section.key)}
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
                <h3 className="font-display text-2xl font-bold text-navy-dark">Alerts & Recent Activity</h3>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => void markAllNotificationsAsRead()} disabled={!unreadCount}>
                  Mark All Read
                </Button>
                <Button type="button" onClick={() => void saveNotificationSettings()} disabled={savingNotifications || loadingNotifications}>
                  <Save className="mr-2 h-4 w-4" />
                  {savingNotifications ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
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

            <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-navy-dark">Recent Notifications</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {loadingNotifications ? (
                  <p className="text-sm text-muted-foreground">Loading notifications...</p>
                ) : notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notifications available.</p>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-2xl border px-4 py-3 ${
                        item.isRead ? "border-border bg-background" : "border-amber-200 bg-amber-50/50"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-navy-dark">{item.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                          <p className="mt-2 text-xs text-muted-foreground">{formatNotificationTime(item.createdAt)}</p>
                        </div>
                        {!item.isRead && (
                          <Button type="button" size="sm" variant="outline" onClick={() => void markNotificationAsRead(item.id)}>
                            Mark Read
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {notificationMessage && (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notificationMessage}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
