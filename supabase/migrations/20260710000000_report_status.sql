-- Adds a status column to reports so the Privacy & Safety screen has
-- something real to show per report. There's no moderation backend/admin
-- panel yet to actually change this, so every report will show "pending"
-- for now — that's honest given the current state of the app, not a bug.

alter table public.reports add column if not exists status text not null default 'pending'
  check (status in ('pending', 'reviewed', 'resolved'));
