import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, ListTree, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { uploadBrandingFile } from "@/lib/adminUploads";
import type { AboutContentItem, AboutContentType } from "@/lib/about";
import ServiceItemsManager from "./ServiceItemsManager";

const CONTENT_TYPES: Array<{ value: AboutContentType; label: string }> = [
  { value: "history", label: "History Timeline" },
  { value: "milestone", label: "Milestones" },
  { value: "leadership", label: "Leadership" },
  { value: "service", label: "Services" },
];

const STAFF_CATEGORIES = [
  "Executive Leadership",
  "Academic Leadership",
  "Department Heads",
  "Student Services",
  "Administrative Services",
  "Health Services",
  "Support Staff",
];

const EMPTY_ITEM: Omit<AboutContentItem, "id" | "type"> = {
  year: "",
  title: "",
  subtitle: "",
  description: "",
  organization: "",
  department: "",
  credentials: "",
  category: "",
  imageUrl: "",
  icon: "",
  displayOrder: 0,
  isActive: true,
};

const fieldLabel = (type: AboutContentType, field: "title" | "subtitle") => {
  if (field === "title") return type === "leadership" ? "Full Name" : type === "service" ? "Service Name" : "Title";
  if (type === "leadership") return "Position";
  return type === "history" ? "Short Heading" : "Subtitle";
};

