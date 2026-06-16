// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

type Suggestion = {
  id: string | null;
  name: string;
  source: "known_ranger" | "recent_freetext" | "er_subject";
  erSubjectId?: string | null;
};

const { stubs } = vi.hoisted(() => ({
  stubs: {
    addMutate: vi.fn<(input: unknown) => void>(),
    removeMutate: vi.fn<(input: unknown) => void>(),
    promoteMutate: vi.fn<(input: unknown) => void>(),
    suggestions: [] as Suggestion[],
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    event: {
      suggestAccompanyingRangers: {
        useQuery: () => ({
          data: { suggestions: stubs.suggestions },
          isLoading: false,
        }),
      },
      addAccompanyingRanger: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            stubs.addMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      removeAccompanyingRanger: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            stubs.removeMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      promoteToKnownRanger: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            stubs.promoteMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

import { AccompanyingRangersInput } from "../accompanying-rangers-input";

describe("AccompanyingRangersInput", () => {
  beforeEach(() => {
    stubs.addMutate.mockReset();
    stubs.removeMutate.mockReset();
    stubs.promoteMutate.mockReset();
    stubs.suggestions = [];
  });

  afterEach(() => {
    cleanup();
  });

  // ── chip rendering ──────────────────────────────────────────────────────────

  it("renders 'No accompanying rangers' when list is empty", () => {
    const { getByTestId } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    expect(getByTestId("ranger-chips").textContent).toContain("No accompanying rangers");
  });

  it("renders a chip for each attached ranger", () => {
    const { getByTestId } = render(
      <AccompanyingRangersInput
        eventId="ev-1"
        rangers={[
          {
            id: "ar-1",
            rangerType: "freetext",
            registeredUserId: null,
            freetextName: null,
            knownRangerId: "kr-1",
            knownRanger: { id: "kr-1", name: "Alice Cruz", source: "manual_entry" },
          },
          {
            id: "ar-2",
            rangerType: "freetext",
            registeredUserId: null,
            freetextName: "Bayan Volunteer",
          },
        ]}
        onChange={() => {}}
      />,
    );
    expect(getByTestId("ranger-chip-ar-1").textContent).toContain("Alice Cruz");
    expect(getByTestId("ranger-chip-ar-2").textContent).toContain("Bayan Volunteer");
  });

  it("calls removeAccompanyingRanger mutation when chip X is clicked", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <AccompanyingRangersInput
        eventId="ev-1"
        rangers={[
          {
            id: "ar-1",
            rangerType: "freetext",
            registeredUserId: null,
            freetextName: "Test Ranger",
          },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(getByLabelText("Remove Test Ranger"));
    expect(stubs.removeMutate).toHaveBeenCalledWith({ id: "ar-1" });
    expect(onChange).toHaveBeenCalled();
  });

  // ── combobox: ad-hoc entry ──────────────────────────────────────────────────

  it("shows dropdown when input is focused", () => {
    const { getByTestId } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    fireEvent.focus(getByTestId("ranger-combobox-input"));
    expect(getByTestId("ranger-suggestions")).toBeDefined();
  });

  it("commits typed ad-hoc name via add-adhoc button when no suggestions match", () => {
    stubs.suggestions = [];
    const { getByTestId } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    fireEvent.focus(getByTestId("ranger-combobox-input"));
    fireEvent.change(getByTestId("ranger-combobox-input"), {
      target: { value: "Community Volunteer" },
    });
    fireEvent.click(getByTestId("ranger-add-adhoc"));
    expect(stubs.addMutate).toHaveBeenCalledWith({
      eventId: "ev-1",
      freetextName: "Community Volunteer",
    });
  });

  it("commits typed ad-hoc name via Enter key when no exact match", () => {
    stubs.suggestions = [];
    const { getByTestId } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    fireEvent.focus(getByTestId("ranger-combobox-input"));
    fireEvent.change(getByTestId("ranger-combobox-input"), {
      target: { value: "Typed Name" },
    });
    fireEvent.keyDown(getByTestId("ranger-combobox-input"), { key: "Enter" });
    expect(stubs.addMutate).toHaveBeenCalledWith({
      eventId: "ev-1",
      freetextName: "Typed Name",
    });
  });

  // ── combobox: selecting a known ranger ─────────────────────────────────────

  it("shows grouped suggestions and selecting a known_ranger passes knownRangerId", () => {
    stubs.suggestions = [
      { id: "kr-1", name: "Maria Santos", source: "known_ranger", erSubjectId: null },
    ];
    const { getByTestId } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    fireEvent.focus(getByTestId("ranger-combobox-input"));
    fireEvent.click(getByTestId("ranger-suggestion-known_ranger-kr-1"));
    expect(stubs.addMutate).toHaveBeenCalledWith({
      eventId: "ev-1",
      freetextName: "Maria Santos",
      knownRangerId: "kr-1",
    });
  });

  it("selecting a recent_freetext suggestion uses freetext path (no knownRangerId)", () => {
    stubs.suggestions = [
      { id: null, name: "Pedro Santos", source: "recent_freetext", erSubjectId: null },
    ];
    const { getByTestId } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    fireEvent.focus(getByTestId("ranger-combobox-input"));
    fireEvent.click(getByTestId("ranger-suggestion-recent_freetext-Pedro Santos"));
    expect(stubs.addMutate).toHaveBeenCalledWith({
      eventId: "ev-1",
      freetextName: "Pedro Santos",
    });
    // Must NOT include knownRangerId
    expect((stubs.addMutate.mock.calls[0] as [Record<string, unknown>])[0]).not.toHaveProperty("knownRangerId");
  });

  it("selecting an er_subject suggestion uses freetext path", () => {
    stubs.suggestions = [
      { id: null, name: "Juan dela Cruz", source: "er_subject", erSubjectId: "er-1" },
    ];
    const { getByTestId } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    fireEvent.focus(getByTestId("ranger-combobox-input"));
    fireEvent.click(getByTestId("ranger-suggestion-er_subject-Juan dela Cruz"));
    expect(stubs.addMutate).toHaveBeenCalledWith({
      eventId: "ev-1",
      freetextName: "Juan dela Cruz",
    });
  });

  // ── promote-to-known affordance ─────────────────────────────────────────────

  it("shows promote section for freetext rangers without knownRangerId", () => {
    const { getByTestId } = render(
      <AccompanyingRangersInput
        eventId="ev-1"
        rangers={[
          {
            id: "ar-3",
            rangerType: "freetext",
            registeredUserId: null,
            freetextName: "Volunteer",
            knownRangerId: null,
          },
        ]}
        onChange={() => {}}
      />,
    );
    expect(getByTestId("promote-section")).toBeDefined();
    expect(getByTestId("promote-btn-ar-3")).toBeDefined();
  });

  it("does NOT show promote section when all rangers already have knownRangerId", () => {
    const { queryByTestId } = render(
      <AccompanyingRangersInput
        eventId="ev-1"
        rangers={[
          {
            id: "ar-4",
            rangerType: "freetext",
            registeredUserId: null,
            freetextName: "Alice",
            knownRangerId: "kr-1",
          },
        ]}
        onChange={() => {}}
      />,
    );
    expect(queryByTestId("promote-section")).toBeNull();
  });

  it("calls promoteToKnownRanger with the ranger name when Promote is clicked", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <AccompanyingRangersInput
        eventId="ev-1"
        rangers={[
          {
            id: "ar-5",
            rangerType: "freetext",
            registeredUserId: null,
            freetextName: "Jose Ramos",
            knownRangerId: null,
          },
        ]}
        onChange={onChange}
      />,
    );
    act(() => { fireEvent.click(getByTestId("promote-btn-ar-5")); });
    expect(stubs.promoteMutate).toHaveBeenCalledWith({ name: "Jose Ramos" });
    expect(onChange).toHaveBeenCalled();
  });
});
