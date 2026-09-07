-- Better fuzzy matching for the food search box.
--
-- The previous version used the % operator, which scores two whole strings
-- against each other: a short query like "chick" against "Chicken + rice bowl"
-- scored far below the threshold and returned nothing. word_similarity (<%)
-- instead asks whether the query matches some WORD inside the name, which is
-- what a search box actually means. The threshold is loosened from the 0.6
-- default so mild typos still land. The threshold is compared explicitly
-- rather than via the <% operator, because Supabase does not grant permission
-- to set pg_trgm.word_similarity_threshold on a function.

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
  with q as (select btrim(coalesce(query, '')) as term)
  select
    f.id,
    f.name,
    f.default_unit,
    f.calories_per_unit,
    (f.user_id is not null) as is_personal
  from public.food_items f, q
  where
    q.term = ''
    or f.name ilike '%' || q.term || '%'
    or word_similarity(q.term, f.name) >= 0.35
  order by
    -- Own foods first: you re-eat these, global rows are cold-start filler.
    (f.user_id is not null) desc,
    -- Exact prefix beats a fuzzy hit.
    (f.name ilike q.term || '%') desc,
    word_similarity(q.term, f.name) desc,
    f.name asc
  limit least(coalesce(max_results, 10), 50);
$$;

comment on function public.search_foods is
  'Word-trigram search over visible foods, personal items ranked first.';
