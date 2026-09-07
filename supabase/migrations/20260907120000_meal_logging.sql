-- Meal logging: a catalogue of foods and a log of what was eaten.
--
-- Written from scratch: food_items and meal_logs did not previously exist.

-- Trigram search is needed from day one, since search is live from the first
-- keystroke. Supabase keeps extensions out of public.
create extension if not exists pg_trgm with schema extensions;
set search_path = public, extensions;

-- A food and its calories per unit. user_id null means a shared/global item;
-- a row owned by a user is their own private entry.
create table if not exists public.food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  default_unit text not null default 'serving',
  calories_per_unit numeric(8, 2) not null check (calories_per_unit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.food_items is
  'Food catalogue. user_id null = global item visible to everyone.';

-- Stops the same food being added twice, per user and globally.
create unique index if not exists food_items_user_name_key
  on public.food_items (user_id, lower(name)) where user_id is not null;
create unique index if not exists food_items_global_name_key
  on public.food_items (lower(name)) where user_id is null;

create index if not exists food_items_name_trgm_idx
  on public.food_items using gin (name gin_trgm_ops);

drop trigger if exists food_items_set_updated_at on public.food_items;
create trigger food_items_set_updated_at
  before update on public.food_items
  for each row execute function public.set_updated_at();

alter table public.food_items enable row level security;

-- Everyone reads global items plus their own; nobody can write a global item.
drop policy if exists "food_items_select_visible" on public.food_items;
create policy "food_items_select_visible"
  on public.food_items for select
  to authenticated
  using (user_id is null or user_id = (select auth.uid()));

drop policy if exists "food_items_insert_own" on public.food_items;
create policy "food_items_insert_own"
  on public.food_items for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "food_items_update_own" on public.food_items;
create policy "food_items_update_own"
  on public.food_items for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "food_items_delete_own" on public.food_items;
create policy "food_items_delete_own"
  on public.food_items for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- One row per thing eaten. calories and name are SNAPSHOTS taken at log time:
-- editing or deleting the food later must not rewrite history, and the home
-- timeline can render from this table alone with no join.
create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_item_id uuid references public.food_items (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  quantity numeric(7, 2) not null check (quantity > 0),
  unit text not null default 'serving',
  calories numeric(8, 2) not null check (calories >= 0),
  meal_tag text not null check (meal_tag in ('breakfast', 'lunch', 'dinner', 'snack')),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.meal_logs is
  'What was eaten. name and calories are snapshots, independent of food_items.';

create index if not exists meal_logs_user_logged_at_idx
  on public.meal_logs (user_id, logged_at desc);

alter table public.meal_logs enable row level security;

drop policy if exists "meal_logs_select_own" on public.meal_logs;
create policy "meal_logs_select_own"
  on public.meal_logs for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "meal_logs_insert_own" on public.meal_logs;
create policy "meal_logs_insert_own"
  on public.meal_logs for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "meal_logs_update_own" on public.meal_logs;
create policy "meal_logs_update_own"
  on public.meal_logs for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "meal_logs_delete_own" on public.meal_logs;
create policy "meal_logs_delete_own"
  on public.meal_logs for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Ranked search. Runs as the caller so RLS decides what is visible, and ranks
-- the user's own foods above global ones - you re-eat your own food, global
-- rows are cold-start filler.
create or replace function public.search_foods(query text, max_results int default 10)
returns table (
  id uuid,
  name text,
  default_unit text,
  calories_per_unit numeric,
  is_personal boolean
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    f.id,
    f.name,
    f.default_unit,
    f.calories_per_unit,
    (f.user_id is not null) as is_personal
  from public.food_items f
  where
    btrim(coalesce(query, '')) = ''
    or f.name ilike '%' || btrim(query) || '%'
    or f.name % btrim(query)
  order by
    (f.user_id is not null) desc,
    similarity(f.name, btrim(coalesce(query, ''))) desc,
    f.name asc
  limit least(coalesce(max_results, 10), 50);
$$;

comment on function public.search_foods is
  'Trigram + prefix search over visible foods, personal items ranked first.';
