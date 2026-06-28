import { describe, it, expect } from "vitest";
import {
  Ban,
  Binoculars,
  Bomb,
  Fish,
  HeartHandshake,
  MapPin,
  ShieldAlert,
  Turtle,
} from "lucide-react";
import { eventTypeIcon } from "../event-type-icon";

describe("eventTypeIcon", () => {
  it("maps specific law-enforcement types to their glyph", () => {
    expect(eventTypeIcon("Unregistered Illegal Fishing")).toBe(Fish);
    expect(eventTypeIcon("Destructive Practices")).toBe(Bomb);
  });

  it("maps specific monitoring types to their glyph", () => {
    expect(eventTypeIcon("Marine wildlife sightings")).toBe(Turtle);
    expect(eventTypeIcon("Community Support")).toBe(HeartHandshake);
  });

  it("is tolerant of parentheticals and casing", () => {
    expect(eventTypeIcon("FISHING IN A PROHIBITED AREA (MPA)")).toBe(Ban);
    expect(eventTypeIcon("fishing in a prohibited area")).toBe(Ban);
  });

  it("falls back to the category glyph for unmapped types", () => {
    expect(
      eventTypeIcon("Others", "law-enforcement-and-apprehensions"),
    ).toBe(ShieldAlert);
    expect(
      eventTypeIcon("Some New Survey", "monitoring_patrolling_and_surveillance"),
    ).toBe(Binoculars);
  });

  it("falls back to a global pin when type and category are unknown", () => {
    expect(eventTypeIcon(null, null)).toBe(MapPin);
    expect(eventTypeIcon("poacher_in_mpa", null)).toBe(MapPin);
    expect(eventTypeIcon(undefined)).toBe(MapPin);
  });
});
