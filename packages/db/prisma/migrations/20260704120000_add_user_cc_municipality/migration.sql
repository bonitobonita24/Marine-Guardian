-- Additive: persist a user's Command Center map municipality preference so it
-- restores across refresh and re-login on any device.
-- Nullable, no FK (soft reference to municipalities.id) — safe, non-breaking
-- for existing rows; an invalid/stale id is treated as null client-side.
ALTER TABLE "users" ADD COLUMN "command_center_municipality_id" TEXT;
