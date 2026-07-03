-- The Rec — Profile tab schema
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new

-- 1. Profiles table -----------------------------------------------------

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null default '',
  location text not null default '',
  sport_tags text[] not null default '{}',
  legend text not null default '',
  walkup_song_title text,
  walkup_song_artist text,
  walkup_song_artwork_url text,
  walkup_song_preview_url text,
  pick_three jsonb not null default '[]'::jsonb,
  avatar_url text,
  trophies jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Safe to re-run: adds the new columns if you already ran an earlier version
-- of this script before the profile photo / freeform trophy case features existed.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists trophies jsonb not null default '[]'::jsonb;

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using ( true );

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ( auth.uid() = id );

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- Optional but recommended: auto-create a blank profile row the moment
-- someone signs up, so the app never has to guess whether a row exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, '')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Storage bucket for "Pick Your 3" photos -----------------------------

insert into storage.buckets (id, name, public)
values ('pick-three', 'pick-three', true)
on conflict (id) do nothing;

drop policy if exists "Pick Three photos are publicly readable" on storage.objects;
create policy "Pick Three photos are publicly readable"
  on storage.objects for select
  using ( bucket_id = 'pick-three' );

drop policy if exists "Users can upload their own Pick Three photos" on storage.objects;
create policy "Users can upload their own Pick Three photos"
  on storage.objects for insert
  with check (
    bucket_id = 'pick-three'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own Pick Three photos" on storage.objects;
create policy "Users can update their own Pick Three photos"
  on storage.objects for update
  using (
    bucket_id = 'pick-three'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own Pick Three photos" on storage.objects;
create policy "Users can delete their own Pick Three photos"
  on storage.objects for delete
  using (
    bucket_id = 'pick-three'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Notes:
-- * Photos are uploaded to paths like "<user id>/<timestamp>-<n>.jpg", which is
--   what makes the "own folder" policies above work.
-- * The bucket is public-read so profile photos can be displayed with a plain
--   URL. Only the owner (matched by auth.uid()) can write/update/delete inside
--   their own folder.

-- 3. Storage bucket for profile photos (the avatar circle) ----------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
