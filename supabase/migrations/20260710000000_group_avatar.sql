-- Optional group profile picture, chosen when a group is created.
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Storage: reuses the existing public `avatars` bucket (see supabase/schema.sql).
-- The creator uploads the image under their own user-id folder, which the
-- existing avatar storage RLS policies already allow — no new bucket or
-- storage policies are needed here.

alter table public.groups add column if not exists avatar_url text;

-- get_group_invite_preview must also surface the avatar so the invite/join
-- screen can show it. Changing a function's return columns requires a drop
-- first — `create or replace` can't alter the return type in place.
drop function if exists public.get_group_invite_preview(text);
create or replace function public.get_group_invite_preview(p_code text)
returns table (
  group_id uuid,
  name text,
  description text,
  group_type text,
  privacy text,
  avatar_url text,
  member_count bigint
)
language sql
security definer set search_path = public
stable
as $$
  select g.id, g.name, g.description, g.group_type, g.privacy, g.avatar_url,
    (select count(*) from public.group_members gm where gm.group_id = g.id)
  from public.groups g
  join public.group_invites gi on gi.group_id = g.id
  where gi.code = p_code;
$$;
