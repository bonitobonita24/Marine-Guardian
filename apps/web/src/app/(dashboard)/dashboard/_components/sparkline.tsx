/**
 * WAR ROOM micro-sparkline — a dependency-free inline SVG trend line for the
 * KPI tiles (Command Center redesign, sub-batch C). Renders a single polyline
 * normalized to its own min/max so the shape reads as direction-of-travel, not
 * absolute scale. Tactical accent color via CSS variable (default cyan =
 * --info). Decorative: aria-hidden (the numeric KPI value carries the meaning).
 */
export function Sparkline({
  data,
  colorVar = "--info",
  className,
}: {
  data: number[];
  /** CSS custom property for the stroke color, e.g. "--info" / "--success". */
  colorVar?: string | undefined;
  className?: string | undefined;
}) {
  // Need at least two points to draw a line.
  if (data.length < 2) return null;

  const w = 64;
  const h = 18;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <polyline
        points={points}
        fill="none"
        stroke={`hsl(var(${colorVar}))`}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
    </svg>
  );
}
