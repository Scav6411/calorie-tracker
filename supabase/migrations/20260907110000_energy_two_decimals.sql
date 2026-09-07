-- Store energy to 2 decimals, and harden the daily rollup.

-- The view and the generated column both depend on the columns being altered,
-- so they have to come down first.
drop view if exists public.daily_energy;

alter table public.energy_readings
  drop column if exists total_energy;

alter table public.energy_readings
  alter column active_energy type numeric(10, 2) using round(active_energy, 2),
  alter column resting_energy type numeric(10, 2) using round(resting_energy, 2);

alter table public.energy_readings
  add column total_energy numeric(11, 2)
  generated always as (active_energy + resting_energy) stored;

-- Rebuilt with a LEFT JOIN: the previous inner join would have silently dropped
-- every reading for a user whose profile row was missing. Timezone still comes
-- from the profile, defaulting to India.
create view public.daily_energy
with (security_invoker = on) as
select
  r.user_id,
  ((r.synced_at at time zone coalesce(p.timezone, 'Asia/Kolkata')))::date as day,
  max(r.active_energy) as active_energy,
  max(r.resting_energy) as resting_energy,
  max(r.total_energy) as total_energy,
  max(r.synced_at) as last_synced_at,
  count(*)::int as reading_count
from public.energy_readings r
left join public.profiles p on p.id = r.user_id
group by r.user_id, ((r.synced_at at time zone coalesce(p.timezone, 'Asia/Kolkata')))::date;

comment on view public.daily_energy is
  'One row per user per local day: the final cumulative totals for that day.';
