-- Apple Health now uploads one figure per hour instead of a running total.
--
-- The Shortcut's "Find Health Samples ... Group by: Hour" action returns the
-- burn inside each hour of the local day, so a row can now mean one of two
-- things: the day's total so far at an instant (how every row written before
-- this migration was produced), or the burn inside a single hour. The two
-- cannot be pooled - summing running totals double-counts the day, and taking
-- the max of hourly buckets returns the busiest hour instead of the day - so
-- each row records which kind it is and the rollup branches on it.
--
-- Existing rows are left untouched and keep reading correctly as 'cumulative'.

alter table public.energy_readings
  add column if not exists granularity text not null default 'cumulative'
    check (granularity in ('cumulative', 'hourly')),
  -- For an hourly row synced_at is the hour the energy was burned, which is not
  -- when the phone uploaded it: a sync at 21:05 writes a bucket stamped 00:00.
  -- "Synced 3h ago" needs the upload time, so it is tracked separately.
  add column if not exists updated_at timestamptz not null default now();

-- The column defaults to now(), which would date every pre-existing row to the
-- moment this migration ran and make months-old days read as "synced just now".
-- Their upload time is their created_at.
update public.energy_readings
   set updated_at = created_at
 where granularity = 'cumulative'
   and updated_at <> created_at;

comment on column public.energy_readings.granularity is
  'cumulative: synced_at is an instant and the figures are the day so far. hourly: synced_at is the start of a one-hour bucket and the figures are that hour alone.';

comment on column public.energy_readings.updated_at is
  'When the row was last written. Distinct from synced_at, which for an hourly row is the bucket it describes rather than the upload time.';

comment on table public.energy_readings is
  'Energy from Apple Health: either a cumulative daily snapshot or a one-hour bucket, per the granularity column.';

drop trigger if exists energy_readings_set_updated_at on public.energy_readings;
create trigger energy_readings_set_updated_at
  before update on public.energy_readings
  for each row execute function public.set_updated_at();

-- Daily rollup, still bucketed by the user's own timezone at read time so a
-- timezone change re-buckets history. Reworked to branch on granularity.
drop view if exists public.daily_energy;
create view public.daily_energy
with (security_invoker = on) as
with bucketed as (
  select
    r.user_id,
    ((r.synced_at at time zone coalesce(p.timezone, 'Asia/Kolkata')))::date as day,
    r.granularity,
    r.active_energy,
    r.resting_energy,
    r.total_energy,
    r.updated_at
  from public.energy_readings r
  left join public.profiles p on p.id = r.user_id
),
rolled as (
  select
    user_id,
    day,
    count(*) filter (where granularity = 'hourly') as hourly_rows,
    -- Hourly buckets are disjoint slices of the day, so they add up.
    coalesce(sum(active_energy) filter (where granularity = 'hourly'), 0) as hourly_active,
    coalesce(sum(resting_energy) filter (where granularity = 'hourly'), 0) as hourly_resting,
    coalesce(sum(total_energy) filter (where granularity = 'hourly'), 0) as hourly_total,
    -- Cumulative rows are repeated running totals of the same day, so the
    -- largest one is the day's figure.
    coalesce(max(active_energy) filter (where granularity = 'cumulative'), 0) as cumulative_active,
    coalesce(max(resting_energy) filter (where granularity = 'cumulative'), 0) as cumulative_resting,
    coalesce(max(total_energy) filter (where granularity = 'cumulative'), 0) as cumulative_total,
    max(updated_at) as last_synced_at,
    count(*)::int as reading_count
  from bucketed
  group by user_id, day
)
select
  user_id,
  day,
  -- A day holding any hourly row is an hourly day. The two kinds are not
  -- written together, and preferring hourly keeps the changeover day - which
  -- has both - from adding a running total onto a set of buckets.
  case when hourly_rows > 0 then hourly_active else cumulative_active end as active_energy,
  case when hourly_rows > 0 then hourly_resting else cumulative_resting end as resting_energy,
  case when hourly_rows > 0 then hourly_total else cumulative_total end as total_energy,
  last_synced_at,
  reading_count
from rolled;

comment on view public.daily_energy is
  'One row per user per local day: hourly buckets summed, or the final cumulative snapshot for days synced the old way.';
