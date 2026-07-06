// Subject (ranger/animal) marker visibility for the "Hide idle on map"
// Command Center toggle (CC-1). Extracted as a pure predicate so the
// allowlist semantics are unit-testable without mounting InteractiveMap.
//
// `activeSubjectNames` is an ALLOWLIST of names the caller considers ACTIVE
// (Command Center Ranger Roster status "on_patrol" or "active" — i.e. NOT
// "idle"). When `hideIdleSubjects` is true, ONLY a subject whose name is in
// that set is kept; every other subject is hidden — including idle roster
// rangers AND non-roster EarthRanger subjects that have no KnownRanger entry
// at all (e.g. "Ranger Alpha", "Joseph Dytioco"). A prior denylist keyed on
// idle names alone never hid those non-roster subjects, since they were never
// present in any idle set (owner-reported bug, 2026-07-06).

export function isSubjectVisible(
  name: string,
  hideIdleSubjects: boolean | undefined,
  activeSubjectNames: Set<string> | undefined,
): boolean {
  if (hideIdleSubjects !== true) return true;
  return activeSubjectNames?.has(name) ?? false;
}
