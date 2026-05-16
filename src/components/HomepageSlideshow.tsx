import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import salayBackground from "@/assets/salay-background.png";
import { resolveAssetUrl } from "@/lib/api";
import {
  getSlideMediaType,
  getYouTubeVideoId,
  toYouTubeEmbedUrl,
  type SlideMediaType,
} from "@/lib/slideshowMedia";
import { Loader2, Play, Volume2, VolumeX } from "lucide-react";

type YouTubePlayer = {
  destroy: () => void;
  mute: () => void;
  unMute?: () => void;
  setVolume?: (volume: number) => void;
  playVideo: () => void;
  pauseVideo?: () => void;
  getDuration?: () => number;
  getCurrentTime?: () => number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          height?: string | number;
          width?: string | number;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => YouTubePlayer;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface HomepageSlide {
  id: number | string;
  title: string;
  caption?: string | null;
  mediaType?: SlideMediaType | string | null;
  mediaUrl?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  isHighlighted?: boolean;
}

interface HomepageSlideshowProps {
  slides: HomepageSlide[];
  intervalMs?: number;
  className?: string;
}

interface PreparedSlide extends HomepageSlide {
  resolvedUrl: string;
  mediaKind: SlideMediaType;
}

const fallbackSlide: HomepageSlide = {
  id: "homepage-fallback",
  title: "Salay Community College Alumni",
  caption: "Featured announcements, events, achievements, and alumni updates will appear here.",
  imageUrl: null,
};

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    const existingScript = document.querySelector<HTMLScriptElement>("script[src='https://www.youtube.com/iframe_api']");
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

function prepareSlide(slide: HomepageSlide): PreparedSlide {
  const rawUrl = slide.mediaUrl || slide.imageUrl || "";
  const resolvedUrl = rawUrl ? resolveAssetUrl(rawUrl) || rawUrl : salayBackground;
  const mediaKind = getSlideMediaType(slide.mediaType, resolvedUrl);

  return {
    ...slide,
    resolvedUrl: mediaKind === "youtube" ? toYouTubeEmbedUrl(resolvedUrl) || resolvedUrl : resolvedUrl,
    mediaKind,
  };
}

function formatDuration(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return "";

  const roundedSeconds = Math.floor(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function BackgroundMedia({ slide, priority, active }: { slide: PreparedSlide; priority: boolean; active: boolean }) {
  if (slide.mediaKind === "video") {
    return (
      <video
        src={slide.resolvedUrl}
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
        autoPlay={active}
        muted
        loop
        playsInline
        preload={active ? "auto" : "metadata"}
        aria-hidden="true"
      />
    );
  }

  if (slide.mediaKind === "youtube") {
    return (
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(135deg,rgba(120,18,36,0.72),rgba(17,24,39,0.95))]" />
    );
  }

  return (
    <img
      src={slide.resolvedUrl}
      alt=""
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
      aria-hidden="true"
    />
  );
}

function YouTubeSlide({
  slide,
  active,
  muted,
  onPlayingChange,
  onDurationChange,
  onProgressChange,
  onEnded,
}: {
  slide: PreparedSlide;
  active: boolean;
  muted: boolean;
  onPlayingChange: (playing: boolean) => void;
  onDurationChange: (slideId: string | number, seconds: number) => void;
  onProgressChange: (slideId: string | number, seconds: number) => void;
  onEnded: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const videoId = useMemo(() => getYouTubeVideoId(slide.resolvedUrl), [slide.resolvedUrl]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    try {
      if (!active) {
        player.pauseVideo?.();
        return;
      }

      if (muted) {
        player.mute();
        return;
      }

      player.unMute?.();
      player.setVolume?.(100);
    } catch {
      return;
    }
  }, [active, muted]);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    if (!videoId) {
      setLoading(false);
      onPlayingChange(false);
      return;
    }

    let destroyed = false;
    let progressInterval: number | null = null;
    setHasStarted(false);
    setLoading(true);
    const playerElement = document.createElement("div");
    containerRef.current.replaceChildren(playerElement);

    loadYouTubeApi().then(() => {
      if (destroyed || !window.YT?.Player) return;

      playerRef.current = new window.YT.Player(playerElement, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          mute: muted ? 1 : 0,
          playsinline: 1,
          rel: 0,
          enablejsapi: 1,
          controls: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 0,
          ...(typeof window !== "undefined" ? { origin: window.location.origin } : {}),
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            setLoading(false);
            const duration = event.target.getDuration?.();
            if (Number.isFinite(duration) && duration && duration > 0) {
              onDurationChange(slide.id, duration);
            }
            progressInterval = window.setInterval(() => {
              const currentTime = event.target.getCurrentTime?.();
              const latestDuration = event.target.getDuration?.();
              if (Number.isFinite(currentTime) && currentTime !== undefined) {
                onProgressChange(slide.id, currentTime);
              }
              if (Number.isFinite(latestDuration) && latestDuration && latestDuration > 0) {
                onDurationChange(slide.id, latestDuration);
              }
            }, 500);
            if (muted) {
              event.target.mute();
            } else {
              event.target.unMute?.();
              event.target.setVolume?.(100);
            }
            onPlayingChange(false);
          },
          onStateChange: (event) => {
            if (event.data === window.YT?.PlayerState?.ENDED || event.data === 0) {
              setHasStarted(false);
              onPlayingChange(false);
              onEnded();
            } else if (event.data === window.YT?.PlayerState?.PLAYING || event.data === 1) {
              setLoading(false);
              setHasStarted(true);
              onPlayingChange(true);
            } else if (event.data === window.YT?.PlayerState?.PAUSED || event.data === 2) {
              onPlayingChange(false);
            } else if (event.data === window.YT?.PlayerState?.BUFFERING || event.data === 3) {
              setLoading(true);
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
      setHasStarted(false);
      onPlayingChange(false);
      if (progressInterval !== null) window.clearInterval(progressInterval);
      try {
        playerRef.current?.destroy();
      } catch {
        // The YouTube iframe may already be detached by the player itself.
      }
      playerRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, [active, onDurationChange, onEnded, onPlayingChange, onProgressChange, slide.id, slide.resolvedUrl, videoId]);

  if (!videoId) {
    return (
      <div className="relative z-10 flex h-full w-full items-center justify-center bg-black px-6 text-center text-sm font-medium text-white/75">
        This YouTube link cannot be played.
      </div>
    );
  }

  const startPlayback = () => {
    const player = playerRef.current;
    if (!player) return;

    try {
      player.playVideo();
      setHasStarted(true);
      onPlayingChange(true);
    } catch {
      onPlayingChange(false);
    }
  };

  return (
    <div className="relative z-10 h-full w-full bg-black">
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 text-white">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" title={slide.title} />
      {!hasStarted && !loading && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            startPlayback();
          }}
          className="absolute left-1/2 top-1/2 z-30 inline-flex h-16 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-red-600 text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
          aria-label="Play YouTube video"
          title="Play YouTube video"
        >
          <Play className="h-8 w-8 fill-current" />
        </button>
      )}
    </div>
  );
}

function UploadedVideoSlide({
  slide,
  active,
  muted,
  onPlayingChange,
  onDurationChange,
  onProgressChange,
  onEnded,
}: {
  slide: PreparedSlide;
  active: boolean;
  muted: boolean;
  onPlayingChange: (playing: boolean) => void;
  onDurationChange: (slideId: string | number, seconds: number) => void;
  onProgressChange: (slideId: string | number, seconds: number) => void;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted || !active;
  }, [active, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!active) {
      video.pause();
      return;
    }

    video.load();
    video.play().catch(() => {
      onPlayingChange(false);
    });
  }, [active, onPlayingChange, slide.resolvedUrl]);

  return (
    <video
      ref={videoRef}
      src={slide.resolvedUrl}
      className="relative z-10 h-full w-full object-contain"
      autoPlay={active}
      muted={muted || !active}
      playsInline
      preload="auto"
      onLoadedMetadata={(event) => {
        const duration = event.currentTarget.duration;
        if (Number.isFinite(duration) && duration > 0) {
          onDurationChange(slide.id, duration);
        }
      }}
      onTimeUpdate={(event) => {
        onProgressChange(slide.id, event.currentTarget.currentTime);
      }}
      onCanPlay={(event) => {
        if (!active) return;
        event.currentTarget.play().catch(() => onPlayingChange(false));
      }}
      onPlay={() => active && onPlayingChange(true)}
      onPause={() => active && onPlayingChange(false)}
      onEnded={() => {
        onPlayingChange(false);
        onEnded();
      }}
    />
  );
}

