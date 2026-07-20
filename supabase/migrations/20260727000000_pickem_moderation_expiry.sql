-- Pick'Em moderation + optional voting deadline.
-- Run once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Delete needs no change — 20260726000000_pickem.sql already restricts it to
-- the creator or the group owner, and every child table (participants,
-- votes, comments, comment likes) is ON DELETE CASCADE.

-- 1. Reports: allow reporting a Pick'Em, add the new reasons + free text ----
-- Reuses the shared `reports` table (posts/comments/profiles/messages/etc.)
-- rather than a parallel pick'em-only table. Its RLS already lets a user
-- insert their own reports and read ONLY their own.

alter table public.reports drop constraint if exists reports_content_type_check;
alter table public.reports add constraint reports_content_type_check
  check (content_type in ('post', 'comment', 'profile', 'message', 'game_photo', 'highlight', 'pick_em'));

alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('spam', 'harassment', 'hate_speech', 'inappropriate', 'misinformation', 'fake_profile', 'other'));

-- Free-text detail, used when the reason is "other".
alter table public.reports add column if not exists details text;

-- One report per person per item — a repeat report upserts instead of piling
-- up duplicates.
create unique index if not exists reports_unique_per_content
  on public.reports (reporter_id, content_type, content_id);

-- 2. Optional voting deadline on a Pick'Em -----------------------------------
-- Null = no deadline (all existing Pick'Ems), so nothing breaks.

alter table public.pick_ems add column if not exists expires_at timestamptz;

-- 3. Enforce the deadline on votes at the database ---------------------------
-- An RLS clause, not a CHECK constraint: a constraint on pick_em_votes can't
-- read the parent's expires_at, so the cutoff has to live in the policy.
-- Recreates the two vote-write policies from 20260726000000 with the added
-- `now() < expires_at` condition; everything else about them is unchanged.

drop policy if exists "Members can vote" on public.pick_em_votes;
create policy "Members can vote"
  on public.pick_em_votes for insert
  with check (
    auth.uid() = voter_id
    and exists (
      select 1 from public.pick_ems pe
      where pe.id = pick_em_id
        and public.is_group_member(pe.group_id, auth.uid())
        and (pe.expires_at is null or now() < pe.expires_at)
    )
    and not public.is_pickem_participant(pick_em_id, auth.uid())
  );

drop policy if exists "Voters can change their vote" on public.pick_em_votes;
create policy "Voters can change their vote"
  on public.pick_em_votes for update
  using ( auth.uid() = voter_id )
  with check (
    auth.uid() = voter_id
    and exists (
      select 1 from public.pick_ems pe
      where pe.id = pick_em_id
        and public.is_group_member(pe.group_id, auth.uid())
        and (pe.expires_at is null or now() < pe.expires_at)
    )
    and not public.is_pickem_participant(pick_em_id, auth.uid())
  );
