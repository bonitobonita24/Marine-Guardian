// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

const { stubs } = vi.hoisted(() => {
  const s: {
    getByIdData: unknown;
    updateMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    getByIdInvalidate: ReturnType<typeof vi.fn<(input: unknown) => Promise<void>>>;
  } = {
    getByIdData: null,
    updateMutate: vi.fn<(input: unknown) => void>(),
    listInvalidate: vi.fn<() => Promise<void>>(),
    getByIdInvalidate: vi.fn<(input: unknown) => Promise<void>>(),
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
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            stubs.updateMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      event: {
        list: { invalidate: stubs.listInvalidate },
        getById: { invalidate: stubs.getByIdInvalidate },
      },
    }),
  },
}));

// Replace the heavy AccompanyingRangersInput with a stub so this test does not
// transitively need user.list / add+remove mutation mocks.
vi.mock("../accompanying-rangers-input", () => ({
  AccompanyingRangersInput: () => null,
}));

import { EventDetailModal } from "../event-detail-modal";

const baseEvent = {
  id: "ev-1",
  title: "Illegal Fishing Report",
  priority: 2,
  serialNumber: "MG-001",
  notesJson: { text: "Initial sighting" },
  eventDetailsJson: { offenderName: "Unknown" },
  locationLat: 14.5995,
  locationLon: 120.9842,
  reportedAt: new Date("2026-05-01T08:00:00Z"),
  syncedAt: new Date("2026-05-01T08:05:00Z"),
  createdAt: new Date("2026-05-01T08:05:01Z"),
  updatedAt: new Date("2026-05-01T08:10:00Z"),
  accompanyingRangers: [],
};

describe("EventDetailModal", () => {
  beforeEach(() => {
    stubs.getByIdData = null;
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
    expect((getByLabelText("Priority (0–3)") as HTMLInputElement).value).toBe("2");
    expect((getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Initial sighting",
    );
    expect((getByLabelText("Offender name") as HTMLInputElement).value).toBe(
      "Unknown",
    );
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
      }),
    );
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
});