export default function HomepageSlideshow({ slides, intervalMs = 6000, className = "" }: HomepageSlideshowProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});
  const [videoProgress, setVideoProgress] = useState<Record<string, number>>({});

  const visibleSlides = useMemo(() => (slides.length > 0 ? slides : [fallbackSlide]).map(prepareSlide), [slides]);
  const hasMultipleSlides = visibleSlides.length > 1;
  const currentSlide = visibleSlides[activeSlide] || visibleSlides[0];
  const currentIsVideo = currentSlide?.mediaKind === "video" || currentSlide?.mediaKind === "youtube";
  const currentVideoDurationSeconds = currentSlide ? videoDurations[String(currentSlide.id)] || 0 : 0;
  const currentVideoProgressSeconds = currentSlide ? videoProgress[String(currentSlide.id)] || 0 : 0;
  const currentVideoRemaining = currentVideoDurationSeconds
    ? formatDuration(Math.max(0, currentVideoDurationSeconds - currentVideoProgressSeconds))
    : "";
  const currentVideoProgress =
    currentVideoDurationSeconds
      ? Math.min(100, Math.max(0, (currentVideoProgressSeconds / currentVideoDurationSeconds) * 100))
      : 0;

  const handleDurationChange = useCallback((slideId: string | number, seconds: number) => {
    setVideoDurations((current) => {
      const key = String(slideId);
      if (current[key] === seconds) return current;
      return { ...current, [key]: seconds };
    });
  }, []);

  const handleProgressChange = useCallback((slideId: string | number, seconds: number) => {
    setVideoProgress((current) => {
      const key = String(slideId);
      const nextValue = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
      if (Math.abs((current[key] || 0) - nextValue) < 0.25) return current;
      return { ...current, [key]: nextValue };
    });
  }, []);

  useEffect(() => {
    setActiveSlide((current) => (current >= visibleSlides.length ? 0 : current));
  }, [visibleSlides.length]);

  useEffect(() => {
    setVideoPlaying(false);
    if (currentSlide) {
      handleProgressChange(currentSlide.id, 0);
    }
  }, [activeSlide, currentSlide, handleProgressChange]);

  useEffect(() => {
    if (!hasMultipleSlides || isHovered || videoPlaying || currentSlide?.mediaKind === "youtube") return;

    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % visibleSlides.length);
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [currentSlide?.mediaKind, hasMultipleSlides, intervalMs, isHovered, videoPlaying, visibleSlides.length]);

  const goToPrevious = useCallback(() => {
    if (!hasMultipleSlides) return;
    setActiveSlide((current) => (current - 1 + visibleSlides.length) % visibleSlides.length);
  }, [hasMultipleSlides, visibleSlides.length]);

  const goToNext = useCallback(() => {
    if (!hasMultipleSlides) return;
    setActiveSlide((current) => (current + 1) % visibleSlides.length);
  }, [hasMultipleSlides, visibleSlides.length]);

  const openSlideLink = (linkUrl?: string | null) => {
    if (!linkUrl) return;
    window.location.href = linkUrl;
  };

  return (
    <section
      className={`group relative w-full overflow-hidden rounded-2xl bg-gray-950 shadow-[0_24px_70px_rgba(15,23,42,0.18)] ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <div className="relative min-h-[340px] overflow-hidden rounded-2xl bg-gray-950 sm:min-h-[430px] lg:min-h-[540px]">
        {visibleSlides.map((slide, index) => {
          const isActive = index === activeSlide;
          const isLinkedImage = Boolean(slide.linkUrl) && slide.mediaKind !== "youtube";

          return (
            <article
              key={slide.id}
              className={`absolute inset-0 transform-gpu transition-all duration-700 ease-out ${
                isActive ? "z-10 translate-x-0 opacity-100" : "z-0 translate-x-3 opacity-0"
              } ${isLinkedImage ? "cursor-pointer" : ""}`}
              aria-hidden={!isActive}
              onClick={() => isLinkedImage && openSlideLink(slide.linkUrl)}
            >
              <BackgroundMedia slide={slide} priority={index === 0} active={isActive} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/28 to-black/52" />
              <div className="absolute inset-x-0 bottom-0 z-20 h-1/2 bg-gradient-to-t from-black/78 via-black/20 to-transparent" />

              {slide.mediaKind === "youtube" && isActive ? (
                <YouTubeSlide
                  slide={slide}
                  active={isActive}
                  muted={videoMuted}
                  onPlayingChange={setVideoPlaying}
                  onDurationChange={handleDurationChange}
                  onProgressChange={handleProgressChange}
                  onEnded={goToNext}
                />
              ) : slide.mediaKind === "video" ? (
                <UploadedVideoSlide
                  slide={slide}
                  active={isActive}
                  muted={videoMuted}
                  onPlayingChange={setVideoPlaying}
                  onDurationChange={handleDurationChange}
                  onProgressChange={handleProgressChange}
                  onEnded={goToNext}
                />
              ) : (
                <img
                  src={slide.resolvedUrl}
                  alt={slide.title}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className="relative z-10 h-full w-full object-contain"
                />
              )}

              {(slide.title || slide.caption) && (
                <div
                  className={`pointer-events-none absolute inset-x-4 z-30 max-w-xs text-white sm:inset-x-8 sm:max-w-sm lg:inset-x-10 ${
                    slide.mediaKind === "video" || slide.mediaKind === "youtube" ? "bottom-20 sm:bottom-20" : "bottom-14 sm:bottom-7"
                  }`}
                >
                  {slide.title && (
                    <h2 className="line-clamp-1 font-display text-base font-semibold leading-tight sm:text-lg lg:text-xl">
                      {slide.title}
                    </h2>
                  )}
                  {slide.caption && (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/78 sm:text-sm">
                      {slide.caption}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {hasMultipleSlides && (
          <>
            <button
              type="button"
              onClick={goToPrevious}
              className="absolute inset-y-0 left-0 z-30 w-1/5 cursor-pointer bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
              aria-label="Previous slide"
            />
            <button
              type="button"
              onClick={goToNext}
              className="absolute inset-y-0 right-0 z-30 w-1/5 cursor-pointer bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
              aria-label="Next slide"
            />
          </>
        )}

        {currentIsVideo && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setVideoMuted((current) => !current);
            }}
            className="absolute bottom-4 left-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:bottom-5 sm:left-5"
            aria-label={videoMuted ? "Turn video sound on" : "Mute video sound"}
            title={videoMuted ? "Turn sound on" : "Mute sound"}
          >
            {videoMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        )}

        <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-white/12 bg-black/45 px-2.5 py-2 backdrop-blur sm:bottom-5 sm:right-5">
          {visibleSlides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setActiveSlide(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === activeSlide ? "w-8 bg-white" : "w-2 bg-white/55 hover:bg-white/80"
              }`}
              aria-label={`Show slide ${index + 1}`}
              aria-current={index === activeSlide}
            />
          ))}
        </div>

        {currentIsVideo && currentVideoRemaining && (
          <div className="absolute inset-x-0 bottom-0 z-40 h-1 bg-white/18" aria-hidden="true">
            <div
              className="h-full bg-white transition-[width] duration-300 ease-linear"
              style={{ width: `${currentVideoProgress}%` }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
