import type { CommentApi } from '@/components/feed/comments-section';
import { fetchBlockedUserIds, reportContent, type ReportReason } from '@/lib/moderation';
import { type Comment } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

export type PickEmSide = 'a' | 'b';

export type PickEmPerson = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export type PickEm = {
  id: string;
  groupId: string;
  createdBy: string;
  createdByName: string;
  title: string | null;
  createdAt: string;
  expiresAt: string | null; // null = voting never closes
  sideA: PickEmPerson[];
  sideB: PickEmPerson[];
  votesA: number;
  votesB: number;
  myVote: PickEmSide | null;
  amParticipant: boolean; // participants can't vote on their own matchup
};

type ParticipantRow = {
  pick_em_id: string;
  user_id: string;
  side: PickEmSide;
  profile: { name: string | null; avatar_url: string | null } | null;
};

type VoteRow = { pick_em_id: string; voter_id: string; side: PickEmSide };

/** Voting is closed once the deadline has passed. The database enforces the
 * same rule on vote writes (see the pickem moderation/expiry migration);
 * this is the client-side mirror for immediate UI feedback. */
export function isExpired(pickEm: Pick<PickEm, 'expiresAt'>): boolean {
  return pickEm.expiresAt !== null && new Date(pickEm.expiresAt).getTime() <= Date.now();
}