export default function AboutContentManager() {
  const [contentType, setContentType] = useState<AboutContentType>("history");
  const [items, setItems] = useState<AboutContentItem[]>([]);
  const [draft, setDraft] = useState(EMPTY_ITEM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState<AboutContentItem | null>(null);
  const [itemToArchive, setItemToArchive] = useState<AboutContentItem | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/about/${contentType}`, { headers: getAuthHeaders() });
      setItems(await readApiResponse<AboutContentItem[]>(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load About Us content.");
    } finally {
      setLoading(false);
    }
  }, [contentType]);

  useEffect(() => {
    setEditingId(null);
    setDraft(EMPTY_ITEM);
    setSearch("");
    setSelectedService(null);
    void loadItems();
  }, [loadItems]);

  const updateDraft = <K extends keyof typeof EMPTY_ITEM>(key: K, value: (typeof EMPTY_ITEM)[K]) => {
    setMessage("");
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const editItem = (item: AboutContentItem) => {
    const { id, type, items: serviceItems, ...editable } = item;
    void id;
    void type;
    void serviceItems;
    setDraft(editable);
    setEditingId(item.id);
  };

  const resetDraft = () => {
    setDraft({ ...EMPTY_ITEM, displayOrder: items.length });
    setEditingId(null);
  };

  const saveItem = async () => {
    if (!draft.title.trim()) {
      setMessage(`${fieldLabel(contentType, "title")} is required.`);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/about/${contentType}${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PUT" : "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(draft),
      });
      await readApiResponse(response);
      resetDraft();
      await loadItems();
      setMessage(editingId ? "Entry updated." : "Entry added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the entry.");
    } finally {
      setSaving(false);
    }
  };

  const updateItem = async (item: AboutContentItem) => {
    const response = await fetch(`${API_URL}/admin/about/${contentType}/${item.id}`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(item),
    });
    await readApiResponse(response);
  };

  const toggleItem = async (item: AboutContentItem) => {
    try {
      await updateItem({ ...item, isActive: !item.isActive });
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update visibility.");
    }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const current = items[index];
    const target = items[targetIndex];
    try {
      await Promise.all([
        updateItem({ ...current, displayOrder: target.displayOrder }),
        updateItem({ ...target, displayOrder: current.displayOrder }),
      ]);
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reorder entries.");
    }
  };

  const archiveItem = async (item: AboutContentItem) => {
    setArchivingId(item.id);
    try {
      const response = await fetch(`${API_URL}/admin/about/${contentType}/${item.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      await readApiResponse(response);
      setItemToArchive(null);
      await loadItems();
      if (editingId === item.id) resetDraft();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive the entry.");
    } finally {
      setArchivingId(null);
    }
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      updateDraft("imageUrl", await uploadBrandingFile(file));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const showYear = contentType === "history" || contentType === "milestone";
  const showOrganization = contentType === "milestone";
  const showLeadership = contentType === "leadership";
  const showIcon = contentType === "service";
  const showImage = contentType !== "service";
  const normalizedSearch = search.trim().toLowerCase();
  const visibleItems = showLeadership && normalizedSearch
    ? items.filter((item) => [item.title, item.subtitle, item.department, item.credentials, item.category]
      .some((value) => value.toLowerCase().includes(normalizedSearch)))
    : items;

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-6">
      <div className="border-b border-border pb-4">
        <h3 className="font-display text-lg font-bold text-navy-dark">Institutional Content Managers</h3>
        <p className="mt-1 text-xs text-muted-foreground">Manage ordered public content without changing application code.</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {CONTENT_TYPES.map((type) => (
          <Button key={type.value} type="button" size="sm" className="text-xs" variant={contentType === type.value ? "default" : "outline"} onClick={() => setContentType(type.value)}>
            {type.label}
          </Button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">{editingId ? "Edit Entry" : "Add Entry"}</h4>
            {editingId && <Button type="button" variant="ghost" size="sm" onClick={resetDraft}><X className="mr-1 h-4 w-4" /> Cancel</Button>}
          </div>
          {showYear && <Field label="Year"><Input value={draft.year} onChange={(event) => updateDraft("year", event.target.value)} placeholder="2024" /></Field>}
          <Field label={fieldLabel(contentType, "title")}><Input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} /></Field>
          {(contentType === "history" || showLeadership) && <Field label={fieldLabel(contentType, "subtitle")}><Input value={draft.subtitle} onChange={(event) => updateDraft("subtitle", event.target.value)} /></Field>}
          {showLeadership && <Field label="Academic Credentials"><Input value={draft.credentials} onChange={(event) => updateDraft("credentials", event.target.value)} /></Field>}
          {showLeadership && <Field label="Department / Office"><Input value={draft.department} onChange={(event) => updateDraft("department", event.target.value)} /></Field>}
          {showLeadership && <Field label="Staff Category"><select value={draft.category} onChange={(event) => updateDraft("category", event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"><option value="">Uncategorized</option>{STAFF_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>}
          {contentType === "service" && <Field label="Responsible Office"><Input value={draft.department} onChange={(event) => updateDraft("department", event.target.value)} /></Field>}
          {showOrganization && <Field label="Awarding Organization"><Input value={draft.organization} onChange={(event) => updateDraft("organization", event.target.value)} /></Field>}
          {showIcon && <Field label="Icon Name (optional)"><Input value={draft.icon} onChange={(event) => updateDraft("icon", event.target.value)} placeholder="book-open" /></Field>}
          <Field label="Description"><textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" /></Field>
          {showImage && (
            <div className="space-y-2">
              <Label>Image (optional)</Label>
              {draft.imageUrl ? <img src={resolveAssetUrl(draft.imageUrl) || draft.imageUrl} alt="Entry preview" className="h-32 w-full rounded-xl border border-border object-cover" /> : <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground"><ImagePlus className="h-6 w-6" /></div>}
              <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
                {uploading ? "Loading" : "Upload Image"}
                <input type="file" accept="image/*" className="hidden" onChange={(event) => void uploadImage(event)} />
              </label>
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
            <Label htmlFor="about-entry-active">Visible publicly</Label>
            <Switch id="about-entry-active" checked={draft.isActive} onCheckedChange={(checked) => updateDraft("isActive", checked)} />
          </div>
          <Button type="button" className="w-full text-xs" onClick={() => void saveItem()} disabled={saving || uploading}>
            {editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {saving ? "Loading" : editingId ? "Save Changes" : "Add Entry"}
          </Button>
        </div>

        <div className="space-y-3">
          {showLeadership && <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff by name, role, office, or category" className="pl-9 text-xs" aria-label="Search leadership and staff" /></label>}
          {loading && <p className="rounded-2xl border border-border p-6 text-center text-xs text-muted-foreground">Loading</p>}
          {!loading && items.length === 0 && <p className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">No entries yet. Add the first one using the form.</p>}
          {!loading && items.length > 0 && visibleItems.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No staff match your search.</p>}
          {visibleItems.map((item) => {
            const index = items.findIndex((entry) => entry.id === item.id);
            return (
            <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-3 sm:flex-row sm:items-start sm:p-4">
              {item.imageUrl && <img src={resolveAssetUrl(item.imageUrl) || item.imageUrl} alt="" className="h-20 w-full rounded-xl object-cover sm:w-24" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {item.year && <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-semibold text-navy">{item.year}</span>}
                  <h5 className="text-sm font-semibold text-foreground">{item.title}</h5>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{item.isActive ? "Active" : "Hidden"}</span>
                </div>
                {(item.subtitle || item.credentials || item.department || item.organization || item.category) && <p className="mt-1 text-[11px] font-medium text-muted-foreground">{[item.category, item.subtitle, item.credentials, item.department, item.organization].filter(Boolean).join(" · ")}</p>}
                {item.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label="Move up" disabled={index === 0 || Boolean(normalizedSearch)} onClick={() => void moveItem(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Move down" disabled={index === items.length - 1 || Boolean(normalizedSearch)} onClick={() => void moveItem(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Edit entry" onClick={() => editItem(item)}><Pencil className="h-4 w-4" /></Button>
                {contentType === "service" && <Button type="button" size="sm" variant="outline" className="text-[11px]" onClick={() => setSelectedService(item)}><ListTree className="mr-1.5 h-3.5 w-3.5" />Details</Button>}
                <Button type="button" size="sm" variant="outline" className="text-[11px]" onClick={() => void toggleItem(item)}>{item.isActive ? "Hide" : "Show"}</Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Archive entry" onClick={() => setItemToArchive(item)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </article>
            );
          })}
          {selectedService && <ServiceItemsManager service={selectedService} onClose={() => setSelectedService(null)} />}
        </div>
      </div>
      {message && <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">{message}</p>}
      <ConfirmDialog
        open={Boolean(itemToArchive)}
        onOpenChange={(open) => !open && setItemToArchive(null)}
        onConfirm={() => itemToArchive && archiveItem(itemToArchive)}
        title="Archive this About Us entry?"
        description={`${itemToArchive?.title || "This entry"} will no longer appear on the public About Us page.`}
        confirmLabel="Archive entry"
        busy={Boolean(itemToArchive && archivingId === itemToArchive.id)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>{children}</div>;
}
