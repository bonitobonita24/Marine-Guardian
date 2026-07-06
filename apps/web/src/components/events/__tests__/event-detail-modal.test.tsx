// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

const { stubs } = vi.hoisted(() => {
  const s: {
    getByIdData: unknown;
    updateMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    getByIdInvalidate: ReturnType<typeof vi.fn<(input: unknown) => Promise<void>>>;
    // BUG-2b: expose onError so tests can simulate mutation errors
    capturedOnError: ((err: { message: string }) => void) | undefined;
  } = {
    getByIdData: null,
    updateMutate: vi.fn<(input: unknown) => void>(),
    listInvalidate: vi.fn<() => Promise<void>>(),
    getByIdInvalidate: vi.fn<(input: unknown) => Promise<void>>(),
    capturedOnError: undefined,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    event: {
      getById: {
        useQuery: () => ({
          data: stubs.getByIdData,
          isLoading: false,
        }),
      },
      update: {
        useMutation: (opts?: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => {
          // Store onError so individual tests can fire it (BUG-2b regression)
          stubs.capturedOnError = opts?.onError;
          return {
            mutate: (input: unknown) => {
              stubs.updateMutate(input);
              opts?.onSuccess?.();
            },
            isPending: false,
          };
        },
      },
      getRevisions: {
        useQuery: () => ({
          data: undefined,
          isLoading: false,
        }),
      },
    },
    useUtils: () => ({
      event: {
        list: { invalidate: stubs.listInvalidate },
        getById: { invalidate: stubs.getByIdInvalidate },
        getRevisions: { invalidate: vi.fn() },
      },
    }),
  },
}));

// Replace the heavy AccompanyingRangersInput with a stub so this test does not
// transitively need user.list / add+remove mutation mocks.
vi.mock("../accompanying-rangers-input", () => ({
  AccompanyingRangersInput: () => null,
}));

// SingleEventMap renders a real maplibre-gl map, which needs a WebGL canvas
// jsdom doesn't provide. Stub it so this suite only asserts that the modal
// wires it up (coords in → rendered), not the maplibre internals — those are
// covered by SingleEventMap's own render test.
vi.mock("@/components/map/SingleEventMap", () => ({
  SingleEventMap: ({ lat, lon }: { lat: number; lon: number }) => (
    <div data-testid="single-event-map-stub">{`${String(lat)},${String(lon)}`}</div>
  ),
}));

import { EventDetailModal } from "../event-detail-modal";

const baseEvent = {
  id: "ev-1",
  title: "Illegal Fishing Report",
  priority: 2,
  serialNumber: "MG-001",
  notesJson: { text: "Initial sighting" },
  offenderName: "Unknown",
  vesselName: null,
  vesselRegistration: null,
  address: null,
  actionTaken: null,
  locationLat: 14.5995,
  locationLon: 120.9842,
  reportedAt: new Date("2026-05-01T08:00:00Z"),
  syncedAt: new Date("2026-05-01T08:05:00Z"),
  createdAt: new Date("2026-05-01T08:05:01Z"),
  updatedAt: new Date("2026-05-01T08:10:00Z"),
  accompanyingRangers: [],
  assets: [],
};

