-- Dynasty Survivor schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query) after creating your project.
--
-- Game rule encoded here: each week, a player picks one Sleeper league manager (roster).
-- They survive the week if that manager won their fantasy matchup. A manager can only be
-- picked once per pool for the whole season (classic survivor "no reuse" rule).
--
-- Win/loss results are NOT stored here. The frontend computes survival status live by
-- fetching matchup data from the Sleeper API and cross-referencing it with the picks below.
-- This keeps the app a pure static-frontend + Supabase-for-picks architecture with no backend
-- cron/job needed to grade weeks.

create extension if not exists pgcrypto;

-- One row per authenticated user, extends auth.users with a public display name.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- A single survivor contest, tied to one Sleeper dynasty league/season.
create table if not exists pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sleeper_league_id text not null,
  season text not null,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Calendar date of the Thursday of week 1 (e.g. '2026-09-03'). Picks for week N lock at
  -- 7:00 PM America/Chicago on (season_start_thursday + (N-1) weeks). NULL means no locking.
  season_start_thursday date
);

-- Who is playing in a given pool.
create table if not exists pool_members (
  pool_id uuid not null references pools (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

-- Weekly picks. sleeper_manager_name is denormalized purely for display convenience;
-- the source of truth for who's who is always the Sleeper API.
create table if not exists picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  week int not null check (week between 1 and 18),
  sleeper_roster_id int not null,
  sleeper_manager_name text not null,
  created_at timestamptz not null default now(),
  unique (pool_id, user_id, week), -- one pick per player per week
  unique (pool_id, user_id, sleeper_roster_id) -- can't pick the same manager twice
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Returns the instant (as a real timestamptz) that picks for a given week lock: 7:00 PM
-- America/Chicago on the Thursday of that week. This is evaluated by Postgres using its own
-- clock, so it can't be bypassed by a client lying about its local time.
create or replace function pick_lock_at(p_week int, p_season_start_thursday date)
returns timestamptz
language sql
immutable
as $$
  select
    ((p_season_start_thursday + (p_week - 1) * 7)::timestamp + interval '19 hours')
      at time zone 'America/Chicago'
$$;

-- Row Level Security ---------------------------------------------------------

alter table profiles enable row level security;
alter table pools enable row level security;
alter table pool_members enable row level security;
alter table picks enable row level security;

create policy "profiles are publicly readable"
  on profiles for select
  using (true);

create policy "users manage their own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "pools are publicly readable"
  on pools for select
  using (true);

create policy "authenticated users can create pools"
  on pools for insert
  with check (auth.uid() = created_by);

create policy "pool creator can update their pool"
  on pools for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "pool membership is publicly readable"
  on pool_members for select
  using (true);

create policy "users can join a pool themselves"
  on pool_members for insert
  with check (auth.uid() = user_id);

create policy "users can leave a pool themselves"
  on pool_members for delete
  using (auth.uid() = user_id);

-- Picks are hidden from everyone but the picker until their week locks (see pick_lock_at
-- above). If a pool has no season_start_thursday set, picks are unlocked/visible immediately
-- (back-compat default for pools created before locking existed).
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
