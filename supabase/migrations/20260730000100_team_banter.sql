-- Feature 2: Team Banter — extends the EXISTING conversations/messages
-- system (supabase/migrations/20260711000000_banter_schema.sql) with a
-- third conv_type, 'team', rather than a parallel team_banter_messages
-- table. Reuses the exact group_members -> conversation sync pattern for
-- team_members, and reuses app/chat/[id].tsx, its polling, and the
-- existing unread-count machinery wholesale — no new chat UI needed.
--
-- Commissioners/co-commissioners can read and post in ANY team's Banter in
-- their league without being a conversation_members row for every team —
-- granted via an RLS OR-clause (is_league_commissioner_of_team_conversation)
-- rather than backfilling membership rows, so promoting/demoting a
-- commissioner doesn't require touching conversation_members at all.
--
-- Team threads are intentionally NOT surfaced in the main Banter tab's
-- inbox (get_banter_inbox) — reachable only via a Banter button on the
-- Team screen, to avoid changing the shape of the existing Banter tab.
-- No per-message notification row is created, matching the existing
-- Groups Banter precedent exactly (no notification exists for a plain
-- message there either) — the unread badge is the only signal.

-- 1. Extend conversations for team threads -----------------------------------

alter table public.conversations drop constraint if exists conversations_conv_type_check;
alter table public.conversations add constraint conversations_conv_type_check
  check (conv_type in ('dm', 'group', 'event', 'team'));

alter table public.conversations add column if not exists team_id uuid unique references public.teams(id) on delete cascade;

alter table public.conversations drop constraint if exists conversations_team_check;
alter table public.conversations add constraint conversations_team_check
  check (conv_type <> 'team' or team_id is not null);

-- 2. Commissioner access helper ------------------------------------------------

create or replace function public.is_league_commissioner_of_team_conversation(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversations c
    join public.teams t on t.id = c.team_id
    where c.id = p_conversation_id
      and public.is_league_commissioner(t.league_id, p_user_id)
  );
$$;

-- 3. Extend RLS to include the commissioner override --------------------------
-- Recreated with the added OR-clause; everything else about these three
-- policies is unchanged from 20260711000000_banter_schema.sql.

drop policy if exists "Members can view their conversations" on public.conversations;
create policy "Members can view their conversations"
  on public.conversations for select
  using (
    public.is_conversation_member(id, auth.uid())
    or public.is_league_commissioner_of_team_conversation(id, auth.uid())
  );

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages"
  on public.messages for select
  using (
    public.is_conversation_member(conversation_id, auth.uid())
    or public.is_league_commissioner_of_team_conversation(conversation_id, auth.uid())
  );

drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and (
      public.is_conversation_member(conversation_id, auth.uid())
      or public.is_league_commissioner_of_team_conversation(conversation_id, auth.uid())
    )
    and not public.is_dm_blocked_for(conversation_id, auth.uid())
  );

-- 4. Every team gets a Banter thread, membership kept in sync -----------------
-- Mirrors ensure_group_conversation / handle_group_member_added(removed)
-- exactly, scoped to team_members instead of group_members.

create or replace function public.ensure_team_conversation(p_team_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where team_id = p_team_id;
  if v_id is null then
    insert into public.conversations (conv_type, team_id)
    values ('team', p_team_id)
    on conflict (team_id) do nothing;
    select id into v_id from public.conversations where team_id = p_team_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.handle_team_member_added()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.conversation_members (conversation_id, user_id)
  values (public.ensure_team_conversation(new.team_id), new.user_id)
  on conflict (conversation_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_team_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = c.id
    and c.team_id = old.team_id
    and cm.user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists on_team_member_added_banter on public.team_members;
create trigger on_team_member_added_banter
  after insert on public.team_members
  for each row execute procedure public.handle_team_member_added();

drop trigger if exists on_team_member_removed_banter on public.team_members;
create trigger on_team_member_removed_banter
  after delete on public.team_members
  for each row execute procedure public.handle_team_member_removed();

-- Backfill threads for teams that already exist.
insert into public.conversations (conv_type, team_id)
select 'team', t.id
from public.teams t
where not exists (select 1 from public.conversations c where c.team_id = t.id);

insert into public.conversation_members (conversation_id, user_id)
select c.id, tm.user_id
from public.conversations c
join public.team_members tm on tm.team_id = c.team_id
where c.conv_type = 'team'
on conflict (conversation_id, user_id) do nothing;
