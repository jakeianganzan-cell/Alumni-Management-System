import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import type { AboutContentItem, InstitutionServiceItem } from "@/lib/about";

const EMPTY_ITEM = {
  title: "",
  description: "",
  displayOrder: 0,
  isActive: true,
};

export default function ServiceItemsManager({ service, onClose }: { service: AboutContentItem; onClose: () => void }) {
  const [items, setItems] = useState<InstitutionServiceItem[]>([]);
  const [draft, setDraft] = useState(EMPTY_ITEM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [itemToArchive, setItemToArchive] = useState<InstitutionServiceItem | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/about/services/${service.id}/items`, { headers: getAuthHeaders() });
      setItems(await readApiResponse<InstitutionServiceItem[]>(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load service details.");
    } finally {
      setLoading(false);
    }
  }, [service.id]);

  useEffect(() => {
    setDraft(EMPTY_ITEM);
    setEditingId(null);
    void loadItems();
  }, [loadItems]);

  const resetDraft = () => {
    setDraft({ ...EMPTY_ITEM, displayOrder: items.length });
    setEditingId(null);
  };

  const saveItem = async () => {
    if (!draft.title.trim()) {
      setMessage("Service detail title is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/admin/about/services/${service.id}/items${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PUT" : "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(draft),
      });
      await readApiResponse(response);
      resetDraft();
      await loadItems();
      setMessage(editingId ? "Service detail updated." : "Service detail added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save service detail.");
    } finally {
      setSaving(false);
    }
  };

  const updateItem = async (item: InstitutionServiceItem) => {
    const response = await fetch(`${API_URL}/admin/about/services/${service.id}/items/${item.id}`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(item),
    });
    await readApiResponse(response);
  };

  const toggleItem = async (item: InstitutionServiceItem) => {
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
    try {
      await Promise.all([
        updateItem({ ...items[index], displayOrder: items[targetIndex].displayOrder }),
        updateItem({ ...items[targetIndex], displayOrder: items[index].displayOrder }),
      ]);
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reorder service details.");
    }
  };

  const archiveItem = async (item: InstitutionServiceItem) => {
    setArchivingId(item.id);
    try {
      const response = await fetch(`${API_URL}/admin/about/services/${service.id}/items/${item.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      await readApiResponse(response);
      setItemToArchive(null);
      await loadItems();
      if (editingId === item.id) resetDraft();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive service detail.");
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4" aria-labelledby="service-items-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Frontline Service Details</p>
          <h4 id="service-items-heading" className="mt-1 text-sm font-bold text-foreground">{service.title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">Add the individual services shown inside this public service card.</p>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label="Close service details" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
          <Field label="Detail title"><Input className="text-xs" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></Field>
          <Field label="Description"><textarea className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
          <div className="flex min-h-10 items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="service-detail-active" className="text-xs">Visible publicly</Label>
            <Switch id="service-detail-active" checked={draft.isActive} onCheckedChange={(isActive) => setDraft((current) => ({ ...current, isActive }))} />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1 text-xs" disabled={saving} onClick={() => void saveItem()}>{editingId ? <Save className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}{saving ? "Loading" : editingId ? "Save" : "Add Detail"}</Button>
            {editingId && <Button type="button" size="sm" variant="outline" className="text-xs" onClick={resetDraft}>Cancel</Button>}
          </div>
        </div>

        <div className="space-y-2">
          {loading && <p className="rounded-xl border border-border bg-background p-4 text-center text-xs text-muted-foreground">Loading</p>}
          {!loading && items.length === 0 && <p className="rounded-xl border border-dashed border-border bg-background p-5 text-center text-xs text-muted-foreground">No service details yet.</p>}
          {items.map((item, index) => (
            <article key={item.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h5 className="text-xs font-semibold text-foreground">{item.title}</h5><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{item.isActive ? "Active" : "Hidden"}</span></div>
                  {item.description && <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{item.description}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="icon" variant="ghost" aria-label="Move detail up" disabled={index === 0} onClick={() => void moveItem(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Move detail down" disabled={index === items.length - 1} onClick={() => void moveItem(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Edit service detail" onClick={() => { setDraft({ title: item.title, description: item.description, displayOrder: item.displayOrder, isActive: item.isActive }); setEditingId(item.id); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="sm" variant="outline" className="text-[11px]" onClick={() => void toggleItem(item)}>{item.isActive ? "Hide" : "Show"}</Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Archive service detail" onClick={() => setItemToArchive(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      {message && <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">{message}</p>}
      <ConfirmDialog
        open={Boolean(itemToArchive)}
        onOpenChange={(open) => !open && setItemToArchive(null)}
        onConfirm={() => itemToArchive && archiveItem(itemToArchive)}
        title="Archive this service detail?"
        description={`${itemToArchive?.title || "This detail"} will be removed from the public service section.`}
        confirmLabel="Archive detail"
        busy={Boolean(itemToArchive && archivingId === itemToArchive.id)}
      />
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>{children}</div>;
}
