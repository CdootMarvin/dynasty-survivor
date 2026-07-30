-- Run this once in the Supabase SQL editor to let managers be picked again starting week 9,
-- for an already-deployed database (i.e. one where schema.sql was run before this existed).
-- Safe to re-run.
--
-- Without this, a strict full-season no-reuse rule runs out of pickable managers before the
-- season ends for typical dynasty league sizes (10-14 teams) — a 12-player pool where everyone
-- keeps winning would run dry around week 13. Splitting the season into two "halves" (weeks
-- 1-8, then 9-18) and resetting which managers are available at the start of the second half
-- makes the full season playable.

alter table picks
  add column if not exists pick_half smallint
    generated always as (case when week < 9 then 1 else 2 end) stored;

alter table picks drop constraint if exists picks_pool_id_user_id_sleeper_roster_id_key;
alter table picks drop constraint if exists picks_pool_id_user_id_sleeper_roster_id_pick_half_key;
alter table picks
  add constraint picks_pool_id_user_id_sleeper_roster_id_pick_half_key
  unique (pool_id, user_id, sleeper_roster_id, pick_half);
