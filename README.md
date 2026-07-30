# Dynasty Survivor

A free fantasy football survivor pool. Each week, players pick one manager from
a Sleeper dynasty league; if that manager wins their fantasy matchup, the
player survives. Pick a manager once per season — no reuse. Last player
standing wins.

**Stack:** static React + Vite frontend (GitHub Pages), [Supabase](https://supabase.com)
for auth + storing picks, the [Sleeper API](https://docs.sleeper.com/) for
live league/roster/matchup data. There is no backend server — the frontend
reads picks from Supabase and cross-references them against live Sleeper
matchup data to compute win/loss on the fly.

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase project's URL and
   anon key (Project Settings → API in the Supabase dashboard).
3. In the Supabase dashboard, open the SQL Editor and run everything in
   [`supabase/schema.sql`](./supabase/schema.sql) once. This creates the
   `profiles`, `pools`, `pool_members`, and `picks` tables with row-level
   security policies. If you already ran an older version of this file,
   instead run whichever of the numbered files in
   [`supabase/migrations/`](./supabase/migrations/) you haven't applied yet,
   in order, to bring an existing database up to date without touching your
   data:
   - `0001_pick_locking.sql` — adds weekly pick locking
   - `0002_reset_manager_pool_at_week9.sql` — resets manager reuse at week 9
   - `0003_backfill_missing_profiles.sql` — fixes accounts created before the
     auto-profile trigger existed (symptom: creating/joining a pool fails
     with a `pools_created_by_fkey` or `pool_members` foreign key error)
   - `0004_pool_creator_can_delete.sql` — adds the missing RLS policy letting
     a pool's creator delete it (needed for the "Delete pool" button)
4. In Supabase Auth settings, magic-link email sign-in is enabled by default —
   no extra config needed for local dev.
5. `npm run dev`

## Deploying to GitHub Pages

Deployment runs via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
on every push to `main`.

One-time setup on GitHub:

1. Repo **Settings → Pages** → Source: **GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions** → add repository
   secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as
   your local `.env`). The anon key is safe to ship in a client bundle — it's
   meant to be public and is constrained by the RLS policies in
   `schema.sql` — but it's kept out of the workflow file itself as a secret
   for hygiene.

`vite.config.ts` is set to `base: '/dynasty-survivor/'` to match this repo's
Pages URL (`https://<user>.github.io/dynasty-survivor/`). If you rename the
repo, update `base` here, `basename` in `src/main.tsx`, and
`pathSegmentsToKeep` in `public/404.html` to match.

GitHub Pages is a static file host with no server-side routing, so directly
loading or refreshing a client-side route like `/pools/<id>` 404s unless
handled specially. `public/404.html` + the small script in `index.html`
implement the standard [SPA-on-GitHub-Pages redirect
trick](https://github.com/rafgraph/spa-github-pages) to work around this —
without it, only in-app link clicks would work, not shared URLs, magic-link
redirects, or page refreshes.

## How picking works

- `getLeagueManagers` (`src/lib/sleeper.ts`) merges a Sleeper league's rosters
  and users into a pickable list of managers.
- A pick is one row in `picks`: `(pool_id, user_id, week, sleeper_roster_id)`.
  Unique constraints in the schema enforce one pick per player per week, and
  no repeat manager within the same season "half" (see below).
- Result (`pending` / `win` / `loss`) is never stored — `computeResult` in
  `src/lib/sleeper.ts` fetches that week's Sleeper matchups on read and
  compares the picked roster's points against its opponent's.
- `src/components/Leaderboard.tsx` shows every pool member's pick history and
  alive/eliminated status, batching one Sleeper matchup fetch per distinct
  week (shared across all players' picks that week) instead of one per pick.

## Manager reuse resets at week 9

A manager can only be picked once per **half** of the season — weeks 1-8,
then weeks 9-18 — rather than once for the whole season. A strict
full-season no-reuse rule runs out of pickable managers before the season
ends for typical dynasty league sizes (10-14 teams): a 12-player pool where
everyone keeps winning would run dry around week 13.

This is enforced at the database level via a generated `pick_half` column on
`picks` (`1` for week < 9, else `2`) and a unique constraint on
`(pool_id, user_id, sleeper_roster_id, pick_half)`. `src/lib/pickRules.ts`
(`RESET_WEEK`, `pickHalf()`) mirrors the same `week < 9` split client-side to
filter the manager dropdown — keep both in sync if you ever change the
threshold.

## Pick locking

Picks lock every week at **7:00 PM America/Chicago on that week's Thursday**
— a static approximation of NFL kickoff, not the real per-game schedule (the
Sleeper API doesn't expose one). A pool's `season_start_thursday` column
(set when creating the pool, e.g. `2026-09-03` for week 1) anchors the
calendar date; week N locks at `season_start_thursday + (N-1) weeks`.
Leaving it blank disables locking for that pool.

This is enforced authoritatively in Postgres, not the client: `pick_lock_at()`
in `supabase/schema.sql` computes the lock instant, and the RLS policies on
`picks` use it directly against `now()` to gate insert/update/delete and to
hide other players' picks for a week until it locks (each player can always
see their own). `src/lib/lock.ts` mirrors this logic client-side purely to
drive the UI (disabling the pick form, showing the lock time) — a modified
client can't bypass the real deadline since Postgres's clock is what's
actually checked.

## Elimination

`PoolDetail` replays a signed-in player's own picks against live Sleeper
matchup data (same approach as the leaderboard) to find their earliest loss.
Once eliminated, the pick form is replaced with a message naming the week and
manager that ended their run, and they can no longer submit new picks from
the UI.

This check is **client-side only** — like results generally, elimination
status isn't stored anywhere in Postgres, so RLS has no way to block an
eliminated player's `insert` at the database level (it can't independently
verify a Sleeper score). A modified client could still insert a pick after
elimination. Closing that gap would mean either storing computed results
(reintroducing a grading step) or moving result computation into a trusted
place RLS can call, e.g. a `pg_net`-backed function — not done here to keep
the architecture simple.

## Testing before the season starts

`currentWeek` normally comes from Sleeper's live `/state/nfl` endpoint, which
reports `week: 0` for the entire pre-season — so picking is impossible
end-to-end until the real season kicks off. To exercise the app before then:

1. **Point a test pool at a real past-season Sleeper league** (e.g. last
   year's version of your dynasty league) instead of the current one, so
   `getMatchups` returns real completed games with real scores instead of
   empty/zeroed ones. Sleeper gives each season's league a new ID linked via
   `previous_league_id`, so grab that older ID from Sleeper for this.
2. **Append `?week=N`** to a pool's URL (e.g.
   `.../pools/<id>?week=5`) to override the current week the whole page uses
   — picking, locking, and elimination all key off it. A yellow "Testing
   mode" hint appears whenever it's active so it's never confused for the
   live week. This only affects `PoolDetail`; `Leaderboard` isn't
   week-scoped, it already renders whatever picks exist regardless of the
   live week.
3. To test locking specifically, set the pool's `season_start_thursday` to a
   date that puts your test week's lock instant in the past (to see other
   players' picks/results appear) or the future (to see the pick form
   active) relative to right now.

## Known limitations / next steps

- **Ties currently count as a loss** for the picker (`computeResult` in
  `src/lib/sleeper.ts`) — adjust if your pool should treat ties differently.
- **The Thursday-7PM lock is a fixed approximation**, not tied to real game
  times — e.g. it doesn't account for early London-game weeks or Thanksgiving
  scheduling quirks.
- **Elimination is enforced client-side only** (see above) — pick locking is
  the one rule with real database-level teeth.
