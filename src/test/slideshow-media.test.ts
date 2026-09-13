import { describe, expect, it } from "vitest";
import { getYouTubeVideoId, getSlideMediaType, toYouTubeEmbedUrl } from "@/lib/slideshowMedia";

const videoId = "dQw4w9WgXcQ";

describe("YouTube slideshow media", () => {
  it.each([
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://youtu.be/${videoId}?si=example`,
    `https://www.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/embed/${videoId}`,
    `youtube.com/watch?v=${videoId}`,
    `https://m.youtube.com/watch?v=${videoId}`,
  ])("extracts a valid video ID from %s", (url) => {
    expect(getYouTubeVideoId(url)).toBe(videoId);
    expect(getSlideMediaType(undefined, url)).toBe("youtube");
  });

  it.each([
    "https://www.youtube.com/watch?v=too-short",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://example.com/youtube.com/embed/dQw4w9WgXcQ",
    "not a URL",
    "",
  ])("rejects an invalid or non-YouTube URL: %s", (url) => {
    expect(getYouTubeVideoId(url)).toBeNull();
  });

  it("creates a muted autoplay embed URL", () => {
    const embed = new URL(toYouTubeEmbedUrl(`https://youtu.be/${videoId}`));

    expect(embed.origin).toBe("https://www.youtube.com");
    expect(embed.pathname).toBe(`/embed/${videoId}`);
    expect(embed.searchParams.get("autoplay")).toBe("1");
    expect(embed.searchParams.get("mute")).toBe("1");
    expect(embed.searchParams.get("enablejsapi")).toBe("1");
  });
});
