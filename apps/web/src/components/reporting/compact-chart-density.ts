/**
 * Short-viewport density classes for the COMPACT variant of the reporting
 * charts (Interactive Report Map overlay panels).
 *
 * WHY A HEIGHT MEDIA QUERY, AND WHY 800px
 * ---------------------------------------
 * The Interactive Report Map's chart overlays live in the map's right-hand
 * floating column, which is capped at `max-h-[calc(100%-1.5rem)]` of the MAP
 * PANE — not of the window. Measured in a browser at 1280x600 the map pane is
 * only 286px tall, so the overlay column is 262px, while the two chart panels
 * were 201px and 185px (386px of content, scrollHeight 497px). Result: only one
 * chart was visible at a time and even THAT one had its legend clipped, and
 * "Region Coverage" sat entirely below the fold. The binding constraint is the
 * map pane's height, so nothing horizontal fixes it — the charts have to get
 * shorter.
 *
 * The map pane runs roughly `viewportHeight - 314px` (header band + summary
 * band + page chrome), so the column cap is roughly `viewportHeight - 338px`.
 * At a 600px viewport that is 262px (measured, matches); at an 800px viewport
 * it is ~462px, which is where the untrimmed stack (toggle card ~90px + gaps +
 * 201px + 185px) stops being wildly over. Tall viewports were verified working
 * and must stay pixel-identical, so the threshold is set at **max-height:799px**
 * — everything at 800px and above renders exactly as before.
 *
 * WHAT IT TRIMS (and what it deliberately does NOT)
 * ------------------------------------------------
 *  - Chart body 7.5rem -> 4.5rem (120px -> 72px).
 *  - Card padding py-3 -> py-1.5 and the header/content gap 2 -> 1.
 *  - The redundant range label in the card header is hidden: the exact same
 *    FROM/TO range is already shown in the map-controls filter card a few
 *    hundred pixels to the left, so it is chrome here, not information.
 *  - The legend row (which carries the Events/Patrols TOTALS) is KEPT — those
 *    numbers are data, not chrome, and losing them is what made the clipped
 *    panel useless in the first place.
 *  - Axis tick sizes are NOT reduced below the existing 9px; if a chart cannot
 *    stay legible at 4.5rem the correct answer is fewer rows, not smaller type.
 *
 * HONEST LIMIT: at 1280x600 this makes ONE open chart fully readable without
 * scrolling (toggle card ~90px + gap + ~131px panel = ~229px of the 262px
 * column). BOTH open still cannot fit — two panels would need to be ~78px each,
 * which is less than the card's own chrome. Per the owner decision, one fully
 * readable chart beats two clipped ones; opening the second still scrolls, but
 * each panel is individually complete once scrolled to.
 */

/** Chart body height for the compact variant, shrinking on short viewports. */
export const COMPACT_CHART_BODY_CLASS =
  "h-[7.5rem] [@media(max-height:799px)]:h-[4.5rem]";

/** Card shell padding/gap trim for the compact variant on short viewports. */
export const COMPACT_CARD_SHORT_CLASS =
  "[@media(max-height:799px)]:gap-1 [@media(max-height:799px)]:py-1.5";

/** Hides non-essential header chrome (the redundant range label) when short. */
export const COMPACT_HIDE_WHEN_SHORT_CLASS = "[@media(max-height:799px)]:hidden";

/** Legend row top margin trim when short. */
export const COMPACT_LEGEND_SHORT_CLASS = "[@media(max-height:799px)]:mt-0.5";
