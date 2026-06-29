import { describe, it, expect } from "vitest";
import {
  EVENT_CATEGORY,
  eventCategoryColor,
  eventCategoryHeatHsl,
  eventPrioritySizePx,
  eventPriorityLabel,
  eventTypeValueKey,
  isEventVisible,
  type EventFilterState,
  type FilterableEvent,
} from "../eventMarkerStyle";

describe("eventCategoryColor", () => {
  it("returns chart-1 for law enforcement (matches legend swatch)", () => {
    expect(eventCategoryColor(EVENT_CATEGORY.lawEnforcement)).toBe(
      "hsl(var(--chart-1))",
    );
  });
  it("returns chart-2 for monitoring (matches legend swatch)", () => {
    expect(eventCategoryColor(EVENT_CATEGORY.monitoring)).toBe(
      "hsl(var(--chart-2))",
    );
  });
  it("falls back to muted-foreground for unknown/null category", () => {
    expect(eventCategoryColor(null)).toBe("hsl(var(--muted-foreground))");
    expect(eventCategoryColor(undefined)).toBe("hsl(var(--muted-foreground))");
    expect(eventCategoryColor("analyzer_event")).toBe(
      "hsl(var(--muted-foreground))",
    );
  });
});

describe("eventPrioritySizePx", () => {
  it("scales by priority tier", () => {
    expect(eventPrioritySizePx(0)).toBe(7);
    expect(eventPrioritySizePx(100)).toBe(9);
    expect(eventPrioritySizePx(200)).toBe(11);
    expect(eventPrioritySizePx(300)).toBe(13);
  });
  it("treats out-of-band high values as critical", () => {
    expect(eventPrioritySizePx(500)).toBe(13);
  });
});

describe("eventPriorityLabel", () => {
  it("maps each tier", () => {
    expect(eventPriorityLabel(0)).toBe("Low");
    expect(eventPriorityLabel(100)).toBe("Medium");
    expect(eventPriorityLabel(200)).toBe("High");
    expect(eventPriorityLabel(300)).toBe("Critical");
  });
});

describe("eventCategoryHeatHsl", () => {
  it("returns the --chart-1 triple for law enforcement (matches the dot markers)", () => {
    expect(eventCategoryHeatHsl(EVENT_CATEGORY.lawEnforcement)).toEqual({
      h: 220,
      s: 70,
      l: 50,
    });
  });
  it("returns the --chart-2 triple for monitoring", () => {
    expect(eventCategoryHeatHsl(EVENT_CATEGORY.monitoring)).toEqual({
      h: 160,
      s: 60,
      l: 45,
    });
  });
  it("falls back to a muted triple for unknown/null category", () => {
    expect(eventCategoryHeatHsl(null)).toEqual({ h: 220, s: 10, l: 50 });
    expect(eventCategoryHeatHsl("observation")).toEqual({ h: 220, s: 10, l: 50 });
  });
});

describe("eventTypeValueKey", () => {
  it("namespaces a value under its event-type id", () => {
    expect(eventTypeValueKey("t-1", "Spear Fishing")).toBe("t-1::Spear Fishing");
  });
  it("buckets a missing value under (Unspecified)", () => {
    expect(eventTypeValueKey("t-1", null)).toBe("t-1::(Unspecified)");
    expect(eventTypeValueKey("t-1", undefined)).toBe("t-1::(Unspecified)");
  });
  it("prevents collisions of identical value labels across types", () => {
    expect(eventTypeValueKey("t-mpa", "Others")).not.toBe(
      eventTypeValueKey("t-gears", "Others"),
    );
  });
});

describe("isEventVisible (L1 category → L2 type → L3 value)", () => {
  const ALL_ON: EventFilterState = {
    eventLayers: { lawEnforcement: true, monitoring: true },
    disabledTypeIds: new Set<string>(),
    disabledTypeValues: new Set<string>(),
  };
  const lawEvent = (
    overrides: Partial<FilterableEvent> = {},
  ): FilterableEvent => ({
    eventType: { id: "t-mpa", category: EVENT_CATEGORY.lawEnforcement },
    eventTypeValue: "Spear Fishing",
    ...overrides,
  });

  it("shows an event when all three tiers are enabled", () => {
    expect(isEventVisible(lawEvent(), ALL_ON)).toBe(true);
  });

  it("L1: hides the event when its category layer is OFF", () => {
    expect(
      isEventVisible(lawEvent(), {
        ...ALL_ON,
        eventLayers: { lawEnforcement: false, monitoring: true },
      }),
    ).toBe(false);
  });

  it("L2: hides the event when its type id is disabled", () => {
    expect(
      isEventVisible(lawEvent(), {
        ...ALL_ON,
        disabledTypeIds: new Set(["t-mpa"]),
      }),
    ).toBe(false);
  });

  it("L3: hides the event when its `${typeId}::${value}` key is disabled", () => {
    expect(
      isEventVisible(lawEvent(), {
        ...ALL_ON,
        disabledTypeValues: new Set(["t-mpa::Spear Fishing"]),
      }),
    ).toBe(false);
    // A different value under the same type stays visible.
    expect(
      isEventVisible(lawEvent({ eventTypeValue: "Active Gears" }), {
        ...ALL_ON,
        disabledTypeValues: new Set(["t-mpa::Spear Fishing"]),
      }),
    ).toBe(true);
  });

  it("L3: respects the (Unspecified) bucket for events with no Type value", () => {
    const unspecified = lawEvent({ eventTypeValue: "(Unspecified)" });
    expect(isEventVisible(unspecified, ALL_ON)).toBe(true);
    expect(
      isEventVisible(unspecified, {
        ...ALL_ON,
        disabledTypeValues: new Set(["t-mpa::(Unspecified)"]),
      }),
    ).toBe(false);
    // A null eventTypeValue is treated as the (Unspecified) bucket.
    expect(
      isEventVisible(lawEvent({ eventTypeValue: null }), {
        ...ALL_ON,
        disabledTypeValues: new Set(["t-mpa::(Unspecified)"]),
      }),
    ).toBe(false);
  });

  it("hides events that are neither law-enforcement nor monitoring", () => {
    expect(
      isEventVisible(
        { eventType: { id: "t-x", category: "analyzer_event" }, eventTypeValue: "x" },
        ALL_ON,
      ),
    ).toBe(false);
  });
});
