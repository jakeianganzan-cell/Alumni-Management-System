const decodeHtmlUrl = (value: string) => value
  .replace(/&amp;/gi, "&")
  .replace(/&#38;/g, "&")
  .replace(/&quot;/gi, '"')
  .trim();

export const getMapEmbedUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const iframeSource = trimmed.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  let candidate = decodeHtmlUrl(iframeSource || trimmed);

  const markdownUrl = candidate.match(/^\[[^\]]*\]\((https?:\/\/[^\s]+)\)$/i)?.[1];
  if (markdownUrl) candidate = markdownUrl;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};
