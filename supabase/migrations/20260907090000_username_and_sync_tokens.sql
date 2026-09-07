-- Identity for machine callers (iOS Shortcuts) that cannot hold a Supabase JWT.

-- A handle for the user. profiles is already the one-row-per-user table keyed
-- by auth.users.id, so username belongs here rather than in a second table.
alter table public.profiles
  add column if not exists username text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (username is null or username ~ '^[a-z0-9_]{3,30}$');
  end if;
end
$$;

-- Case-insensitive uniqueness without needing the citext extension.
create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

comment on column public.profiles.username is
  'Lowercase handle, 3-30 chars of a-z, 0-9 and underscore.';

-- One row per issued sync credential. The raw token is shown to the user once
-- and never stored - only its SHA-256 hash, so a database leak does not hand
-- anyone a working credential.
create table if not exists public.sync_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Shortcut',
  -- Lowercase hex SHA-256 of the raw token.
  token_hash text not null unique,
  -- Leading characters of the raw token, so a row is identifiable in the UI.
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint sync_tokens_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.sync_tokens is
  'Per-user credentials for machine callers. Resolves an inbound sync to a user_id.';

create index if not exists sync_tokens_user_id_idx
  on public.sync_tokens (user_id)
  where revoked_at is null;

alter table public.sync_tokens enable row level security;

-- The owner manages their own tokens. The edge function reads this table with
-- the service-role key, which bypasses RLS entirely.
drop policy if exists "sync_tokens_select_own" on public.sync_tokens;
create policy "sync_tokens_select_own"
  on public.sync_tokens for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "sync_tokens_insert_own" on public.sync_tokens;
create policy "sync_tokens_insert_own"
  on public.sync_tokens for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "sync_tokens_update_own" on public.sync_tokens;
create policy "sync_tokens_update_own"
  on public.sync_tokens for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "sync_tokens_delete_own" on public.sync_tokens;
create policy "sync_tokens_delete_own"
  on public.sync_tokens for delete
  to authenticated
  using ((select auth.uid()) = user_id);
