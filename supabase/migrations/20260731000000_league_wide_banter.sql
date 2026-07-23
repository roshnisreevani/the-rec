-- Fix 3: Banter is now league-wide (any league member), replacing the
-- per-team scoping from 20260730000100_team_banter.sql entirely — not
-- supplementing it. Run once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Confirmed: existing per-team conversations/messages are deleted outright
-- (Team Banter just shipped, no meaningful history to preserve). Transport
-- stays polling, matching every other chat thread in this app — this
-- migration does not touch Realtime.

-- 1. Remove the team-scoped design entirely -----------------------------

-- Cascades to messages and conversation_members for these conversations.
delete from public.conversations where conv_type = 'team';

drop trigger if exists on_team_member_added_banter on public.team_members;
drop trigger if exists on_team_member_removed_banter on public.team_members;

drop function if exists public.handle_team_member_added();
drop function if exists public.handle_team_member_removed();
drop function if exists public.ensure_team_conversation(uuid);

-- Restore the original simple policies BEFORE dropping the commissioner-
-- override function below — the old policies still reference it, and
-- Postgres refuses to drop a function that a policy depends on. No
-- OR-clause needed for league-wide Banter — every league member gets a
-- conversation_members row via the trigger further down, same as 'group'.
drop policy if exists "Members can view their conversations" on public.conversations;
create policy "Members can view their conversations"
  on public.conversations for select
  using ( public.is_conversation_member(id, auth.uid()) );

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

drop function if exists public.is_league_commissioner_of_team_conversation(uuid, uuid);

alter table public.conversations drop constraint if exists conversations_team_check;
alter table public.conversations drop column if exists team_id;

-- 2. League-wide conversations --------------------------------------------

alter table public.conversations drop constraint if exists conversations_conv_type_check;
alter table public.conversations add constraint conversations_conv_type_check
  check (conv_type in ('dm', 'group', 'event', 'league'));

alter table public.conversations add column if not exists league_id uuid unique references public.leagues(id) on delete cascade;

alter table public.conversations drop constraint if exists conversations_league_check;
alter table public.conversations add constraint conversations_league_check
  check (conv_type <> 'league' or league_id is not null);

-- 3. Every league gets a Banter thread, membership kept in sync -----------
-- Mirrors ensure_group_conversation / handle_group_member_added(removed)
-- exactly, scoped to league_members instead of group_members.

create or replace function public.ensure_league_conversation(p_league_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where league_id = p_league_id;
  if v_id is null then
    insert into public.conversations (conv_type, league_id)
    values ('league', p_league_id)
    on conflict (league_id) do nothing;
    select id into v_id from public.conversations where league_id = p_league_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.handle_league_member_added()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.conversation_members (conversation_id, user_id)
  values (public.ensure_league_conversation(new.league_id), new.user_id)
  on conflict (conversation_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_league_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = c.id
    and c.league_id = old.league_id
    and cm.user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists on_league_member_added_banter on public.league_members;
create trigger on_league_member_added_banter
  after insert on public.league_members
  for each row execute procedure public.handle_league_member_added();

drop trigger if exists on_league_member_removed_banter on public.league_members;
create trigger on_league_member_removed_banter
  after delete on public.league_members
  for each row execute procedure public.handle_league_member_removed();

-- Backfill threads for leagues that already exist.
insert into public.conversations (conv_type, league_id)
select 'league', l.id
from public.leagues l
where not exists (select 1 from public.conversations c where c.league_id = l.id);

insert into public.conversation_members (conversation_id, user_id)
select c.id, lm.user_id
from public.conversations c
join public.league_members lm on lm.league_id = c.league_id
where c.conv_type = 'league'
on conflict (conversation_id, user_id) do nothing;
