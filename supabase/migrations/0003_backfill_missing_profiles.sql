-- Run this once in the Supabase SQL editor if pool/pool_member creation fails with
-- "violates foreign key constraint pools_created_by_fkey" (or similar) for a
-- signed-in user. The handle_new_user() trigger in schema.sql only creates a profiles
-- row on NEW auth.users inserts — any account created before that trigger existed
-- (or before schema.sql was run at all) never got one. Safe to re-run.

insert into profiles (id, display_name)
select
  auth.users.id,
  coalesce(auth.users.raw_user_meta_data ->> 'display_name', split_part(auth.users.email, '@', 1))
from auth.users
left join profiles on profiles.id = auth.users.id
where profiles.id is null;
