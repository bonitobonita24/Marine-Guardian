/**
 * manual-boundary-guard.ts
 *
 * Shared guard used by hardcoded boundary loaders/seeders so they NEVER
 * silently overwrite a municipality boundary that was manually uploaded
 * (e.g. via the ER "Import Boundary" flow). A manual upload is authoritative
 * until the human/ER explicitly clears the flag or passes --force.
 */

export type BoundaryKind = "land" | "water";

export interface ManualBoundaryFlags {
  landBoundaryManual: boolean;
  waterBoundaryManual: boolean;
}

/**
 * Decide whether a hardcoded-loader write to `kind` should be skipped.
 *
 * - Skip when the corresponding manual flag is true.
 * - `force: true` always overrides the skip (used for an explicit --force CLI flag).
 */
export function shouldSkipManualBoundary(
  flags: ManualBoundaryFlags,
  kind: BoundaryKind,
  force = false,
): boolean {
  if (force) return false;
  return kind === "land" ? flags.landBoundaryManual : flags.waterBoundaryManual;
}
