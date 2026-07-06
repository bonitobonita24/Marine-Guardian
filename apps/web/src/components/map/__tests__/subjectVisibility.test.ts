import { describe, it, expect } from "vitest";
import { isSubjectVisible } from "../subjectVisibility";

describe("isSubjectVisible (CC-1 hide-idle-on-map allowlist)", () => {
  const activeNames = new Set(["Alpha Ranger", "Bravo Ranger"]);

  it("shows every subject when hideIdleSubjects is false", () => {
    expect(isSubjectVisible("Alpha Ranger", false, activeNames)).toBe(true);
    expect(isSubjectVisible("Charlie Ranger", false, activeNames)).toBe(true); // idle roster ranger
    expect(isSubjectVisible("Joseph Dytioco", false, activeNames)).toBe(true); // non-roster ER subject
  });

  it("shows every subject when hideIdleSubjects is undefined", () => {
    expect(isSubjectVisible("Joseph Dytioco", undefined, activeNames)).toBe(true);
  });

  it("keeps a subject whose name IS in the active allowlist when hiding idle", () => {
    expect(isSubjectVisible("Alpha Ranger", true, activeNames)).toBe(true);
    expect(isSubjectVisible("Bravo Ranger", true, activeNames)).toBe(true);
  });

  it("hides an idle roster ranger (not in the active allowlist) when hiding idle", () => {
    expect(isSubjectVisible("Charlie Ranger", true, activeNames)).toBe(false);
  });

  it("hides a non-roster ER subject with no KnownRanger entry when hiding idle (the reported bug)", () => {
    // Previously: an idle-name DENYLIST never contained these names, so they
    // stayed visible even with "Hide idle on map" on. The allowlist fixes it.
    expect(isSubjectVisible("Ranger Alpha", true, activeNames)).toBe(false);
    expect(isSubjectVisible("Joseph Dytioco", true, activeNames)).toBe(false);
    expect(isSubjectVisible("Emily Quinones", true, activeNames)).toBe(false);
  });

  it("hides everything when hiding idle and no active-names set is supplied", () => {
    expect(isSubjectVisible("Alpha Ranger", true, undefined)).toBe(false);
  });
});
