import { supabase } from '@/lib/supabase';

export type ContentType = 'post' | 'comment' | 'profile';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'fake_profile' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

export type BlockedUser = {
  blockedId: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type MyReport = {
  id: string;
  contentType: ContentType;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
};

export async function reportContent(
  reporterId: string,
  contentType: ContentType,
  contentId: string,
  reason: ReportReason
): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    content_type: contentType,
    content_id: contentId,
    reason,
  });
  if (error) throw error;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('blocked_users').upsert(
    { blocker_id: blockerId, blocked_id: blockedId },
    { onConflict: 'blocker_id,blocked_id' }
  );
  if (error) throw error;

  // Blocking severs any existing connection between the two users. Best
  // effort — a failed cleanup here shouldn't undo the block itself, and the
  // connection is harmless to leave behind since both users' clients will
  // hide each other everywhere once blocked_users filtering kicks in.
  try {
    const [userA, userB] = blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId];
    await supabase.from('connections').delete().eq('user_a', userA).eq('user_b', userB);
  } catch (e) {
    console.warn('[moderation] could not remove connection after block:', e);
  }
}

/**
 * IDs of everyone the given user has blocked. Feed's fetchFeed()/
 * fetchComments() filter their results against this so blocked authors'
 * content silently disappears going forward.
 *
 * Fails soft (returns []) rather than throwing: this runs on every single
 * feed/comments load, so if the blocked_users table hasn't been created yet
 * (or a request hiccups) it should never be able to take down the whole
 * feed — worst case you just briefly see a blocked user's post again.
 */
export async function fetchBlockedUserIds(userId: string | undefined): Promise<string[]> {
  if (!userId) return [];

  try {
    const { data, error } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId);
    if (error) throw error;
    return (data ?? []).map((row) => row.blocked_id as string);
  } catch (e) {
    console.warn('[moderation] could not fetch blocked users (has the moderation migration been run?):', e);
    return [];
  }
}

/**
 * Union of "people I've blocked" and "people who've blocked me" — used by
 * Connections (search results, profile viewing, sending requests) since a
 * block should hide people from each other mutually, not just one direction.
 * Feed's fetchBlockedUserIds() above stays unidirectional on purpose (that
 * behavior already shipped and isn't part of this change). Fails soft, same
 * reasoning as fetchBlockedUserIds.
 */
export async function fetchBlockedEitherDirection(userId: string | undefined): Promise<string[]> {
  if (!userId) return [];

  try {
    const [{ data: iBlocked, error: e1 }, { data: blockedMe, error: e2 }] = await Promise.all([
      supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
      supabase.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const ids = new Set<string>();
    (iBlocked ?? []).forEach((row) => ids.add(row.blocked_id as string));
    (blockedMe ?? []).forEach((row) => ids.add(row.blocker_id as string));
    return Array.from(ids);
  } catch (e) {
    console.warn('[moderation] could not fetch mutual block list:', e);
    return [];
  }
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

/** Full list of people the given user has blocked, for the Privacy & Safety screen. */
export async function fetchMyBlockedUsers(userId: string): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id, created_at, blocked:profiles!blocked_users_blocked_id_fkey(name, avatar_url)')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    blocked_id: string;
    created_at: string;
    blocked: { name: string | null; avatar_url: string | null } | null;
  }>).map((row) => ({
    blockedId: row.blocked_id,
    name: row.blocked?.name?.trim() || 'Nameless legend',
    avatarUrl: row.blocked?.avatar_url ?? null,
    createdAt: row.created_at,
  }));
}

/**
 * Reports the current user has filed, for the Privacy & Safety screen. Just
 * the report metadata (type/reason/status) — content_id is polymorphic
 * (could point at a post, comment, or profile), so resolving it back to the
 * actual content isn't attempted here, matching this screen's simple scope.
 */
export async function fetchMyReports(userId: string): Promise<MyReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('id, content_type, reason, status, created_at')
    .eq('reporter_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    content_type: ContentType;
    reason: ReportReason;
    status: ReportStatus;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    contentType: row.content_type,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  }));
}
