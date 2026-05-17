// Process-local SSE connection metrics module tests (SSE-3c).
//
// The metrics are intentionally per-process counters — multi-instance prod
// will need a Redis-backed counter. These tests pin down the in-process
// contract: monotonic counts that never go negative, reset hook for test
// isolation, and independence between active-count and reconnect-count.

import { describe, it, expect, beforeEach } from "vitest";

import {
  incrementConnection,
  decrementConnection,
  recordReconnect,
  getActiveConnectionCount,
  getReconnectCount,
  __resetMetricsForTests,
} from "../sse-metrics";

beforeEach(() => {
  __resetMetricsForTests();
});

describe("sse-metrics", () => {
  it("starts with zero active connections and zero reconnects", () => {
    expect(getActiveConnectionCount()).toBe(0);
    expect(getReconnectCount()).toBe(0);
  });

  it("incrementConnection increases the active count by 1", () => {
    incrementConnection();
    expect(getActiveConnectionCount()).toBe(1);
    incrementConnection();
    incrementConnection();
    expect(getActiveConnectionCount()).toBe(3);
  });

  it("decrementConnection decreases the active count by 1", () => {
    incrementConnection();
    incrementConnection();
    decrementConnection();
    expect(getActiveConnectionCount()).toBe(1);
  });

  it("decrementConnection clamps at 0 — never goes negative", () => {
    decrementConnection();
    decrementConnection();
    expect(getActiveConnectionCount()).toBe(0);
  });

  it("recordReconnect increments the reconnect counter independently", () => {
    recordReconnect();
    recordReconnect();
    expect(getReconnectCount()).toBe(2);
    expect(getActiveConnectionCount()).toBe(0);
  });

  it("__resetMetricsForTests zeroes both counters", () => {
    incrementConnection();
    incrementConnection();
    recordReconnect();
    __resetMetricsForTests();
    expect(getActiveConnectionCount()).toBe(0);
    expect(getReconnectCount()).toBe(0);
  });
});
