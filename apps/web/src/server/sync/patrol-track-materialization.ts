/**
 * Stub for Patrol Track Materialization job.
 *
 * Real implementation lands in Phase 8 Batch 5 — will fetch the patrol's GPS
 * track from EarthRanger (`/subject/<leader_id>/tracks/?since=&until=`) using
 * `segment[0].leader.id` + `segment[0].time_range`, then atomically upsert the
 * resulting GeoJSON into the PatrolTrack table (insert-or-update keyed on
 * patrol_id).
 *
 * Refresh predicate (per v2 PRODUCT.md §1043):
 *   needs_refetch(patrol) === true when:
 *     (a) no PatrolTrack row exists for the patrol, OR
 *     (b) patrol_ended === false in the local PatrolTrack (still active), OR
 *     (c) patrol_ended === false locally but the live patrol's
 *         segment[0].time_range.end_time is now set (patrol just ended).
 *
 * Concurrency: capped at 4 per tenant via async-pool helper.
 *
 * Called by: the EarthRanger sync engine after Patrol upsert
 * (packages/jobs/src/processors/er-sync.processor.ts). NOT yet wired —
 * Batch 5 will add the call site.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- stub; real impl in Batch 5 will be async (fetch + upsert)
export async function materializePatrolTrack(patrolId: string): Promise<void> {
  // TODO Batch 5: implement fetch + atomic upsert against PatrolTrack.
  // - resolve patrol + segment[0].leader.id + time_range from local Patrol
  // - call earthranger-client.fetchSubjectTracks(leaderId, since, until)
  // - upsert PatrolTrack on patrolId (update point_count, has_timestamps,
  //   last_track_time, patrol_ended, fetched_at)
  // - publish realtime event so the Patrol Track Viewer modal can refresh
  void patrolId;
  throw new Error(
    "Not implemented — Batch 5 wiring. See apps/web/src/server/sync/patrol-track-materialization.ts."
  );
}
