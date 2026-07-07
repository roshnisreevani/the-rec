-- Banter (messaging) schema — conversations, membership, messages.
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Conversation types: 'dm' (two people), 'group' (auto-created thread for
-- every group), and 'event' (reserved — the app has no events feature yet,
-- but the column allows it so event chats can be added without a schema
-- change).
--
-- Who can message whom: DMs can only be started between users connected via
-- an accepted connection or a shared group (enforced in get_or_create_dm,
-- which is the only way to create a DM). Group threads mirror group
-- membership exactly, kept in sync by triggers on group_members.

-- 1. Conversations ----------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  conv_type text not null check (conv_type in ('dm', 'group', 'event')),
  group_id uuid unique references public.groups(id) on delete cascade,
  -- canonical "smallerUuid:largerUuid" for DMs so a pair can never get two threads
  dm_key text unique,
  created_at timestamptz not null default now(),
  check (conv_type <> 'group' or group_id is not null),
  check (conv_type <> 'dm' or dm_key is not null)
);

alter table public.conversations enable row level security;

-- 2. Conversation members (membership + per-user read state) ----------------

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on public.conversation_members (user_id);
create index if not exists conversation_members_conversation_idx on public.conversation_members (conversation_id);

alter table public.conversation_members enable row level security;

-- 3. Messages ----------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

alter table public.messages enable row level security;

-- 4. RLS helpers -------------------------------------------------------------
-- Same recursion-avoidance pattern as the groups schema: membership checks
-- inside policies must go through security-definer functions, never a
-- subquery on the table the policy guards.

create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$;

-- True when the conversation is a DM and either side has blocked the other —
-- used to stop new messages between blocked users at the database, not just
-- in the UI.
create or replace function public.is_dm_blocked_for(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members other
      on other.conversation_id = c.id and other.user_id <> p_user_id
    join public.blocked_users b
      on (b.blocker_id = p_user_id and b.blocked_id = other.user_id)
      or (b.blocker_id = other.user_id and b.blocked_id = p_user_id)
    where c.id = p_conversation_id and c.conv_type = 'dm'
  );
$$;

-- 5. RLS policies -------------------------------------------------------------

drop policy if exists "Members can view their conversations" on public.conversations;
create policy "Members can view their conversations"
  on public.conversations for select
  using ( public.is_conversation_member(id, auth.uid()) );

drop policy if exists "Members can view conversation membership" on public.conversation_members;
create policy "Members can view conversation membership"
  on public.conversation_members for select
  using ( public.is_conversation_member(conversation_id, auth.uid()) );

drop policy if exists "Users can update their own read state" on public.conversation_members;
create policy "Users can update their own read state"
  on public.conversation_members for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- No insert/delete policies on conversations or conversation_members: rows
-- are only created/removed through the security-definer functions and
-- triggers below (get_or_create_dm, group-membership sync).

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages"
  on public.messages for select
  using ( public.is_conversation_member(conversation_id, auth.uid()) );

drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id, auth.uid())
    and not public.is_dm_blocked_for(conversation_id, auth.uid())
  );

-- 6. Every group gets a Banter thread, membership kept in sync ---------------

