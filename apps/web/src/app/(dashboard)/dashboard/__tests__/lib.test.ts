import { describe, it, expect } from "vitest";
import { Footprints, MapPin, Sailboat } from "lucide-react";
import {
  priorityLevel,
  priorityLabel,
  priorityDotClass,
  patrolTypeMeta,
  relativeShort,
  elapsedHm,
  formatKm,
} from "../_components/lib";

describe("priorityLevel / priorityLabel", () => {
  it("maps numeric priority to levels at the 100/200/300 thresholds", () => {
    expect(priorityLevel(0)).toBe("low");
    expect(priorityLevel(99)).toBe("low");
    expect(priorityLevel(100)).toBe("medium");
    expect(priorityLevel(200)).toBe("high");
    expect(priorityLevel(300)).toBe("critical");
    expect(priorityLevel(500)).toBe("critical");
  });

  it("labels match levels (text always pairs with the dot color)", () => {
    expect(priorityLabel(300)).toBe("Critical");
    expect(priorityLabel(200)).toBe("High");
    expect(priorityLabel(100)).toBe("Medium");
    expect(priorityLabel(0)).toBe("Low");
  });
});

describe("priorityDotClass", () => {
  it("returns distinct semantic classes per level", () => {
    expect(priorityDotClass(300)).toBe("bg-destructive");
    expect(priorityDotClass(200)).toBe("bg-[hsl(var(--warning))]");
    expect(priorityDotClass(100)).toBe("bg-[hsl(var(--caution))]");
    expect(priorityDotClass(0)).toBe("bg-[hsl(var(--success))]");
  });
});

describe("patrolTypeMeta", () => {
  it("provides a lucide icon and an accessible label", () => {
    expect(patrolTypeMeta("seaborne")).toEqual({ icon: Sailboat, label: "Seaborne" });
    expect(patrolTypeMeta("foot")).toEqual({ icon: Footprints, label: "Foot" });
    expect(patrolTypeMeta("other")).toEqual({ icon: MapPin, label: "other" });
  });
});

describe("relativeShort", () => {
  const now = new Date("2026-06-21T12:00:00Z");
  it("formats seconds/minutes/hours/days", () => {
    expect(relativeShort(new Date("2026-06-21T11:59:30Z"), now)).toBe("30s");
    expect(relativeShort(new Date("2026-06-21T11:58:00Z"), now)).toBe("2m");
    expect(relativeShort(new Date("2026-06-21T09:00:00Z"), now)).toBe("3h");
    expect(relativeShort(new Date("2026-06-19T12:00:00Z"), now)).toBe("2d");
  });
  it("handles null/undefined safely", () => {
    expect(relativeShort(null, now)).toBe("—");
    expect(relativeShort(undefined, now)).toBe("—");
  });
});

describe("elapsedHm", () => {
  const now = new Date("2026-06-21T12:00:00Z");
  it("formats elapsed time as Hh MMm", () => {
    expect(elapsedHm(new Date("2026-06-21T07:37:00Z"), now)).toBe("4h23m");
    expect(elapsedHm(new Date("2026-06-21T11:05:00Z"), now)).toBe("0h55m");
  });
  it("returns dash for missing or future starts", () => {
    expect(elapsedHm(null, now)).toBe("—");
    expect(elapsedHm(new Date("2026-06-21T13:00:00Z"), now)).toBe("—");
  });
});

describe("formatKm", () => {
  it("formats to one decimal or dash", () => {
    expect(formatKm(87.34)).toBe("87.3");
    expect(formatKm(0)).toBe("0.0");
    expect(formatKm(null)).toBe("—");
    expect(formatKm(undefined)).toBe("—");
  });
});
