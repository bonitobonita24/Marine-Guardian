// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RangerProfileHeader } from "../ranger-profile-header";

afterEach(() => {
  cleanup();
});

const baseProfile = {
  id: "r-1",
  name: "Alice Reyes",
  source: "earthranger_sync" as const,
  erSubjectId: "er-subject-1",
  isActive: true,
  createdAt: new Date("2024-01-15T00:00:00Z"),
};

describe("RangerProfileHeader", () => {
  it("renders the ranger name as the main heading", () => {
    const { getByRole } = render(<RangerProfileHeader profile={baseProfile} />);
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Alice Reyes");
  });

  it("renders initials from first and last name", () => {
    const { container } = render(<RangerProfileHeader profile={baseProfile} />);
    expect(container.textContent).toContain("AR");
  });

  it("renders 'Active' badge when isActive is true", () => {
    const { container } = render(<RangerProfileHeader profile={baseProfile} />);
    expect(container.textContent).toContain("Active");
  });

  it("renders 'Inactive' badge when isActive is false", () => {
    const { container } = render(
      <RangerProfileHeader
        profile={{ ...baseProfile, isActive: false }}
      />,
    );
    expect(container.textContent).toContain("Inactive");
    expect(container.textContent).not.toMatch(/\bActive\b(?!.*Inactive)/);
  });

  it("renders source label 'EarthRanger' for earthranger_sync", () => {
    const { container } = render(<RangerProfileHeader profile={baseProfile} />);
    expect(container.textContent).toContain("EarthRanger");
  });

  it("renders source label 'Manual entry' for manual_entry", () => {
    const { container } = render(
      <RangerProfileHeader
        profile={{
          ...baseProfile,
          source: "manual_entry" as const,
          erSubjectId: null,
        }}
      />,
    );
    expect(container.textContent).toContain("Manual entry");
  });

  it("shows EarthRanger subject ID when present", () => {
    const { container } = render(<RangerProfileHeader profile={baseProfile} />);
    expect(container.textContent).toContain("er-subject-1");
  });

  it("does not show EarthRanger subject ID when null", () => {
    const { container } = render(
      <RangerProfileHeader
        profile={{ ...baseProfile, erSubjectId: null }}
      />,
    );
    expect(container.textContent).not.toContain("EarthRanger subject");
  });

  it("uses '?' initial fallback for empty name", () => {
    const { container } = render(
      <RangerProfileHeader profile={{ ...baseProfile, name: "" }} />,
    );
    expect(container.textContent).toContain("?");
  });
});
