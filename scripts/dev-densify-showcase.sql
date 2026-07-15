-- dev-densify-showcase.sql
-- DEV-ONLY, LOCAL-ONLY, REVERSIBLE data-shaping for docs/showcase screenshots.
-- Owner-authorized (2026-07-15). Makes the tenant `ph` dev dataset look
-- data-rich in the recent window WITHOUT re-seeding or wiping — it only
-- shifts/redistributes dates and diversifies patrol types IN PLACE.
--
-- What it does (all scoped to tenant `ph`):
--   1. Builds a "showcase" set = the 50 most-recent MULTIPOINT patrol tracks
--      (>=2 points) — exactly the set the Live Map `map.active` overlay draws.
--   2. Makes those 50 patrols state='open', with recent+spread start_times
--      (last ~20 days) and an alternating seaborne/foot type + water/land
--      terrain, so the map renders 50 varied polylines (cyan solid + orange
--      dashed) and the dashboard "active patrols" window is populated.
--   3. Refreshes those 50 tracks' since/until/last_track_time to the last
--      ~12 days (spread) so they stay the top-50 by `until` and read as
--      live activity.
--   4. Demotes every OTHER open patrol to 'done' so the only open/active
--      patrols are the clean recent showcase set.
--   5. Shifts observations forward so the newest lands on "today".
-- Events are already dense/recent (max reported_at = today) and are left as-is.
--
-- Rollback: restore the pg_dump taken immediately before running this.
--   gunzip -c <backup>.sql.gz | docker exec -i marine-guardian_dev_postgres \
--     psql -U <PGUSER> -d marine-guardian_dev
--
-- Run: docker exec -i marine-guardian_dev_postgres psql -U <PGUSER> \
--        -d marine-guardian_dev -v ON_ERROR_STOP=1 -f - < scripts/dev-densify-showcase.sql

\set ph 'cmoruubw20000gmx3jx7zudmy'

BEGIN;

-- 1. Showcase set: the 50 most-recent renderable (multipoint) tracks.
CREATE TEMP TABLE showcase ON COMMIT DROP AS
SELECT pt.patrol_id AS pid,
       row_number() OVER (ORDER BY pt.until DESC, pt.point_count DESC) AS rn
FROM patrol_tracks pt
WHERE pt.tenant_id = :'ph'
  AND pt.point_count >= 2
ORDER BY pt.until DESC, pt.point_count DESC
LIMIT 50;

-- 2. Demote all other currently-open patrols to done (keeps active set clean).
UPDATE patrols p
SET state = 'done', updated_at = now()
WHERE p.tenant_id = :'ph'
  AND p.state = 'open'
  AND p.id NOT IN (SELECT pid FROM showcase);

-- 3. Promote showcase patrols to open, recent spread, alternating type/terrain.
UPDATE patrols p
SET state       = 'open',
    patrol_type = (CASE WHEN s.rn % 2 = 0 THEN 'seaborne' ELSE 'foot' END)::"PatrolType",
    terrain     = (CASE WHEN s.rn % 2 = 0 THEN 'water' ELSE 'land' END),
    start_time  = now()
                  - ((s.rn * 20.0 / 50.0) || ' days')::interval
                  - ((random() * 10) || ' hours')::interval,
    end_time    = NULL,
    updated_at  = now()
FROM showcase s
WHERE p.id = s.pid;

-- 4. Refresh showcase tracks so their `until` is the most recent (last ~12d).
UPDATE patrol_tracks pt
SET since           = p.start_time,
    until           = now()
                      - ((s.rn * 12.0 / 50.0) || ' days')::interval
                      - ((random() * 6) || ' hours')::interval,
    last_track_time = now()
                      - ((s.rn * 12.0 / 50.0) || ' days')::interval
                      - ((random() * 6) || ' hours')::interval,
    patrol_ended    = false,
    updated_at      = now()
FROM showcase s
JOIN patrols p ON p.id = s.pid
WHERE pt.patrol_id = s.pid;

-- 5. Shift observations forward so the newest lands on "today" (keeps spacing).
UPDATE observations o
SET recorded_at = o.recorded_at
                  + (now() - (SELECT max(recorded_at) FROM observations WHERE tenant_id = :'ph'))
WHERE o.tenant_id = :'ph';

-- 6. Spread patrol-schedule assignments across the current bi-weekly window so
--    the Calendar / Gantt / Kanban schedule views are populated (preserve each
--    assignment's duration).
WITH sched AS (
  SELECT id,
         (scheduled_end - scheduled_start) AS dur,
         row_number() OVER (ORDER BY scheduled_start) AS rn,
         count(*) OVER () AS n
  FROM patrol_schedules WHERE tenant_id = :'ph'
)
UPDATE patrol_schedules ps
SET scheduled_start = date_trunc('day', now())
                      - interval '6 days'
                      + ((s.rn * 20.0 / GREATEST(s.n,1)) || ' days')::interval
                      + ((6 + (s.rn % 6)) || ' hours')::interval,
    scheduled_end   = date_trunc('day', now())
                      - interval '6 days'
                      + ((s.rn * 20.0 / GREATEST(s.n,1)) || ' days')::interval
                      + ((6 + (s.rn % 6)) || ' hours')::interval
                      + s.dur,
    updated_at      = now()
FROM sched s
WHERE ps.id = s.id;

COMMIT;
