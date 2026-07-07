-- Connections feature: connections table, plus small extensions to the
-- existing Feed moderation tables (reports/profiles) so Connections can
-- reuse them instead of building parallel ones.
--
-- Checked first: no `connections` or `mute`/`muted_users` table exists
-- anywhere in the live schema (confirmed via list_tables on the connected
-- Supabase project) or in prior migrations. Groups has its own real
-- `groups`/`group_members`/etc. tables now (built directly against the
-- live DB by the Groups teammate, not yet reflected in local migration
-- files) — unrelated to Connections, not touched here.

-- 1. Connections -----------------------------------------------------------
-- One row per pair, canonicalized so user_a < user_b (as text) — this keeps
-- a request from ever producing two rows (A->B and B->A) for the same pair.
-- `requested_by` (beyond the user_a/user_b/status the spec asked for) is
-- necessary to tell "received" from "sent" on the Requests screen.

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (user_a, user_b),
  check (user_a <> user_b),
  check (user_a < user_b)
);

create index if not exists connections_user_a_idx on public.connections (user_a);
create index if not exists connections_user_b_idx on public.connections (user_b);

alter table public.connections enable row level security;

drop policy if exists "Involved users can view their connections" on public.connections;
create policy "Involved users can view their connections"
  on public.connections for select
  using ( auth.uid() = user_a or auth.uid() = user_b );

drop policy if exists "Users can send a connection request" on public.connections;
create policy "Users can send a connection request"
  on public.connections for insert
  with check (
    auth.uid() = requested_by
    and (auth.uid() = user_a or auth.uid() = user_b)
  );

drop policy if exists "Recipient can accept a pending request" on public.connections;
create policy "Recipient can accept a pending request"
  on public.connections for update
  using (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() <> requested_by
  )
  with check (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() <> requested_by
  );

-- Covers decline (recipient), cancel (requester), and disconnect (either
-- party on an already-accepted connection) — all just remove the row.
drop policy if exists "Involved users can remove a connection" on public.connections;
create policy "Involved users can remove a connection"
  on public.connections for delete
  using ( auth.uid() = user_a or auth.uid() = user_b );

-- 2. Reuse reports: add 'profile' as a reportable content_type and
-- 'fake_profile' as a reason, alongside the existing post/comment values.

alter table public.reports drop constraint if exists reports_content_type_check;
alter table public.reports add constraint reports_content_type_check
  check (content_type in ('post', 'comment', 'profile'));

alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('spam', 'harassment', 'inappropriate', 'fake_profile', 'other'));

-- 3. Privacy setting: who can send you a connection request ----------------

alter table public.profiles add column if not exists allow_connection_requests boolean not null default true;
