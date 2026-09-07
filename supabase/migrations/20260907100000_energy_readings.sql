-- Energy readings synced from Apple Health.
--
-- Each row is a snapshot of the day's CUMULATIVE totals at synced_at, not an
-- hourly delta: the figures climb through the day and reset at local midnight.
-- Rows are kept rather than collapsed so the intraday curve survives; burn for
-- any interval is the difference between two readings.

create table if not exists public.energy_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  synced_at timestamptz not null,
  active_energy numeric(10, 3) not null check (active_energy >= 0),
  resting_energy numeric(10, 3) not null check (resting_energy >= 0),
  total_energy numeric(11, 3) generated always as (active_energy + resting_energy) stored,
  source text not null default 'apple_health',
  created_at timestamptz not null default now(),
  -- Makes a retried sync correct the row instead of duplicating it.
  constraint energy_readings_user_synced_at_key unique (user_id, synced_at)
);

comment on table public.energy_readings is
  'Cumulative daily energy snapshots from Apple Health, one row per sync.';

create index if not exists energy_readings_user_time_idx
  on public.energy_readings (user_id, synced_at desc);

alter table public.energy_readings enable row level security;

drop policy if exists "energy_readings_select_own" on public.energy_readings;
create policy "energy_readings_select_own"
  on public.energy_readings for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "energy_readings_insert_own" on public.energy_readings;
create policy "energy_readings_insert_own"
  on public.energy_readings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "energy_readings_update_own" on public.energy_readings;
create policy "energy_readings_update_own"
  on public.energy_readings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "energy_readings_delete_own" on public.energy_readings;
create policy "energy_readings_delete_own"
  on public.energy_readings for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Daily rollup. Bucketed by the user's own timezone and computed at read time,
-- so changing the timezone re-buckets history correctly. Totals are cumulative
-- and monotonic within a day, so the last reading is the max.
drop view if exists public.daily_energy;
create view public.daily_energy
with (security_invoker = on) as
select
  r.user_id,
  ((r.synced_at at time zone p.timezone))::date as day,
  max(r.active_energy) as active_energy,
  max(r.resting_energy) as resting_energy,
  max(r.total_energy) as total_energy,
  max(r.synced_at) as last_synced_at,
  count(*)::int as reading_count
from public.energy_readings r
join public.profiles p on p.id = r.user_id
group by r.user_id, ((r.synced_at at time zone p.timezone))::date;

comment on view public.daily_energy is
  'One row per user per local day: the final cumulative totals for that day.';
