-- Groups tab schema — groups, membership, and invites.
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Note: Feed's posts.group_id is still a plain text id matching
-- lib/groups-mock.ts (see feed_schema.sql) — wiring real posts to real groups
-- is a follow-up, not part of this migration.

-- 1. Groups ------------------------------------------------------------

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  group_type text not null default 'friend_group' check (group_type in ('friend_group', 'team', 'pickup_group', 'league')),
  privacy text not null default 'private' check (privacy in ('private', 'public')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

-- 2. Membership ----------------------------------------------------------

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_members_group_idx on public.group_members (group_id);
create index if not exists group_members_user_idx on public.group_members (user_id);

alter table public.group_members enable row level security;

-- 3. Direct invites (search + invite an existing app user) ---------------

create table if not exists public.group_invite_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (group_id, invited_user_id)
);

create index if not exists group_invite_members_invitee_idx on public.group_invite_members (invited_user_id, status);

alter table public.group_invite_members enable row level security;

-- 4. Shareable invite links -----------------------------------------------
-- One active link per group — regenerating just replaces the code.

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.groups(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.group_invites enable row level security;

-- 5. Join requests (from a private group's invite link) ------------------

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_join_requests_group_idx on public.group_join_requests (group_id, status);

alter table public.group_join_requests enable row level security;

-- 6. RLS policies ----------------------------------------------------------

-- Membership checks must NOT be written as a subquery on group_members inside
-- a group_members policy — Postgres re-applies the same policy to that
-- subquery and recurses forever (error 42P17). These security-definer helpers
-- read the table with RLS bypassed, which breaks the cycle. Every policy that
-- needs "is this user a member/owner of the group" goes through them.
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id and role = 'owner'
  );
$$;

-- groups: visible to members, plus anyone with a pending direct invite (so
-- they can see the group's name/description before accepting).
drop policy if exists "Members and invitees can view groups" on public.groups;
create policy "Members and invitees can view groups"
  on public.groups for select
  using (
    public.is_group_member(id, auth.uid())
    or exists (
      select 1 from public.group_invite_members gim
      where gim.group_id = groups.id and gim.invited_user_id = auth.uid() and gim.status = 'pending'
    )
  );

drop policy if exists "Users can create groups" on public.groups;
create policy "Users can create groups"
  on public.groups for insert
  with check ( auth.uid() = created_by );

drop policy if exists "Owners can update their group" on public.groups;
create policy "Owners can update their group"
  on public.groups for update
  using ( public.is_group_owner(id, auth.uid()) );

drop policy if exists "Owners can delete their group" on public.groups;
create policy "Owners can delete their group"
  on public.groups for delete
  using ( auth.uid() = created_by );

-- group_members: any current member can see the roster. Self-service inserts
-- require a pending direct invite (accepting one); invite-link joins and
-- join-request approvals go through the security-definer functions below.
-- Removal is self-service (leaving) or by an owner (kicking).
drop policy if exists "Members can view their group roster" on public.group_members;
create policy "Members can view their group roster"
  on public.group_members for select
  using ( public.is_group_member(group_id, auth.uid()) );

drop policy if exists "Users can join or be added by an owner" on public.group_members;
create policy "Users can join or be added by an owner"
  on public.group_members for insert
  with check (
    (
      auth.uid() = user_id
      and exists (
        select 1 from public.group_invite_members gim
        where gim.group_id = group_members.group_id and gim.invited_user_id = auth.uid() and gim.status = 'pending'
      )
    )
    or public.is_group_owner(group_id, auth.uid())
  );

drop policy if exists "Users can leave or be removed by an owner" on public.group_members;
create policy "Users can leave or be removed by an owner"
  on public.group_members for delete
  using (
    auth.uid() = user_id
    or public.is_group_owner(group_id, auth.uid())
  );

-- group_invite_members: visible to the inviter, the invitee, or any group
-- member (so the group's "pending invites" list can be shown).
drop policy if exists "Invite visible to inviter, invitee, or group" on public.group_invite_members;
create policy "Invite visible to inviter, invitee, or group"
  on public.group_invite_members for select
  using (
    auth.uid() = invited_by
    or auth.uid() = invited_user_id
    or public.is_group_member(group_id, auth.uid())
  );

drop policy if exists "Members can invite others" on public.group_invite_members;
create policy "Members can invite others"
  on public.group_invite_members for insert
  with check (
    auth.uid() = invited_by
    and public.is_group_member(group_id, auth.uid())
  );

drop policy if exists "Invitee can respond to their invite" on public.group_invite_members;
create policy "Invitee can respond to their invite"
  on public.group_invite_members for update
  using ( auth.uid() = invited_user_id )
  with check ( auth.uid() = invited_user_id );

drop policy if exists "Inviter or invitee can remove the invite" on public.group_invite_members;
create policy "Inviter or invitee can remove the invite"
  on public.group_invite_members for delete
  using ( auth.uid() = invited_by or auth.uid() = invited_user_id );

-- group_invites: only current members can view/manage the group's link.
-- Lookups by code (for someone who isn't a member yet) go through the
-- get_group_invite_preview / join_group_via_invite functions below instead.
drop policy if exists "Members can view their group's invite link" on public.group_invites;
create policy "Members can view their group's invite link"
  on public.group_invites for select
  using ( public.is_group_member(group_id, auth.uid()) );

drop policy if exists "Members can create an invite link" on public.group_invites;
create policy "Members can create an invite link"
  on public.group_invites for insert
  with check (
    auth.uid() = created_by
    and public.is_group_member(group_id, auth.uid())
  );

drop policy if exists "Members can regenerate their group's invite link" on public.group_invites;
create policy "Members can regenerate their group's invite link"
  on public.group_invites for update
  using ( public.is_group_member(group_id, auth.uid()) );

drop policy if exists "Members can delete their group's invite link" on public.group_invites;
create policy "Members can delete their group's invite link"
  on public.group_invites for delete
  using ( public.is_group_member(group_id, auth.uid()) );

-- group_join_requests: the requester and the group's owner can see a
-- request. Inserts/updates normally happen through join_group_via_invite /
-- respond_join_request (security definer, bypasses RLS) — these policies are
-- a defense-in-depth fallback, not the primary path.
drop policy if exists "Requester or owner can view join requests" on public.group_join_requests;
create policy "Requester or owner can view join requests"
  on public.group_join_requests for select
  using (
    auth.uid() = user_id
    or public.is_group_owner(group_id, auth.uid())
  );

drop policy if exists "Users can request to join" on public.group_join_requests;
create policy "Users can request to join"
  on public.group_join_requests for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Owner can respond to join requests" on public.group_join_requests;
create policy "Owner can respond to join requests"
  on public.group_join_requests for update
  using ( public.is_group_owner(group_id, auth.uid()) );

drop policy if exists "Requester can cancel their request" on public.group_join_requests;
create policy "Requester can cancel their request"
  on public.group_join_requests for delete
  using ( auth.uid() = user_id );

-- 7. Auto-add the creator as owner --------------------------------------

create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute procedure public.handle_new_group();

-- 8. Invite-link functions -------------------------------------------------
-- These two are security definer on purpose: someone holding a not-yet-a-
-- member invite code needs enough access to preview the group and join/
-- request it, which plain RLS on `groups`/`group_invites` can't grant
-- without also making those tables readable by anyone.

create or replace function public.get_group_invite_preview(p_code text)
returns table (
  group_id uuid,
  name text,
  description text,
  group_type text,
  privacy text,
  member_count bigint
)
language sql
security definer set search_path = public
stable
as $$
  select g.id, g.name, g.description, g.group_type, g.privacy,
    (select count(*) from public.group_members gm where gm.group_id = g.id)
  from public.groups g
  join public.group_invites gi on gi.group_id = g.id
  where gi.code = p_code;
$$;

create or replace function public.join_group_via_invite(p_code text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_group_id uuid;
  v_privacy text;
begin
  select g.id, g.privacy into v_group_id, v_privacy
  from public.groups g
  join public.group_invites gi on gi.group_id = g.id
  where gi.code = p_code;

  if v_group_id is null then
    raise exception 'This invite link is invalid or has expired.';
  end if;

  if exists (select 1 from public.group_members where group_id = v_group_id and user_id = auth.uid()) then
    return 'already_member';
  end if;

  if v_privacy = 'public' then
    insert into public.group_members (group_id, user_id, role) values (v_group_id, auth.uid(), 'member');
    return 'joined';
  else
    insert into public.group_join_requests (group_id, user_id, status)
    values (v_group_id, auth.uid(), 'pending')
    on conflict (group_id, user_id) do update set status = 'pending', created_at = now()
    where public.group_join_requests.status = 'declined';
    return 'requested';
  end if;
end;
$$;

create or replace function public.respond_join_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid;
begin
  select group_id, user_id into v_group_id, v_user_id
  from public.group_join_requests
  where id = p_request_id and status = 'pending';

  if v_group_id is null then
    raise exception 'That request was already handled.';
  end if;

  if not exists (select 1 from public.group_members where group_id = v_group_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the group owner can respond to join requests.';
  end if;

  if p_approve then
    insert into public.group_members (group_id, user_id, role) values (v_group_id, v_user_id, 'member')
    on conflict (group_id, user_id) do nothing;
    update public.group_join_requests set status = 'approved' where id = p_request_id;
  else
    update public.group_join_requests set status = 'declined' where id = p_request_id;
  end if;
end;
$$;
