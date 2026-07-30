-- Run this once in the Supabase SQL editor for an already-deployed database (i.e. one where
-- schema.sql was run before this existed). Safe to re-run.
--
-- pools previously had no delete policy at all, so nobody — not even a pool's creator — could
-- delete it through the app; the "Delete pool" button relies on this policy existing.
-- pool_members and picks rows for the pool are removed automatically via their existing
-- `on delete cascade` foreign keys.

drop policy if exists "pool creator can delete their pool" on pools;

create policy "pool creator can delete their pool"
  on pools for delete
  using (auth.uid() = created_by);
