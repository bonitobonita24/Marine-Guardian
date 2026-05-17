// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

const { stubs } = vi.hoisted(() => ({
  stubs: {
    addMutate: vi.fn<(input: unknown) => void>(),
    removeMutate: vi.fn<(input: unknown) => void>(),
    userSearchData: [] as Array<{ id: string; fullName: string; email: string }>,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    user: {
      list: {
        useQuery: () => ({
          data: { items: stubs.userSearchData, nextCursor: undefined },
        }),
      },
    },
    event: {
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
    },
  },
}));

import { AccompanyingRangersInput } from "../accompanying-rangers-input";

describe("AccompanyingRangersInput", () => {
  beforeEach(() => {
    stubs.addMutate.mockReset();
    stubs.removeMutate.mockReset();
    stubs.userSearchData = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("renders 'No accompanying rangers' when list is empty", () => {
    const { getByTestId } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    expect(getByTestId("ranger-chips").textContent).toContain("No accompanying rangers");
  });

  it("renders a chip for each attached ranger with the display name", () => {
    const { getByTestId } = render(
      <AccompanyingRangersInput
        eventId="ev-1"
        rangers={[
          {
            id: "ar-1",
            rangerType: "registered",
            registeredUserId: "u-1",
            freetextName: null,
            registeredUser: { id: "u-1", fullName: "Alice Cruz" },
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

  it("calls addAccompanyingRanger with freetextName when Add button is clicked", () => {
    const { getByLabelText, getByText } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    fireEvent.change(getByLabelText("Or add a free-text name"), {
      target: { value: "Community Volunteer" },
    });
    fireEvent.click(getByText("Add"));
    expect(stubs.addMutate).toHaveBeenCalledWith({
      eventId: "ev-1",
      freetextName: "Community Volunteer",
    });
  });

  it("calls addAccompanyingRanger with registeredUserId when search result is clicked", () => {
    stubs.userSearchData = [
      { id: "u-2", fullName: "Bob Reyes", email: "bob@example.com" },
    ];
    const { getByLabelText, getByText } = render(
      <AccompanyingRangersInput eventId="ev-1" rangers={[]} onChange={() => {}} />,
    );
    fireEvent.change(getByLabelText("Search registered users"), {
      target: { value: "Bo" },
    });
    fireEvent.click(getByText(/Bob Reyes/));
    expect(stubs.addMutate).toHaveBeenCalledWith({
      eventId: "ev-1",
      registeredUserId: "u-2",
    });
  });
});
