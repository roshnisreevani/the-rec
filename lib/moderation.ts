import { supabase } from '@/lib/supabase';

export type ContentType = 'post' | 'comment';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';

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
