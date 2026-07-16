-- Message delete (for everyone / for me) + read-receipt support.
--
-- Read receipts reuse the existing conversation_members.last_read_at —
-- "seen by" for a given message is just "every other member whose
-- last_read_at is at or after that message's created_at".

-- 1. Delete for everyone: sender can soft-delete their own message. Content
--    is cleared client-side display (kept in DB for moderation/audit, but
--    the UI always shows a placeholder once deleted_at is set).
alter table public.messages add column if not exists deleted_at timestamptz;

drop policy if exists "Senders can delete their own message" on public.messages;
create policy "Senders can delete their own message"
  on public.messages for update
  using ( auth.uid() = sender_id )
  with check ( auth.uid() = sender_id );

-- 2. Delete for me: a per-user hide, doesn't affect anyone else's view.
create table if not exists public.message_deletions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_deletions enable row level security;

drop policy if exists "Users can hide messages for themselves" on public.message_deletions;
create policy "Users can hide messages for themselves"
  on public.message_deletions for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can view their own hidden messages" on public.message_deletions;
create policy "Users can view their own hidden messages"
  on public.message_deletions for select
  using ( auth.uid() = user_id );
