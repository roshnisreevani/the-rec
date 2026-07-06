-- Lets a post's author delete ANY comment on their own post, not just
-- comments they personally wrote — same as Instagram-style comment
-- moderation. This is an additional permissive policy alongside the
-- existing "Users can delete their own comments" policy from
-- 20260706000000_feed_schema.sql; Postgres RLS OR's multiple permissive
-- policies for the same command together, so a delete succeeds if EITHER
-- policy allows it.

drop policy if exists "Post authors can delete comments on their own posts" on public.post_comments;
create policy "Post authors can delete comments on their own posts"
  on public.post_comments for delete
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_comments.post_id
      and posts.author_id = auth.uid()
    )
  );
