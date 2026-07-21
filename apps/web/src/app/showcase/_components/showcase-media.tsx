"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { BrowserFrame } from "./browser-frame";
import {
  ImageLightbox,
  LightboxThumb,
  type LightboxImage,
} from "./image-lightbox";

interface ShowcaseMediaProps {
  images: LightboxImage[];
  /** "safari" wraps the primary in the browser chrome; "diagram" uses a plain
   *  bordered card (for architecture diagrams / non-screenshot art). */
  frame?: "safari" | "diagram";
  /** Address-bar text for the safari frame. */
  url?: string;
  className?: string;
}

/**
 * Showcase image surface. Renders a primary image (browser frame or diagram
 * card) that is click-to-enlarge, and — when more than one image is supplied —
 * a thumbnail strip beneath it. All images open in a shared full-screen
 * ImageLightbox with prev/next controls.
 */
export function ShowcaseMedia({
  images,
  frame = "safari",
  url,
  className,
}: ShowcaseMediaProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;
  const primary = images[0];
  if (!primary) return null;
  const hasGallery = images.length > 1;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <button
        type="button"
        aria-label={`Enlarge: ${primary.alt}`}
        onClick={() => {
          setLightboxIndex(0);
        }}
        className="group relative block w-full cursor-zoom-in rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--info))]"
      >
        {frame === "safari" ? (
          <BrowserFrame
            src={primary.src}
            alt={primary.alt}
            url={url ?? ""}
            className="shadow-xl shadow-black/40"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card p-3 shadow-xl shadow-black/40">
            <img
              src={primary.src}
              alt={primary.alt}
              className="block w-full rounded-md object-contain"
            />
          </div>
        )}
        {/* hover affordance */}
        <span className="pointer-events-none absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
          <Maximize2 className="h-4 w-4" />
        </span>
      </button>

      {hasGallery && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <LightboxThumb
              key={img.src}
              image={img}
              active={i === 0}
              onClick={() => {
                setLightboxIndex(i);
              }}
            />
          ))}
        </div>
      )}

      <ImageLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => {
          setLightboxIndex(null);
        }}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