-- Get-or-create so it's safe no matter which trigger fires first.
create or replace function public.ensure_group_conversation(p_group_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where group_id = p_group_id;
  if v_id is null then
    insert into public.conversations (conv_type, group_id)
    values ('group', p_group_id)
    on conflict (group_id) do nothing;
    select id into v_id from public.conversations where group_id = p_group_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.handle_group_member_added()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.conversation_members (conversation_id, user_id)
  values (public.ensure_group_conversation(new.group_id), new.user_id)
  on conflict (conversation_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_group_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = c.id
    and c.group_id = old.group_id
    and cm.user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists on_group_member_added_banter on public.group_members;
create trigger on_group_member_added_banter
  after insert on public.group_members
  for each row execute procedure public.handle_group_member_added();

drop trigger if exists on_group_member_removed_banter on public.group_members;
create trigger on_group_member_removed_banter
  after delete on public.group_members
  for each row execute procedure public.handle_group_member_removed();

-- Backfill threads for groups that already exist.
insert into public.conversations (conv_type, group_id)
select 'group', g.id
from public.groups g
where not exists (select 1 from public.conversations c where c.group_id = g.id);

insert into public.conversation_members (conversation_id, user_id)
select c.id, gm.user_id
from public.conversations c
join public.group_members gm on gm.group_id = c.group_id
where c.conv_type = 'group'
on conflict (conversation_id, user_id) do nothing;

-- 7. Starting a DM ------------------------------------------------------------
-- The only path that creates a DM. Enforces the "connected users only" rule:
-- an accepted connection or a shared group (an event link would be checked
-- here too, once events exist). Blocks in either direction refuse the DM.

create or replace function public.get_or_create_dm(p_other_user_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null or p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Invalid user.';
  end if;

  if exists (
    select 1 from public.blocked_users
    where (blocker_id = v_me and blocked_id = p_other_user_id)
       or (blocker_id = p_other_user_id and blocked_id = v_me)
  ) then
    raise exception 'You can''t message this user.';
  end if;

  if not exists (
    select 1 from public.connections
    where status = 'accepted'
      and user_a = least(v_me, p_other_user_id)
      and user_b = greatest(v_me, p_other_user_id)
  ) and not exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = v_me and theirs.user_id = p_other_user_id
  ) then
    raise exception 'You can only message people you share a connection or group with.';
  end if;

  v_key := least(v_me::text, p_other_user_id::text) || ':' || greatest(v_me::text, p_other_user_id::text);

  select id into v_id from public.conversations where dm_key = v_key;
  if v_id is null then
    insert into public.conversations (conv_type, dm_key)
    values ('dm', v_key)
    on conflict (dm_key) do nothing;
    select id into v_id from public.conversations where dm_key = v_key;

    insert into public.conversation_members (conversation_id, user_id)
    values (v_id, v_me), (v_id, p_other_user_id)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_id;
end;
$$;

-- 8. Inbox --------------------------------------------------------------------
-- One round trip for the whole inbox: every conversation the user is in,
-- with display title/avatar, the latest message, and the unread count.
-- DMs where either side blocked the other are dropped entirely.

create or replace function public.get_banter_inbox()
returns table (
  conversation_id uuid,
  conv_type text,
  group_id uuid,
  title text,
  avatar_url text,
  other_user_id uuid,
  last_message_text text,
  last_message_sender text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer set search_path = public
stable
as $$
  select
    c.id,
    c.conv_type,
    c.group_id,
    coalesce(case when c.conv_type = 'dm' then op.name else g.name end, 'Conversation'),
    case when c.conv_type = 'dm' then op.avatar_url else g.avatar_url end,
    op.id,
    lm.content,
    lmp.name,
    lm.created_at,
    (
      select count(*) from public.messages m
      where m.conversation_id = c.id
        and m.created_at > cm.last_read_at
        and m.sender_id <> auth.uid()
    )
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join public.groups g on g.id = c.group_id
  left join lateral (
    select cm2.user_id from public.conversation_members cm2
    where cm2.conversation_id = c.id and cm2.user_id <> auth.uid()
    limit 1
  ) other on c.conv_type = 'dm'
  left join public.profiles op on op.id = other.user_id
  left join lateral (
    select m.content, m.sender_id, m.created_at from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join public.profiles lmp on lmp.id = lm.sender_id
  where cm.user_id = auth.uid()
    and not (
      c.conv_type = 'dm'
      and exists (
        select 1 from public.blocked_users b
        where (b.blocker_id = auth.uid() and b.blocked_id = other.user_id)
           or (b.blocker_id = other.user_id and b.blocked_id = auth.uid())
      )
    )
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

-- 9. Messages are reportable ---------------------------------------------------

alter table public.reports drop constraint if exists reports_content_type_check;
alter table public.reports add constraint reports_content_type_check
  check (content_type in ('post', 'comment', 'profile', 'message'));
