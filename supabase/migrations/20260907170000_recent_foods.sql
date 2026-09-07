-- The "Log again" row on Home: the last few distinct foods a user has logged,
-- newest first, each carrying the exact quantity, unit, calories and meal tag
-- it was last logged with, so one tap reproduces the entry verbatim.
--
-- Grouped by lower(btrim(name)) rather than food_item_id. food_item_id is
-- nullable by design - it is on delete set null, and a one-off entry never had
-- one - so it is not a key that survives the two cases this list exists for.
-- name and calories are already the snapshot the timeline renders from, which
-- makes the name both the stable identity and the thing the user recognises.
-- Grouping by name also collapses a personal food shadowing a global one of the
-- same name into a single card.
--
-- distinct on deduplicates in the database rather than over-fetching rows and
-- thinning them in the client, where one food logged twenty times running would
-- push everything else past whatever limit the client guessed at. A view rather
-- than a function, so PostgREST applies the limit and so security_invoker keeps
-- the meal_logs policies in force - the same shape as daily_intake.

-- Lets the distinct on below run off the index instead of sorting the table.
create index if not exists meal_logs_user_name_logged_at_idx
  on public.meal_logs (user_id, lower(btrim(name)), logged_at desc);

comment on index public.meal_logs_user_name_logged_at_idx is
  'Serves the distinct on in recent_foods: one row per user per food, newest first.';

drop view if exists public.recent_foods;

create view public.recent_foods
with (security_invoker = on) as
select distinct on (m.user_id, lower(btrim(m.name)))
  m.user_id,
  lower(btrim(m.name)) as food_key,
  m.food_item_id,
  m.name,
  m.quantity,
  m.unit,
  m.calories,
  m.meal_tag,
  m.logged_at as last_logged_at
from public.meal_logs m
-- This ordering only decides which row wins per food. It does not survive an
-- outer query, so the caller still has to order by last_logged_at itself.
order by m.user_id, lower(btrim(m.name)), m.logged_at desc;

comment on view public.recent_foods is
  'One row per distinct food a user has logged, holding their most recent entry for it.';
