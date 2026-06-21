// @vitest-environment jsdom

/**
 * AlertsPanel component tests — ACK feature (owner-approved 2026-06-21).
 *
 * Covers:
 *   - renders unacknowledged alerts with ACK button (canAck=true)
 *   - ACK button hidden for non-admin users (canAck=false)
 *   - acknowledged alerts show ACK badge instead of ACK button
 *   - onAcknowledge callback fires with the correct alert id
 *   - disabled state while ackingId matches
 *   - WCAG 2.2 AA: button has accessible aria-label
 *   - empty-state render
 *   - loading state render
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { AlertsPanel, type AlertItem } from "../alerts-panel";

afterEach(() => {
  cleanup();
});

const baseAlert: AlertItem = {
  id: "h-1",
  firedAt: new Date("2026-06-21T08:00:00Z"),
  matchedPriority: 200,
  ruleName: "Priority Alert",
  eventTitle: "Poaching event",
  acknowledgedAt: null,
  acknowledgedBy: null,
};

const ackedAlert: AlertItem = {
  ...baseAlert,
  id: "h-2",
  eventTitle: "Turtle nesting",
  acknowledgedAt: new Date("2026-06-21T09:00:00Z"),
  acknowledgedBy: "admin-1",
};

describe("AlertsPanel — ACK feature", () => {
  it("renders an ACK button for unacknowledged alert when canAck=true", () => {
    const { getAllByRole } = render(
      <AlertsPanel alerts={[baseAlert]} isLoading={false} canAck={true} />,
    );
    const buttons = getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons[0]?.textContent).toBe("ACK");
  });

  it("ACK button has a descriptive aria-label (WCAG 2.2 AA)", () => {
    const { getAllByRole } = render(
      <AlertsPanel alerts={[baseAlert]} isLoading={false} canAck={true} />,
    );
    const btn = getAllByRole("button")[0] as HTMLButtonElement;
    expect(btn.getAttribute("aria-label")).toMatch(/acknowledge alert/i);
    expect(btn.getAttribute("aria-label")).toContain("Poaching event");
  });

  it("does NOT show ACK button when canAck=false (non-admin)", () => {
    const { queryAllByRole } = render(
      <AlertsPanel alerts={[baseAlert]} isLoading={false} canAck={false} />,
    );
    const buttons = queryAllByRole("button");
    expect(buttons).toHaveLength(0);
  });

  it("calls onAcknowledge with the alert id when ACK is clicked", () => {
    const onAcknowledge = vi.fn();
    const { getAllByRole } = render(
      <AlertsPanel
        alerts={[baseAlert]}
        isLoading={false}
        canAck={true}
        onAcknowledge={onAcknowledge}
      />,
    );
    fireEvent.click(getAllByRole("button")[0] as HTMLButtonElement);
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).toHaveBeenCalledWith("h-1");
  });

  it("disables the ACK button while ackingId matches the alert id", () => {
    const { getAllByRole } = render(
      <AlertsPanel
        alerts={[baseAlert]}
        isLoading={false}
        canAck={true}
        ackingId="h-1"
      />,
    );
    const btn = getAllByRole("button")[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("…");
  });

  it("shows an ACK badge (not a button) for already-acknowledged alerts", () => {
    const { queryAllByRole, getByText } = render(
      <AlertsPanel alerts={[ackedAlert]} isLoading={false} canAck={true} />,
    );
    // No interactive ACK button
    expect(queryAllByRole("button")).toHaveLength(0);
    // ACK badge present
    expect(getByText("ACK")).toBeTruthy();
  });

  it("mixed: shows ACK button for unacked, badge for acked", () => {
    const { getAllByRole, getAllByText } = render(
      <AlertsPanel
        alerts={[baseAlert, ackedAlert]}
        isLoading={false}
        canAck={true}
      />,
    );
    // One ACK button for unacked alert
    expect(getAllByRole("button")).toHaveLength(1);
    // "ACK" text appears once on the button + once on the badge = 2 total
    expect(getAllByText("ACK")).toHaveLength(2);
  });

  it("renders loading state", () => {
    const { getByText } = render(
      <AlertsPanel alerts={[]} isLoading={true} />,
    );
    expect(getByText(/loading alerts/i)).toBeTruthy();
  });

  it("renders empty state when no alerts", () => {
    const { getByText } = render(
      <AlertsPanel alerts={[]} isLoading={false} />,
    );
    expect(getByText(/no alerts fired recently/i)).toBeTruthy();
  });

  it("header shows unacked count, not total count", () => {
    const { getByText } = render(
      <AlertsPanel
        alerts={[baseAlert, ackedAlert]}
        isLoading={false}
        canAck={true}
      />,
    );
    // 1 unacked out of 2 total
    expect(getByText("1 unacked")).toBeTruthy();
  });
});
