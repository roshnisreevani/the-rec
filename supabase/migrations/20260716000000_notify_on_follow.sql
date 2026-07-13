-- Add "follow" notifications, matching the existing reaction/comment pattern.
-- The frontend (lib/notifications.ts NotificationType, app/notifications.tsx
-- icon/copy) already anticipated this type; only the DB side was missing.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('reaction', 'comment', 'follow'));

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, actor_id, related_content_id)
  values (new.followee_id, 'follow', new.follower_id, null);
  return new;
end;
$$;

drop trigger if exists trg_notify_on_follow on public.follows;
create trigger trg_notify_on_follow
after insert on public.follows
for each row execute function public.notify_on_follow();
