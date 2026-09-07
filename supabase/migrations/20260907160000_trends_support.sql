-- Everything the Trends page needs that the per-day screens did not: a daily
-- rollup of calories eaten, and a goal weight to draw the target line against.

-- Mirrors daily_energy exactly, including the timezone handling, so a day key
-- means the same thing on both sides of the net calculation.
create view public.daily_intake
with (security_invoker = on) as
select
  m.user_id,
  ((m.logged_at at time zone coalesce(p.timezone, 'Asia/Kolkata')))::date as day,
  sum(m.calories) as eaten,
  count(*)::int as meal_count,
  max(m.logged_at) as last_logged_at
from public.meal_logs m
left join public.profiles p on p.id = m.user_id
group by m.user_id, ((m.logged_at at time zone coalesce(p.timezone, 'Asia/Kolkata')))::date;

comment on view public.daily_intake is
  'One row per user per local day: calories eaten and how many meals were logged.';

alter table public.profiles
  add column if not exists goal_weight_kg numeric(6, 2)
  check (goal_weight_kg > 0 and goal_weight_kg < 500);

comment on column public.profiles.goal_weight_kg is
  'Optional target weight, drawn as a reference line on the Trends weight chart.';

-- Trends reads a year of weight at a time; the existing table had no index for
-- an ordered range scan.
create index if not exists weight_logs_user_logged_at_idx
  on public.weight_logs (user_id, logged_at desc);
