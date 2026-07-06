import { describe, it, expect } from "vitest";
import {
  eventPrimaryLabel,
  eventTypeLabel,
  isSkylightOrAnalyzerEvent,
} from "../event-label";

describe("event-label", () => {
  describe("isSkylightOrAnalyzerEvent", () => {
    it("is true when display contains 'skylight' (case-insensitive)", () => {
      expect(
        isSkylightOrAnalyzerEvent({ display: "Skylight Entry Alert", category: null }),
      ).toBe(true);
      expect(
        isSkylightOrAnalyzerEvent({ display: "SKYLIGHT alert", category: null }),
      ).toBe(true);
    });

    it("is true when category is analyzer_event, regardless of display", () => {
      expect(
        isSkylightOrAnalyzerEvent({ display: "Marine Entry", category: "analyzer_event" }),
      ).toBe(true);
    });

    it("is false for a normal law-enforcement/monitoring event", () => {
      expect(
        isSkylightOrAnalyzerEvent({
          display: "Compressor Fishing",
          category: "law-enforcement-and-apprehensions",
        }),
      ).toBe(false);
    });

    it("is false when eventType is null/undefined", () => {
      expect(isSkylightOrAnalyzerEvent(null)).toBe(false);
      expect(isSkylightOrAnalyzerEvent()).toBe(false);
    });
  });

  describe("eventPrimaryLabel", () => {
    it("leads with the resolved type label for a Skylight/analyzer event, ignoring the raw ER title", () => {
      expect(
        eventPrimaryLabel({
          title: "Marine Entry",
          eventType: { display: "Skylight Entry Alert", category: "analyzer_event" },
        }),
      ).toBe("Skylight Entry Alert");
    });

    it("leads with the type label for an analyzer_event even without 'skylight' in the display", () => {
      expect(
        eventPrimaryLabel({
          title: "Marine Entry",
          eventType: { display: "entry_alert_rep", category: "analyzer_event" },
        }),
      ).toBe("Entry Alert Rep");
    });

    it("returns a normal event's own title when present", () => {
      expect(
        eventPrimaryLabel({
          title: "Suspicious vessel near MPA",
          eventType: {
            display: "Compressor Fishing",
            category: "law-enforcement-and-apprehensions",
          },
        }),
      ).toBe("Suspicious vessel near MPA");
    });

    it("falls back to the type label for a titleless normal event", () => {
      expect(
        eventPrimaryLabel({
          title: null,
          eventType: {
            display: "Compressor Fishing",
            category: "law-enforcement-and-apprehensions",
          },
        }),
      ).toBe("Compressor Fishing");
    });

    it("falls back to 'Untitled' when there is neither a title nor a type label", () => {
      expect(eventPrimaryLabel({ title: null, eventType: null })).toBe("Untitled");
      expect(eventPrimaryLabel({})).toBe("Untitled");
    });
  });

  describe("eventTypeLabel", () => {
    it("humanizes a raw snake_case ER code", () => {
      expect(eventTypeLabel("poacher_in_mpa")).toBe("Poacher In Mpa");
    });

    it("passes through an already-friendly display string", () => {
      expect(eventTypeLabel("Skylight Entry Alert")).toBe("Skylight Entry Alert");
    });

    it("returns null for empty/nullish display", () => {
      expect(eventTypeLabel(null)).toBeNull();
      expect(eventTypeLabel(undefined)).toBeNull();
      expect(eventTypeLabel("")).toBeNull();
    });
  });
});
