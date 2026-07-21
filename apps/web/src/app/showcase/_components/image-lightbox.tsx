"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type LightboxImage = { src: string; alt: string };

interface ImageLightboxProps {
  images: LightboxImage[];
  /** Index of the image to show; the lightbox is open when this is non-null. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

/**
 * Dependency-free full-screen image lightbox for the marketing showcase.
 * Renders into a portal on document.body; shows one image at a time with
 * object-contain (so any aspect ratio displays whole), plus prev/next controls,
 * a counter and keyboard support (←/→/Esc) when there is more than one image.
 * Not tied to the Plate editor (unlike media-preview-dialog.tsx), so it works
 * for the static screenshots/diagrams in the timeline.
 */
export function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const open = index !== null;
  const count = images.length;
  const hasMultiple = count > 1;

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    // lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, go, onClose]);

  if (!mounted || index === null) return null;
  const current = images[index];
  if (!current) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.alt}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {hasMultiple && (
        <button
          type="button"
          aria-label="Previous image"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-6"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <img
        src={current.src}
        alt={current.alt}
        onClick={(e) => {
          e.stopPropagation();
        }}
        className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />

      {hasMultiple && (
        <button
          type="button"
          aria-label="Next image"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-6"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center gap-1 px-6 text-center">
        {current.alt && (
          <p className="max-w-2xl text-sm text-white/80">{current.alt}</p>
        )}
        {hasMultiple && (
          <p className="text-xs font-medium text-white/60">
            {index + 1} / {count}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Small helper: the thumbnail-strip button used by ShowcaseMedia. */
export function LightboxThumb({
  image,
  active,
  onClick,
}: {
  image: LightboxImage;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${image.alt}`}
      className={cn(
        "relative aspect-video w-20 flex-none overflow-hidden rounded-md border transition sm:w-24",
        active
          ? "border-[hsl(var(--info))] ring-1 ring-[hsl(var(--info))]"
          : "border-border opacity-70 hover:opacity-100",
      )}
    >
      <img
        src={image.src}
        alt=""
        className="h-full w-full object-cover object-top"
      />
    </button>
  );
}
