export type SlideMediaType = "image" | "video" | "youtube";

export function isUploadedVideoMedia(value: string | null | undefined) {
  if (!value) return false;
  return /^data:video\//i.test(value) || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(value.trim());
}

export function isYouTubeMedia(value: string | null | undefined) {
  return Boolean(getYouTubeVideoId(value));
}

export function getYouTubeVideoId(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  const directMatch = trimmed.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  if (directMatch) return directMatch[1];

  try {
    const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(normalizedUrl);
    const host = url.hostname.replace(/^www\./i, "").replace(/^m\./i, "").replace(/^music\./i, "").toLowerCase();
    const pathParts = url.pathname.split("/").filter(Boolean);
    const candidate =
      host === "youtu.be"
        ? pathParts[0]
        : host === "youtube.com" || host === "youtube-nocookie.com"
          ? url.searchParams.get("v") || (["embed", "shorts", "live", "v"].includes(pathParts[0]) ? pathParts[1] : null)
          : null;

    return candidate && /^[A-Za-z0-9_-]{6,}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function toYouTubeEmbedUrl(value: string | null | undefined) {
  const videoId = getYouTubeVideoId(value);
  if (!videoId) return "";

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    rel: "0",
    enablejsapi: "1",
  });

  if (origin) params.set("origin", origin);

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function getSlideMediaType(mediaType: string | null | undefined, mediaUrl: string | null | undefined): SlideMediaType {
  const normalized = String(mediaType || "").trim().toLowerCase();
  if (normalized === "youtube") return "youtube";
  if (normalized === "video") return "video";
  if (isYouTubeMedia(mediaUrl)) return "youtube";
  if (isUploadedVideoMedia(mediaUrl)) return "video";
  return "image";
}
