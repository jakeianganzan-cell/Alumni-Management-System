import { ChangeEvent, useEffect, useState } from "react";
import { Film, ImagePlus, Save, Youtube } from "lucide-react";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import {
  getSlideMediaType,
  getYouTubeVideoId,
  isUploadedVideoMedia,
  toYouTubeEmbedUrl,
  type SlideMediaType,
} from "@/lib/slideshowMedia";
import {
  OPEN_HOMEPAGE_MEDIA_DIALOG_EVENT,
  notifyHomepageMediaUpdated,
  type HomepageMediaSlide,
} from "@/lib/homepageMediaEvents";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface HomepageMediaForm {
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

const emptyForm = (): HomepageMediaForm => ({
  title: "",
  caption: "",
  mediaType: "image",
  mediaUrl: "",
  youtubeUrl: "",
  linkUrl: "",
  displayOrder: 0,
  status: "active",
  isHighlighted: false,
});

function getUploadTitle(file: File) {
  return file.name.replace(/\.[^/.]+$/, "").trim() || "Homepage advertisement";
}

export default function HomepageMediaPostDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HomepageMediaForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const reset = () => {
    setForm(emptyForm());
    setEditingId(null);
    setMessage("");
  };

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const slide = (event as CustomEvent<{ slide?: HomepageMediaSlide }>).detail?.slide;
      if (slide) {
        const mediaUrl = slide.mediaUrl || slide.imageUrl || "";
        const mediaType = getSlideMediaType(slide.mediaType, mediaUrl);
        setEditingId(slide.id);
        setForm({
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
      } else {
        reset();
      }
      setOpen(true);
    };

    window.addEventListener(OPEN_HOMEPAGE_MEDIA_DIALOG_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_HOMEPAGE_MEDIA_DIALOG_EVENT, handleOpen);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !saving) {
      setOpen(false);
      reset();
      return;
    }

    setOpen(nextOpen);
  };

  const handleMediaUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const mediaUrl = reader.result;
      const mediaType: SlideMediaType = file.type.startsWith("video/") ? "video" : "image";
      setMessage("");
      setForm((current) => ({
        ...current,
        title: getUploadTitle(file),
        mediaType,
        mediaUrl,
        youtubeUrl: "",
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleYouTubeChange = (value: string) => {
    setMessage("");
    setForm((current) => ({
      ...current,
      mediaType: "youtube",
      youtubeUrl: value,
      mediaUrl: value ? toYouTubeEmbedUrl(value) || value : "",
    }));
  };

  const previewUrl = form.mediaType === "youtube"
    ? toYouTubeEmbedUrl(form.youtubeUrl)
    : resolveAssetUrl(form.mediaUrl) || form.mediaUrl;
  const isInvalidYouTubeUrl = Boolean(form.mediaType === "youtube" && form.youtubeUrl.trim() && !previewUrl);
  const canSave = form.mediaType === "youtube"
    ? Boolean(form.youtubeUrl.trim() && previewUrl)
    : Boolean(form.mediaUrl);

  const save = async () => {
    const selectedMediaUrl = form.mediaType === "youtube" ? form.youtubeUrl.trim() : form.mediaUrl;
    if (!selectedMediaUrl) {
      setMessage("Upload media or paste a YouTube link before posting.");
      return;
    }

    if (form.mediaType === "youtube" && !getYouTubeVideoId(selectedMediaUrl)) {
      setMessage("Enter a valid YouTube watch, Shorts, Live, embed, or youtu.be link.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
        editingId ? `${API_URL}/admin/slideshow/${editingId}` : `${API_URL}/admin/slideshow`,
        {
          method: editingId ? "PUT" : "POST",
          headers: getAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            ...form,
            title: form.title.trim() || "Homepage advertisement",
            mediaUrl: selectedMediaUrl,
            imageUrl: selectedMediaUrl,
            status: form.status || "active",
          }),
        },
      );
      await readApiResponse(response);
      notifyHomepageMediaUpdated();
      setOpen(false);
      reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save homepage media.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Posted Media" : "Post Media"}</DialogTitle>
          <DialogDescription>Upload an image or video, or add a YouTube link for the homepage slideshow.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Media Title</label>
              <Input
                className="mt-1.5"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Homepage advertisement"
              />
            </div>

            <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground transition hover:border-navy">
              <ImagePlus className="h-8 w-8 text-navy" />
              <span className="font-semibold text-navy-dark">Upload image or video</span>
              <span className="text-xs">Images and short videos stay inside the slideshow frame.</span>
              <input type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaUpload} />
            </label>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">YouTube Link</label>
              <div className="relative mt-1.5">
                <Youtube className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-600" />
                <Input
                  value={form.youtubeUrl}
                  onChange={(event) => handleYouTubeChange(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
                  className="pl-9"
                />
              </div>
              {isInvalidYouTubeUrl && <p className="mt-2 text-xs font-medium text-red-600">Enter a valid YouTube link.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-gray-950 p-3 text-white">
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              {previewUrl && form.mediaType === "youtube" ? (
                <iframe
                  src={previewUrl}
                  title="Homepage media preview"
                  className="h-full w-full"
                  loading="lazy"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : previewUrl && isUploadedVideoMedia(previewUrl) ? (
                <video src={previewUrl} className="h-full w-full object-contain" controls muted playsInline preload="metadata" />
              ) : previewUrl ? (
                <img src={previewUrl} alt="Homepage media preview" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-white/70">
                  <Film className="h-8 w-8" />
                  <span>Media preview</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {message && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !canSave}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : editingId ? "Save Changes" : "Post Media"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
