-- Body weight readings.
--
-- Every reading is kept rather than one row per day: weighing twice in a day is
-- normal, and the history is what a trend line is drawn from.

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_kg numeric(6, 2) not null check (weight_kg > 0 and weight_kg < 500),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Makes a double submit correct the row instead of duplicating it.
  constraint weight_logs_user_logged_at_key unique (user_id, logged_at)
);

comment on table public.weight_logs is 'Body weight readings, one row per weigh-in.';

create index if not exists weight_logs_user_logged_at_idx
  on public.weight_logs (user_id, logged_at desc);

alter table public.weight_logs enable row level security;

drop policy if exists "weight_logs_select_own" on public.weight_logs;
create policy "weight_logs_select_own"
  on public.weight_logs for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "weight_logs_insert_own" on public.weight_logs;
create policy "weight_logs_insert_own"
  on public.weight_logs for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "weight_logs_update_own" on public.weight_logs;
create policy "weight_logs_update_own"
  on public.weight_logs for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "weight_logs_delete_own" on public.weight_logs;
create policy "weight_logs_delete_own"
  on public.weight_logs for delete
  to authenticated
  using (user_id = (select auth.uid()));
