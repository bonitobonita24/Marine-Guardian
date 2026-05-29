// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  userCount: number;
  eventCount30d: number;
  createdAt: Date;
}

interface MetricsData {
  totalTenants: number;
  totalUsers: number;
  totalEvents: number;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    metricsData: MetricsData | undefined;
    metricsIsLoading: boolean;
    listData: TenantRow[] | undefined;
    listIsLoading: boolean;
  } = {
    metricsData: undefined,
    metricsIsLoading: false,
    listData: undefined,
    listIsLoading: false,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    platform: {
      metrics: {
        useQuery: () => ({
          data: stubs.metricsData,
          isLoading: stubs.metricsIsLoading,
        }),
      },
      list: {
        useQuery: () => ({
          data: stubs.listData,
          isLoading: stubs.listIsLoading,
        }),
      },
    },
  },
}));

vi.mock("../sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

import { AdminLandingClient } from "../admin-landing-client";

const baseTenants: TenantRow[] = [
  {
    id: "t-1",
    name: "Coral Bay Reserve",
    slug: "coral-bay",
    isActive: true,
    userCount: 8,
    eventCount30d: 42,
    createdAt: new Date("2026-01-15T00:00:00Z"),
  },
  {
    id: "t-2",
    name: "Reef Watch South",
    slug: "reef-watch-south",
    isActive: false,
    userCount: 3,
    eventCount30d: 5,
    createdAt: new Date("2026-02-20T00:00:00Z"),
  },
];

describe("AdminLandingClient", () => {
  beforeEach(() => {
    stubs.metricsData = undefined;
    stubs.metricsIsLoading = false;
    stubs.listData = [];
    stubs.listIsLoading = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders KPI placeholders (—) while metrics loading", () => {
    stubs.metricsData = undefined;
    stubs.metricsIsLoading = true;
    const { getAllByText } = render(
      <AdminLandingClient email="admin@test.com" roles={["super_admin"]} />,
    );
    // Three KPI cards should all show "—"
    expect(getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("renders metric values when data is present", () => {
    stubs.metricsData = { totalTenants: 3, totalUsers: 12, totalEvents: 87 };
    const { getByText } = render(
      <AdminLandingClient email="admin@test.com" roles={["super_admin"]} />,
    );
    expect(getByText("3")).toBeTruthy();
    expect(getByText("12")).toBeTruthy();
    expect(getByText("87")).toBeTruthy();
  });

  it("renders 'Loading tenants…' while list isLoading", () => {
    stubs.listData = undefined;
    stubs.listIsLoading = true;
    const { getByText } = render(
      <AdminLandingClient email="admin@test.com" roles={["super_admin"]} />,
    );
    expect(getByText("Loading tenants…")).toBeTruthy();
  });

  it("renders 'No tenants yet.' when list.data is empty array", () => {
    stubs.listData = [];
    stubs.listIsLoading = false;
    const { getByText } = render(
      <AdminLandingClient email="admin@test.com" roles={["super_admin"]} />,
    );
    expect(getByText("No tenants yet.")).toBeTruthy();
  });

  it("renders tenant rows and status badges for two tenants", () => {
    stubs.listData = baseTenants;
    const { getByText, getAllByText } = render(
      <AdminLandingClient email="admin@test.com" roles={["super_admin"]} />,
    );
    expect(getByText("Coral Bay Reserve")).toBeTruthy();
    expect(getByText("Reef Watch South")).toBeTruthy();
    // "Active" badge for first tenant + "Inactive" for second
    expect(getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Inactive").length).toBeGreaterThanOrEqual(1);
  });
});
