// Process-local SSE connection metrics (SSE-3c).
//
// Counters live in module scope — they reflect the lifetime of THIS Node.js
// process only. In a multi-instance production deployment each replica will
// report its own active count; aggregate observability requires a Redis-backed
// counter, which is out of scope for SSE-3c.
//
// Why module-level state is acceptable here: SSE connections are tied to a
// specific server instance via long-lived TCP; clients reconnect on failure
// and may land on a different replica. Per-process counts answer the question
// "how many open SSE connections is THIS server holding right now?" — which
// is exactly what we need for backpressure and capacity dashboards.

let activeConnections = 0;
let reconnectCount = 0;

export function incrementConnection(): void {
  activeConnections += 1;
}

export function decrementConnection(): void {
  if (activeConnections > 0) {
    activeConnections -= 1;
  }
}

export function recordReconnect(): void {
  reconnectCount += 1;
}

export function getActiveConnectionCount(): number {
  return activeConnections;
}

export function getReconnectCount(): number {
  return reconnectCount;
}

// Test-only: reset counters between tests. Not exported from a barrel; import
// the named symbol directly in test files.
export function __resetMetricsForTests(): void {
  activeConnections = 0;
  reconnectCount = 0;
}