describe("EventDetailModal", () => {
  beforeEach(() => {
    stubs.getByIdData = null;
    stubs.capturedOnError = undefined;
    stubs.updateMutate.mockReset();
    stubs.listInvalidate.mockReset().mockResolvedValue(undefined);
    stubs.getByIdInvalidate.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing visible when eventId is null", () => {
    const { queryByText } = render(
      <EventDetailModal eventId={null} onClose={() => {}} />,
    );
    expect(queryByText(/Event Detail/i)).toBeNull();
  });

  it("renders the event title and serial number when open", () => {
    stubs.getByIdData = baseEvent;
    const { getByText } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect(getByText("Illegal Fishing Report")).toBeTruthy();
    expect(getByText("#MG-001")).toBeTruthy();
  });

  it("populates editable fields from the loaded event", () => {
    stubs.getByIdData = baseEvent;
    const { getByLabelText } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect((getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Illegal Fishing Report",
    );
    expect((getByLabelText("Priority") as HTMLInputElement).value).toBe("2");
    expect((getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Initial sighting",
    );
    expect((getByLabelText("Offender name") as HTMLInputElement).value).toBe(
      "Unknown",
    );
  });

  it("renders a Photos section with image thumbnails when archived assets exist", () => {
    stubs.getByIdData = {
      ...baseEvent,
      assets: [
        { id: "asset-1", filename: "catch.jpg", mimeType: "image/jpeg", sizeBytes: 1234 },
        // Archiver gap: mimeType null but a .jpg filename — must still render
        // as an image via the filename-extension fallback.
        { id: "asset-3", filename: "community_support-01.jpg", mimeType: null, sizeBytes: 4321 },
        { id: "asset-2", filename: "manifest.pdf", mimeType: "application/pdf", sizeBytes: 5678 },
      ],
    };
    const { getByText, getByAltText, queryByText } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect(getByText("Photos (3)")).toBeTruthy();
    // Image asset renders an <img> proxied through the asset route.
    const img = getByAltText("catch.jpg") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/assets/asset-1");
    // Null-mimeType .jpg still renders as an image (extension fallback).
    const fallbackImg = getByAltText("community_support-01.jpg") as HTMLImageElement;
    expect(fallbackImg.getAttribute("src")).toBe("/api/assets/asset-3");
    // Non-image asset renders its filename as a fallback tile (no <img>).
    expect(queryByText("manifest.pdf")).toBeTruthy();
  });

  it("omits the Photos section when the event has no archived assets", () => {
    stubs.getByIdData = baseEvent; // assets: []
    const { queryByText } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect(queryByText(/^Photos \(/)).toBeNull();
  });

  it("calls update mutation with edited fields when Save is clicked", () => {
    stubs.getByIdData = baseEvent;
    const onClose = vi.fn();
    const { getByLabelText, getByText } = render(
      <EventDetailModal eventId="ev-1" onClose={onClose} />,
    );
    fireEvent.change(getByLabelText("Title"), {
      target: { value: "Updated Title" },
    });
    fireEvent.click(getByText("Save"));

    expect(stubs.updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ev-1",
        title: "Updated Title",
        priority: 2,
        notesJson: { text: "Initial sighting" },
        offenderName: "Unknown",
        vesselName: "",
        vesselRegistration: "",
        address: "",
        actionTaken: "",
      }),
    );
    const call = stubs.updateMutate.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(call).not.toHaveProperty("eventDetailsJson");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", () => {
    stubs.getByIdData = baseEvent;
    const onClose = vi.fn();
    const { getByText } = render(
      <EventDetailModal eventId="ev-1" onClose={onClose} />,
    );
    fireEvent.click(getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders location coordinates when available", () => {
    stubs.getByIdData = baseEvent;
    const { getByText } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect(getByText(/14.59950/)).toBeTruthy();
    expect(getByText(/120.98420/)).toBeTruthy();
  });

  it("renders the single-event map when coordinates are available", () => {
    stubs.getByIdData = baseEvent;
    const { getByTestId } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect(getByTestId("single-event-map-stub").textContent).toBe(
      "14.5995,120.9842",
    );
  });

  it("omits the map when the event has no coordinates", () => {
    stubs.getByIdData = { ...baseEvent, locationLat: null, locationLon: null };
    const { queryByTestId } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect(queryByTestId("single-event-map-stub")).toBeNull();
  });

  it("populates all 5 operator-fill fields from event columns", () => {
    stubs.getByIdData = {
      ...baseEvent,
      offenderName: "Juan Dela Cruz",
      vesselName: "MV Sampaguita",
      vesselRegistration: "PH-12345",
      address: "Brgy. Uno, Palawan",
      actionTaken: "Vessel impounded",
    };
    const { getByLabelText } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect((getByLabelText("Offender name") as HTMLInputElement).value).toBe("Juan Dela Cruz");
    expect((getByLabelText("Vessel name") as HTMLInputElement).value).toBe("MV Sampaguita");
    expect((getByLabelText("Vessel registration") as HTMLInputElement).value).toBe("PH-12345");
    expect((getByLabelText("Address") as HTMLInputElement).value).toBe("Brgy. Uno, Palawan");
    expect((getByLabelText("Action taken") as HTMLTextAreaElement).value).toBe("Vessel impounded");
  });

  it("persists operator-fill field edits via top-level columns, not eventDetailsJson", () => {
    stubs.getByIdData = baseEvent;
    const { getByLabelText, getByText } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    fireEvent.change(getByLabelText("Vessel registration"), {
      target: { value: "ABC-123" },
    });
    fireEvent.click(getByText("Save"));

    expect(stubs.updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ vesselRegistration: "ABC-123" }),
    );
    const call = stubs.updateMutate.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(call).toBeDefined();
    expect(call).not.toHaveProperty("eventDetailsJson");
  });

  // BUG-2b regression: mutation errors must surface to the user, not fail silently.
  it("surfaces a save error when the mutation fails (BUG-2b regression)", () => {
    stubs.getByIdData = baseEvent;
    const { queryByTestId } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );

    // No error yet
    expect(queryByTestId("event-save-error")).toBeNull();

    // Simulate the server returning an error by firing the captured onError.
    // Wrap in act() so React flushes the setState(saveError) re-render.
    act(() => {
      stubs.capturedOnError?.({ message: "priority: Number must be less than or equal to 3" });
    });

    const errorEl = queryByTestId("event-save-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toMatch(/priority/i);
  });

  // BUG-2b: ER-synced events load with high priority — the form must accept it.
  it("loads an ER-synced event with priority 200 without clamping it", () => {
    stubs.getByIdData = { ...baseEvent, priority: 200 };
    const { getByLabelText } = render(
      <EventDetailModal eventId="ev-1" onClose={() => {}} />,
    );
    expect((getByLabelText("Priority") as HTMLInputElement).value).toBe("200");
  });
});
