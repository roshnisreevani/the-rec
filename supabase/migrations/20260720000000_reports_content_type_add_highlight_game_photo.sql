-- 'game_photo' was already used client-side (lib/moderation.ts ContentType)
-- but never added to this constraint, so reporting a game photo has been
-- silently failing. Also adding 'highlight' for the new highlight-clip
-- report button (app/highlight/[id].tsx).
alter table public.reports drop constraint if exists reports_content_type_check;
alter table public.reports add constraint reports_content_type_check
  check (content_type in ('post', 'comment', 'profile', 'message', 'game_photo', 'highlight'));
