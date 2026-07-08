-- Notifications: recent activity feed (reactions + comments on your posts).
-- Trophy notifications were explicitly deferred — trophies are a JSONB
-- array on profiles.trophies (self-added only, no "someone else awards you
-- a trophy" feature exists), so there's no real actor for that case yet.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('reaction', 'comment')),
  actor_id uuid references public.profiles(id) on delete set null,
  related_content_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = recipient_id);

create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = recipient_id);

-- Deliberately no insert/delete policy for regular users — rows are only
-- ever created by the SECURITY DEFINER trigger functions below, never
-- directly by clients. This is populated by triggers, not application code,
-- per spec (feed.tsx/banter.tsx/groups.tsx stay untouched).

create or replace function public.notify_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id from public.posts where id = new.post_id;
  if v_author_id is not null and v_author_id <> new.user_id then
    insert into public.notifications (recipient_id, type, actor_id, related_content_id)
    values (v_author_id, 'reaction', new.user_id, new.post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_reaction on public.post_reactions;
create trigger trg_notify_on_reaction
after insert on public.post_reactions
for each row execute function public.notify_on_reaction();

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id from public.posts where id = new.post_id;
  if v_author_id is not null and v_author_id <> new.user_id then
    insert into public.notifications (recipient_id, type, actor_id, related_content_id)
    values (v_author_id, 'comment', new.user_id, new.post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_comment on public.post_comments;
create trigger trg_notify_on_comment
after insert on public.post_comments
for each row execute function public.notify_on_comment();
