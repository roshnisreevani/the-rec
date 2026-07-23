-- Fix 2: image attachments on Bulletin posts. Run once in the Supabase SQL
-- Editor: https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Confirmed storage model: a public bucket (matching every existing bucket
-- in this app — avatars, feed-media, etc.), not a private/RLS-gated one.
-- React Native's <Image uri> fetches storage URLs directly with no auth
-- header, so a private bucket would need per-render signed URLs, a new
-- pattern this app doesn't use anywhere. Upload is still restricted to
-- league commissioners via a folder-path check; "view" access is
-- effectively "anyone with the (unguessable) URL," the same privacy model
-- every other image in this app already has.

alter table public.league_announcements add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('bulletin-images', 'bulletin-images', true)
on conflict (id) do nothing;

-- Folder layout: bulletin-images/<league_id>/<file>. The league_id segment
-- is what the insert/delete policies check against is_league_commissioner.

drop policy if exists "Bulletin images are publicly readable" on storage.objects;
create policy "Bulletin images are publicly readable"
  on storage.objects for select
  using ( bucket_id = 'bulletin-images' );

drop policy if exists "Commissioners can upload bulletin images" on storage.objects;
create policy "Commissioners can upload bulletin images"
  on storage.objects for insert
  with check (
    bucket_id = 'bulletin-images'
    and public.is_league_commissioner((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists "Commissioners can delete bulletin images" on storage.objects;
create policy "Commissioners can delete bulletin images"
  on storage.objects for delete
  using (
    bucket_id = 'bulletin-images'
    and public.is_league_commissioner((storage.foldername(name))[1]::uuid, auth.uid())
  );