export function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' }
  )}`;
}

function toPerson(r: ParticipantRow): PickEmPerson {
  return {
    userId: r.user_id,
    name: r.profile?.name?.trim() || 'Nameless legend',
    avatarUrl: r.profile?.avatar_url ?? null,
  };
}

/** All of a group's Pick'Ems, newest first, with participants and live tallies.
 * RLS restricts everything to group members. */
export async function fetchGroupPickEms(groupId: string, userId: string): Promise<PickEm[]> {
  const { data: pickEmRows, error } = await supabase
    .from('pick_ems')
    .select(
      'id, group_id, created_by, title, created_at, expires_at, creator:profiles!pick_ems_created_by_fkey(name)'
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const pickEms = (pickEmRows ?? []) as unknown as {
    id: string;
    group_id: string;
    created_by: string;
    title: string | null;
    created_at: string;
    expires_at: string | null;
    creator: { name: string | null } | null;
  }[];
  if (pickEms.length === 0) return [];

  const ids = pickEms.map((p) => p.id);
  const [partRes, voteRes] = await Promise.all([
    supabase
      .from('pick_em_participants')
      .select('pick_em_id, user_id, side, profile:profiles!pick_em_participants_user_id_fkey(name, avatar_url)')
      .in('pick_em_id', ids),
    supabase.from('pick_em_votes').select('pick_em_id, voter_id, side').in('pick_em_id', ids),
  ]);
  if (partRes.error) throw partRes.error;
  if (voteRes.error) throw voteRes.error;

  const participants = (partRes.data ?? []) as unknown as ParticipantRow[];
  const votes = (voteRes.data ?? []) as VoteRow[];

  return pickEms.map((p) => {
    const parts = participants.filter((r) => r.pick_em_id === p.id);
    const myVoteRow = votes.find((v) => v.pick_em_id === p.id && v.voter_id === userId);
    const pickEmVotes = votes.filter((v) => v.pick_em_id === p.id);
    return {
      id: p.id,
      groupId: p.group_id,
      createdBy: p.created_by,
      createdByName: p.creator?.name?.trim() || 'Nameless legend',
      title: p.title,
      createdAt: p.created_at,
      expiresAt: p.expires_at,
      sideA: parts.filter((r) => r.side === 'a').map(toPerson),
      sideB: parts.filter((r) => r.side === 'b').map(toPerson),
      votesA: pickEmVotes.filter((v) => v.side === 'a').length,
      votesB: pickEmVotes.filter((v) => v.side === 'b').length,
      myVote: myVoteRow?.side ?? null,
      amParticipant: parts.some((r) => r.user_id === userId),
    };
  });
}

/** Create a matchup and seed both sides. Any group member may create one
 * (enforced by RLS). `sideA`/`sideB` are member user ids; the two must not
 * overlap and each side needs at least one member. */
export async function createPickEm(input: {
  groupId: string;
  createdBy: string;
  title: string | null;
  sideA: string[];
  sideB: string[];
  expiresAt?: Date | null; // optional voting deadline
}): Promise<string> {
  const { data, error } = await supabase
    .from('pick_ems')
    .insert({
      group_id: input.groupId,
      created_by: input.createdBy,
      title: input.title,
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const pickEmId = data.id as string;
  const rows = [
    ...input.sideA.map((userId) => ({ pick_em_id: pickEmId, user_id: userId, side: 'a' as const })),
    ...input.sideB.map((userId) => ({ pick_em_id: pickEmId, user_id: userId, side: 'b' as const })),
  ];
  const { error: partError } = await supabase.from('pick_em_participants').insert(rows);
  if (partError) throw partError;

  return pickEmId;
}

/** Delete a matchup. RLS allows only the creator or the group owner; the
 * participants, votes, comments, and comment likes cascade away with it. */
export async function deletePickEm(pickEmId: string): Promise<void> {
  const { error } = await supabase.from('pick_ems').delete().eq('id', pickEmId);
  if (error) throw error;
}

/** Reports a Pick'Em (reuses the shared `reports` table used across the
 * app). Only visible to the reporter and admins reviewing reports directly
 * in the database — filing a report never hides or removes the matchup. */
export async function reportPickEm(
  reporterId: string,
  pickEmId: string,
  reason: ReportReason,
  details?: string | null
): Promise<void> {
  await reportContent(reporterId, 'pick_em', pickEmId, reason, details);
}

/** Cast or change the current user's vote. RLS refuses votes from the
 * matchup's own participants, and after the deadline has passed. */
export async function votePickEm(pickEmId: string, voterId: string, side: PickEmSide): Promise<void> {
  const { error } = await supabase
    .from('pick_em_votes')
    .upsert({ pick_em_id: pickEmId, voter_id: voterId, side }, { onConflict: 'pick_em_id,voter_id' });
  if (error) throw error;
}

// ---- Comment ops for CommentsSection (mirror lib/posts, on pick_em_* tables) ----

async function fetchPickEmComments(pickEmId: string, currentUserId?: string): Promise<Comment[]> {
  const [{ data, error }, blockedIds] = await Promise.all([
    supabase
      .from('pick_em_comments')
      .select('*, author:profiles(name, avatar_url), likes:pick_em_comment_likes(user_id)')
      .eq('pick_em_id', pickEmId)
      .order('created_at', { ascending: true }),
    fetchBlockedUserIds(currentUserId),
  ]);
  if (error) throw error;

  const blocked = new Set(blockedIds);
  return ((data ?? []) as unknown as Array<{
    id: string;
    pick_em_id: string;
    user_id: string;
    body: string;
    parent_comment_id: string | null;
    created_at: string;
    author: { name: string | null; avatar_url: string | null } | null;
    likes: { user_id: string }[] | null;
  }>)
    .filter((row) => !blocked.has(row.user_id))
    .map((row) => ({
      id: row.id,
      postId: row.pick_em_id, // the Comment type's generic parent-id slot
      authorId: row.user_id,
      authorName: row.author?.name?.trim() || 'Nameless legend',
      authorAvatarUrl: row.author?.avatar_url ?? null,
      body: row.body,
      parentCommentId: row.parent_comment_id ?? null,
      createdAt: row.created_at,
      likeCount: row.likes?.length ?? 0,
      likedByMe: !!currentUserId && (row.likes ?? []).some((l) => l.user_id === currentUserId),
    }));
}

async function addPickEmComment(
  pickEmId: string,
  userId: string,
  body: string,
  parentCommentId?: string | null
): Promise<void> {
  const { error } = await supabase.from('pick_em_comments').insert({
    pick_em_id: pickEmId,
    user_id: userId,
    body: body.trim(),
    parent_comment_id: parentCommentId ?? null,
  });
  if (error) throw error;
}

async function deletePickEmComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('pick_em_comments').delete().eq('id', commentId);
  if (error) throw error;
}

async function setPickEmCommentLike(commentId: string, userId: string, next: boolean): Promise<void> {
  if (next) {
    const { error } = await supabase
      .from('pick_em_comment_likes')
      .upsert({ comment_id: commentId, user_id: userId }, { onConflict: 'comment_id,user_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('pick_em_comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

/** The injectable comment API that makes CommentsSection operate on a
 * Pick'Em instead of a post. */
export const PICK_EM_COMMENT_API: CommentApi = {
  fetch: fetchPickEmComments,
  add: addPickEmComment,
  remove: deletePickEmComment,
  like: setPickEmCommentLike,
};
