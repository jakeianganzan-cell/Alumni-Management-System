import { ChangeEvent, useEffect, useState } from "react";
import { Building2, ImagePlus, Palette, Plus, Save, Trash2, Upload } from "lucide-react";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { SystemSettings, useSystemSettings } from "@/context/SystemSettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type BrandingForm = SystemSettings;
type BrandingCategory = "identity" | "assets" | "login" | "theme" | "homepage" | "programs";

const BRANDING_CATEGORIES: Array<{ value: BrandingCategory; label: string }> = [
  { value: "identity", label: "Institution Details" },
  { value: "assets", label: "Logos & Icons" },
  { value: "login", label: "Login Experience" },
  { value: "theme", label: "Theme & Colors" },
  { value: "homepage", label: "Homepage Content" },
  { value: "programs", label: "Programs" },
];

const COLOR_FIELDS: Array<{ key: keyof Pick<BrandingForm, "primaryColor" | "secondaryColor" | "sidebarColor" | "headerColor" | "buttonColor" | "cardColor">; label: string }> = [
  { key: "primaryColor", label: "Primary Color" },
  { key: "secondaryColor", label: "Secondary Color" },
  { key: "sidebarColor", label: "Sidebar Color" },
  { key: "headerColor", label: "Header Color" },
  { key: "buttonColor", label: "Button Color" },
  { key: "cardColor", label: "Card Accent Color" },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read file."));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export default function SystemBrandingPanel() {
  const { settings, refreshSettings } = useSystemSettings();
  const [form, setForm] = useState<BrandingForm>(settings);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<BrandingCategory>("identity");
  const [programDraft, setProgramDraft] = useState({ code: "", label: "" });

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const updateForm = <K extends keyof BrandingForm>(key: K, value: BrandingForm[K]) => {
    setMessage("");
    setForm((current) => ({ ...current, [key]: value }));
  };

  const normalizeProgramCode = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();

  const updateProgram = (index: number, key: "code" | "label", value: string) => {
    setMessage("");
    setForm((current) => ({
      ...current,
      programs: current.programs.map((program, programIndex) => programIndex === index ? { ...program, [key]: key === "code" ? normalizeProgramCode(value) : value } : program),
    }));
  };

  const addProgram = () => {
    const code = normalizeProgramCode(programDraft.code);
    const label = programDraft.label.trim().replace(/\s+/g, " ") || code;

    if (!code) {
      setMessage("Enter a program code before adding it.");
      return;
    }

    if (form.programs.some((program) => program.code.toUpperCase() === code)) {
      setMessage("Program code already exists.");
      return;
    }

    setMessage("");
    setForm((current) => ({ ...current, programs: [...current.programs, { code, label }] }));
    setProgramDraft({ code: "", label: "" });
  };

  const removeProgram = (index: number) => {
    setMessage("");
    setForm((current) => current.programs.length <= 1 ? current : {
      ...current,
      programs: current.programs.filter((_, programIndex) => programIndex !== index),
    });
  };
  const uploadFile = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch(`${API_URL}/admin/system-settings/upload`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ fileName: file.name, dataUrl }),
    });
    const data = await readApiResponse<{ path: string }>(response);
    return data.path;
  };

  const handleSingleUpload = async (key: "logoPath" | "loginLogoPath" | "faviconPath" | "loginBackgroundPath", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingField(key);
    setMessage("");
    try {
      const path = await uploadFile(file);
      updateForm(key, path);
      if (key === "loginBackgroundPath") {
        setForm((current) => ({
          ...current,
          loginBackgrounds: current.loginBackgrounds.includes(path)
            ? current.loginBackgrounds
            : [path, ...current.loginBackgrounds],
        }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploadingField(null);
    }
  };

  const handleMultipleBackgrounds = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setUploadingField("loginBackgrounds");
    setMessage("");
    try {
      const uploaded = [];
      for (const file of files) {
        uploaded.push(await uploadFile(file));
      }
      setForm((current) => {
        const nextBackgrounds = [...current.loginBackgrounds, ...uploaded].filter((path, index, list) => path && list.indexOf(path) === index);
        return {
          ...current,
          loginBackgroundPath: current.loginBackgroundPath || nextBackgrounds[0] || "",
          loginBackgrounds: nextBackgrounds,
        };
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploadingField(null);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/system-settings`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      const data = await readApiResponse<{ message: string; settings: SystemSettings }>(response);
      setForm(data.settings);
      await refreshSettings();
      setMessage(data.message || "System branding settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save system branding settings.");
    } finally {
      setSaving(false);
    }
  };

  const AssetUpload = ({
    label,
    field,
    accept = "image/*",
  }: {
    label: string;
    field: "logoPath" | "loginLogoPath" | "faviconPath" | "loginBackgroundPath";
    accept?: string;
  }) => {
    const preview = resolveAssetUrl(String(form[field] || "")) || String(form[field] || "");
    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-navy-dark">{label}</p>
          {form[field] && (
            <Button type="button" variant="outline" size="sm" onClick={() => updateForm(field, "" as BrandingForm[typeof field])}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-3 flex min-h-[120px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-background">
          {preview ? (
            <img src={preview} alt={`${label} preview`} className="max-h-32 w-full object-contain p-3" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <ImagePlus className="h-7 w-7" />
              <span>No file selected</span>
            </div>
          )}
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/50">
          <Upload className="h-4 w-4" />
          {uploadingField === field ? "Uploading..." : "Upload"}
          <input type="file" accept={accept} className="hidden" onChange={(event) => void handleSingleUpload(field, event)} />
        </label>
        {form[field] && <p className="mt-2 break-all text-xs text-muted-foreground">{form[field]}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Admin Settings</p>
            <h3 className="mt-1 font-display text-2xl font-bold text-navy-dark">System Branding & Customization</h3>
          </div>
          <Button type="button" onClick={() => void saveSettings()} disabled={saving || Boolean(uploadingField)}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Branding"}
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {BRANDING_CATEGORIES.map((category) => (
            <Button
              key={category.value}
              type="button"
              size="sm"
              variant={activeCategory === category.value ? "default" : "outline"}
              onClick={() => setActiveCategory(category.value)}
            >
              {category.label}
            </Button>
          ))}
        </div>

        {activeCategory === "identity" && (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="System Name">
            <Input value={form.systemName} onChange={(event) => updateForm("systemName", event.target.value)} />
          </Field>
          <Field label="System Short Name / Acronym">
            <Input value={form.systemShortName} onChange={(event) => updateForm("systemShortName", event.target.value)} />
          </Field>
          <Field label="School / Institution Name">
            <Input value={form.institutionName} onChange={(event) => updateForm("institutionName", event.target.value)} />
          </Field>
          <Field label="Contact Number">
            <Input value={form.institutionContact} onChange={(event) => updateForm("institutionContact", event.target.value)} />
          </Field>
          <Field label="Official Email">
            <Input type="email" value={form.institutionEmail} onChange={(event) => updateForm("institutionEmail", event.target.value)} />
          </Field>
          <Field label="Website URL">
            <Input value={form.websiteUrl} onChange={(event) => updateForm("websiteUrl", event.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field label="School Address">
              <textarea
                value={form.institutionAddress}
                onChange={(event) => updateForm("institutionAddress", event.target.value)}
                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Footer Copyright Text">
              <Input value={form.footerCopyrightText} onChange={(event) => updateForm("footerCopyrightText", event.target.value)} />
            </Field>
          </div>
        </div>
        )}
      </div>

      {activeCategory === "programs" && (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="border-b border-border pb-4">
          <h3 className="font-display text-xl font-bold text-navy-dark">Program Management</h3>
          <p className="mt-1 text-sm text-muted-foreground">Programs added here appear in alumni assignment and import selections.</p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
          <Field label="Program Code">
            <Input value={programDraft.code} onChange={(event) => setProgramDraft((current) => ({ ...current, code: event.target.value }))} placeholder="BSIT" />
          </Field>
          <Field label="Program Name">
            <Input value={programDraft.label} onChange={(event) => setProgramDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Bachelor of Science in Information Technology" />
          </Field>
          <div className="flex items-end">
            <Button type="button" className="w-full" onClick={addProgram}>
              <Plus className="mr-2 h-4 w-4" /> Add Program
            </Button>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {form.programs.map((program, index) => (
            <div key={`${program.code}-${index}`} className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
              <Input value={program.code} onChange={(event) => updateProgram(index, "code", event.target.value)} aria-label="Program code" />
              <Input value={program.label} onChange={(event) => updateProgram(index, "label", event.target.value)} aria-label="Program name" />
              <Button type="button" variant="outline" size="icon" aria-label="Remove program" onClick={() => removeProgram(index)} disabled={form.programs.length <= 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
      )}
      {activeCategory === "assets" && (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="border-b border-border pb-4">
          <h3 className="font-display text-xl font-bold text-navy-dark">Logo Management</h3>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <AssetUpload label="Main System Logo" field="logoPath" />
          <AssetUpload label="Login Page Logo" field="loginLogoPath" />
          <AssetUpload label="Favicon" field="faviconPath" accept="image/*,.ico" />
        </div>
      </div>
      )}

      {activeCategory === "login" && (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="border-b border-border pb-4">
          <h3 className="font-display text-xl font-bold text-navy-dark">Login Page Customization</h3>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Field label="Login Welcome Message">
              <Input value={form.welcomeMessage} onChange={(event) => updateForm("welcomeMessage", event.target.value)} />
            </Field>
            <Field label="Login Subtitle / Description">
              <textarea
                value={form.loginSubtitle}
                onChange={(event) => updateForm("loginSubtitle", event.target.value)}
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold text-navy-dark">Enable Background Slideshow</p>
                <p className="text-xs text-muted-foreground">Rotate multiple login background images.</p>
              </div>
              <Switch checked={form.loginSlideshowEnabled} onCheckedChange={(checked) => updateForm("loginSlideshowEnabled", checked)} />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/50">
              <Upload className="h-4 w-4" />
              {uploadingField === "loginBackgrounds" ? "Uploading..." : "Upload Multiple Backgrounds"}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleMultipleBackgrounds(event)} />
            </label>
          </div>
          <AssetUpload label="Primary Login Background" field="loginBackgroundPath" />
        </div>
        {form.loginBackgrounds.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {form.loginBackgrounds.map((background) => {
              const preview = resolveAssetUrl(background) || background;
              const isPrimary = background === form.loginBackgroundPath;
              return (
                <div key={background} className={`overflow-hidden rounded-2xl border ${isPrimary ? "border-navy" : "border-border"} bg-muted/20`}>
                  <div className="aspect-video bg-background">
                    <img src={preview} alt="Login background preview" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <Button type="button" size="sm" variant={isPrimary ? "default" : "outline"} onClick={() => updateForm("loginBackgroundPath", background)}>
                      {isPrimary ? "Primary" : "Set Primary"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setForm((current) => ({
                        ...current,
                        loginBackgroundPath: current.loginBackgroundPath === background ? "" : current.loginBackgroundPath,
                        loginBackgrounds: current.loginBackgrounds.filter((item) => item !== background),
                      }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {activeCategory === "theme" && (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <Palette className="h-5 w-5 text-navy" />
          <h3 className="font-display text-xl font-bold text-navy-dark">Theme Customization</h3>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {COLOR_FIELDS.map((item) => (
            <Field key={item.key} label={item.label}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={String(form[item.key])}
                  onChange={(event) => updateForm(item.key, event.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-md border border-border bg-background p-1"
                />
                <Input value={String(form[item.key])} onChange={(event) => updateForm(item.key, event.target.value)} />
              </div>
            </Field>
          ))}
          <Field label="System Appearance">
            <select
              value={form.themeMode}
              onChange={(event) => updateForm("themeMode", event.target.value as BrandingForm["themeMode"])}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="light">Light Theme</option>
              <option value="dark">Dark Theme</option>
              <option value="auto">Auto Theme</option>
              <option value="custom">Custom Theme</option>
            </select>
          </Field>
        </div>
      </div>
      )}

      {activeCategory === "homepage" && (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <Building2 className="h-5 w-5 text-navy" />
          <h3 className="font-display text-xl font-bold text-navy-dark">Homepage Branding</h3>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="About Us Content">
            <textarea value={form.aboutContent} onChange={(event) => updateForm("aboutContent", event.target.value)} className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="School History">
            <textarea value={form.history} onChange={(event) => updateForm("history", event.target.value)} className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="Mission">
            <textarea value={form.mission} onChange={(event) => updateForm("mission", event.target.value)} className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="Vision">
            <textarea value={form.vision} onChange={(event) => updateForm("vision", event.target.value)} className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="Facebook Link">
            <Input value={form.facebookLink} onChange={(event) => updateForm("facebookLink", event.target.value)} />
          </Field>
          <Field label="Twitter Link">
            <Input value={form.twitterLink} onChange={(event) => updateForm("twitterLink", event.target.value)} />
          </Field>
          <Field label="Instagram Link">
            <Input value={form.instagramLink} onChange={(event) => updateForm("instagramLink", event.target.value)} />
          </Field>
        </div>
      </div>
      )}

      {message && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      )}
    </div>
  );
}

