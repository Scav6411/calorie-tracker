-- Push energy_readings changes to the browser instead of polling for them.
--
-- The app is launched from a Home Screen Shortcut whose first action opens the
-- URL and whose second uploads the day's Health data, so the page reads the
-- table while that upload is still in flight and the first render shows the
-- previous sync. Timed refetches paper over it; a subscription removes the
-- guesswork - the row arrives when it arrives.
--
-- Supabase ships the supabase_realtime publication empty. Adding a table to it
-- is what makes its changes broadcastable at all. RLS still applies: a
-- subscriber only receives rows its own select policy would have returned, so
-- energy_readings_select_own keeps one user's readings off another's socket.
--
-- Replica identity is left at default (primary key). postgres_changes carries
-- the new row on insert and update, which is all this needs; replica identity
-- full would only add the OLD row on update and delete, at a WAL cost.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'energy_readings'
  ) then
    alter publication supabase_realtime add table public.energy_readings;
  end if;
end
$$;
