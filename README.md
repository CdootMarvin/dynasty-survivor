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
   security policies.
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
repo, update `base` here and `basename` in `src/main.tsx` to match.

## How picking works

- `getLeagueManagers` (`src/lib/sleeper.ts`) merges a Sleeper league's rosters
  and users into a pickable list of managers.
- A pick is one row in `picks`: `(pool_id, user_id, week, sleeper_roster_id)`.
  Unique constraints in the schema enforce one pick per player per week and no
  repeat manager within a pool.
- Result (`pending` / `win` / `loss`) is never stored — `computeResult` in
  `src/lib/sleeper.ts` fetches that week's Sleeper matchups on read and
  compares the picked roster's points against its opponent's.

## Known limitations / next steps

- **Picks are publicly readable as soon as they're made.** Real survivor
  pools usually hide picks until the week locks (first kickoff) so players
  can't copy each other. Doing that correctly needs a trusted source of
  "now" (a Supabase Edge Function or scheduled job), which is intentionally
  left out of this scaffold — see the comment above the `picks` select policy
  in `supabase/schema.sql`.
- **Ties currently count as a loss** for the picker (`computeResult` in
  `src/lib/sleeper.ts`) — adjust if your pool should treat ties differently.
- No elimination/leaderboard view yet — `PoolDetail` shows one player's own
  pick history, not the whole pool's standings.
