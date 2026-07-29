-- Run this once in the Supabase SQL editor to add weekly pick locking to an
-- already-deployed Dynasty Survivor database (i.e. one where schema.sql was run
-- before locking existed). Safe to re-run.

alter table pools
  add column if not exists season_start_thursday date;

comment on column pools.season_start_thursday is
  'Calendar date of the Thursday of week 1 (e.g. 2026-09-03). Picks for week N lock at '
  '7:00 PM America/Chicago on (season_start_thursday + (N-1) weeks). NULL means no locking.';

create or replace function pick_lock_at(p_week int, p_season_start_thursday date)
returns timestamptz
language sql
immutable
as $$
  select
    ((p_season_start_thursday + (p_week - 1) * 7)::timestamp + interval '19 hours')
      at time zone 'America/Chicago'
$$;

drop policy if exists "picks are publicly readable" on picks;
drop policy if exists "picks are visible to their owner, or to everyone once locked" on picks;
create policy "picks are visible to their owner, or to everyone once locked"
  on picks for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from pools
      where pools.id = picks.pool_id
        and pools.season_start_thursday is not null
        and now() >= pick_lock_at(picks.week, pools.season_start_thursday)
    )
  );

drop policy if exists "members can create their own picks" on picks;
drop policy if exists "members can create their own picks before lock" on picks;
create policy "members can create their own picks before lock"
  on picks for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from pool_members
      where pool_members.pool_id = picks.pool_id
        and pool_members.user_id = auth.uid()
    )
    and exists (
      select 1 from pools
      where pools.id = picks.pool_id
        and (
          pools.season_start_thursday is null
          or now() < pick_lock_at(picks.week, pools.season_start_thursday)
        )
    )
  );

drop policy if exists "members can update their own picks" on picks;
drop policy if exists "members can update their own picks before lock" on picks;
create policy "members can update their own picks before lock"
  on picks for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from pools
      where pools.id = picks.pool_id
        and (
          pools.season_start_thursday is null
          or now() < pick_lock_at(picks.week, pools.season_start_thursday)
        )
    )
  )
  with check (auth.uid() = user_id);

drop policy if exists "members can delete their own picks" on picks;
drop policy if exists "members can delete their own picks before lock" on picks;
create policy "members can delete their own picks before lock"
  on picks for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from pools
      where pools.id = picks.pool_id
        and (
          pools.season_start_thursday is null
          or now() < pick_lock_at(picks.week, pools.season_start_thursday)
        )
    )
  );
