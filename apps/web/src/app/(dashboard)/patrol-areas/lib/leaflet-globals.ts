// Side-effect module: MUST be imported BEFORE @geoman-io/leaflet-geoman-free.
// Modern leaflet ESM does not attach itself to window.L, but geoman registers
// onto the global L object at module-load time. Without this assignment the
// browser throws "ReferenceError: L is not defined" when geoman's IIFE runs.
import L from "leaflet";

if (typeof window !== "undefined") {
  (globalThis as unknown as { L: typeof L }).L = L;
}
