-- Private accounts: private by default, matching the spec ("private by
-- default"). When true, another user's profile screen shows only name +
-- avatar + "Connect to see more" unless the viewer has an accepted
-- connection with this user.
alter table public.profiles
  add column if not exists is_private boolean not null default true;

-- Private per-connection notes. Each row is a note the author wrote about
-- someone they're connected to (e.g. "guards me every game") — visible only
-- to the author, never to the subject or anyone else. Deliberately NOT tied
-- to a specific connections.id (connections can be removed/re-created; the
-- note should survive a disconnect/reconnect cycle), so it's keyed directly
-- on (author_id, other_user_id) instead.
create table if not exists public.connection_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  other_user_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, other_user_id),
  check (author_id <> other_user_id)
);

alter table public.connection_notes enable row level security;

-- Strictly author-only in every direction — the whole point of this table
-- is that the note is never visible to its subject.
create policy "connection_notes_select_own" on public.connection_notes
  for select using (auth.uid() = author_id);

create policy "connection_notes_insert_own" on public.connection_notes
  for insert with check (auth.uid() = author_id);

create policy "connection_notes_update_own" on public.connection_notes
  for update using (auth.uid() = author_id);

create policy "connection_notes_delete_own" on public.connection_notes
  for delete using (auth.uid() = author_id);
