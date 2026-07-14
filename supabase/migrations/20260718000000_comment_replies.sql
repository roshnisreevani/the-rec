-- Threaded comment replies (one level, Instagram-style): a reply is just a
-- comment whose parent_comment_id points at a top-level comment.
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Deleting a parent comment cascades its replies. Existing RLS already
-- covers replies (they're rows in post_comments like any other comment,
-- including the visible-with-their-post policy from
-- 20260717000000_group_post_privacy.sql).

alter table public.post_comments
  add column if not exists parent_comment_id uuid references public.post_comments(id) on delete cascade;

create index if not exists post_comments_parent_idx on public.post_comments (parent_comment_id);
