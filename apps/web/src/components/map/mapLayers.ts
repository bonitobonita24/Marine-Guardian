/**
 * Named stacking layers for everything painted ON TOP of the MapLibre canvas
 * inside `InteractiveMap`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The doodle drawing surface (`DoodleOverlay`) is a FULL-BLEED sibling —
 * `absolute inset-0` — so it covers every pixel of the map, including the
 * floating controls. Before this module the canvas, the zoom cluster and the
 * doodle toggle all sat at `z-10`. Equal z-index means hit-testing falls back
 * to paint order, and the canvas is painted LAST, so it won the hit test
 * everywhere: in doodle mode `document.elementFromPoint()` over "Zoom in",
 * "Zoom out" and "Exit doodle mode" returned the CANVAS, and real clicks never
 * reached those buttons.
 *
 * The obstruction is full-bleed, so it cannot be dodged by MOVING a control —
 * the only correct fix is an explicit, ordered stack. These constants are that
 * stack. Use them instead of ad-hoc `z-*` literals on map overlays.
 *
 * THE INVARIANT (pinned by `__tests__/map-doodle-layering.test.ts`):
 *
 *     doodleCanvas  <  panel  <  control
 *
 * `control` must stay strictly ABOVE `doodleCanvas` or the defect returns.
 * The canvas keeps `pointer-events: auto` across its whole area while doodle
 * mode is on — drawing still works everywhere except the small footprints of
 * the controls stacked above it, which is the intended behaviour.
 */
export const MAP_LAYER = {
  /**
   * Passive, map-anchored overlays and the doodle drawing canvas. Lowest of
   * the three — nothing here needs to beat a control for a click.
   */
  doodleCanvas: "z-10",
  /**
   * Floating panels/columns that sit on the map (MAP CONTROLS column, the
   * top-right column, the doodle toolbar). Above the canvas so their controls
   * stay usable while drawing.
   */
  panel: "z-20",
  /**
   * Interactive control clusters that must remain clickable at ALL times,
   * including while doodle mode is active: the zoom/compass cluster and the
   * doodle on/off toggle. Topmost layer.
   */
  control: "z-30",
} as const;
