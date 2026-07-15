import { cn } from "@/lib/utils";
import { Safari } from "@/components/ui/safari";

type BrowserFrameProps = {
  src: string;
  alt: string;
  url?: string;
  className?: string;
};

/**
 * Frames a real product screenshot inside the Magic UI Safari browser chrome.
 * Static frame only — no animated border (owner: dropped the shimmer beam).
 */
export function BrowserFrame({
  src,
  alt,
  url = "app.marine-guardian",
  className,
}: BrowserFrameProps) {
  return (
    <div className={cn("relative rounded-xl", className)}>
      <Safari imageSrc={src} url={url} className="w-full" />
      {/* Screen-reader label for the framed screenshot (Safari's own <img> is decorative). */}
      <span className="sr-only">{alt}</span>
    </div>
  );
}
