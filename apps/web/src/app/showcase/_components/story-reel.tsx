"use client";

import { useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Play, Volume2, VolumeX } from "lucide-react";

import { Reveal } from "./reveal";

/**
 * "See it in action" story-reel section. A music-scored product reel framed in
 * a rounded, shadowed shadcn-aesthetic surface, centered in the Entry-1
 * container (max-w-5xl + responsive gutter), 16:9.
 *
 * Playback UX:
 *  - Default (motion allowed): muted autoplay + loop so it's alive on scroll,
 *    with a corner mute/unmute toggle so the viewer can hear the music bed.
 *  - Reduced motion (WCAG SC 2.3.3): NO autoplay. The poster paints first (never
 *    blocks LCP) with a centered play button the viewer clicks to start WITH
 *    sound. Only transform + opacity animate (via the reduced-motion-guarded
 *    Reveal wrapper); the video itself never auto-animates when motion is off.
 */
export function StoryReel() {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const videoRef = useRef<HTMLVideoElement>(null);

  // Muted by default so browser autoplay policies allow the loop to start.
  const [muted, setMuted] = useState(true);
  // Reduced-motion poster gate: true once the viewer has clicked to play.
  const [started, setStarted] = useState(false);

  // When motion is off, do not autoplay — show the poster + play button instead.
  const showPosterGate = shouldReduceMotion && !started;

  function toggleMute() {
    const video = videoRef.current;
    if (video === null) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
  }

  function handlePosterPlay() {
    const video = videoRef.current;
    if (video === null) return;
    // User-initiated playback → sound is allowed.
    video.muted = false;
    setMuted(false);
    setStarted(true);
    void video.play();
  }

  return (
    <section
      id="in-action"
      className="border-b border-border/60 bg-background py-20 lg:py-28"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--info))]">
            See it in action
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            See Marine Guardian in action
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From live alert to community — one 30-second look at a day on patrol.
          </p>
        </Reveal>

        <Reveal className="mt-12">
          <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/20 shadow-2xl shadow-black/50">
            <video
              ref={videoRef}
              className="aspect-video w-full bg-black"
              poster="/showcase/story/mg-story-reel-poster.jpg"
              autoPlay={!shouldReduceMotion}
              loop
              muted={muted}
              playsInline
              preload="metadata"
            >
              <source src="/showcase/story/mg-story-reel.webm" type="video/webm" />
              <source src="/showcase/story/mg-story-reel.mp4" type="video/mp4" />
            </video>

            {showPosterGate ? (
              // Reduced-motion play gate: poster + centered play button (sound on).
              <button
                type="button"
                onClick={handlePosterPlay}
                aria-label="Play the Marine Guardian story reel with sound"
                className="absolute inset-0 flex items-center justify-center bg-background/40 transition-colors hover:bg-background/25"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--info))] text-background shadow-lg shadow-black/40">
                  <Play className="h-7 w-7 translate-x-0.5 fill-current" />
                </span>
              </button>
            ) : (
              // Default state: corner mute/unmute toggle over the looping reel.
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? "Unmute the story reel" : "Mute the story reel"}
                aria-pressed={!muted}
                className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/70 text-[hsl(var(--info))] backdrop-blur transition-colors hover:bg-background/90"
              >
                {muted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
