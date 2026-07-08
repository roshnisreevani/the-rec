import { supabase } from '@/lib/supabase';

export type NotificationType = 'reaction' | 'comment';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  actorId: string | null;
  actorName: string;
  actorAvatarUrl: string | null;
  relatedPostId: string | null;
  read: boolean;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  related_content_id: string | null;
  read: boolean;
  created_at: string;
  actor: { name: string | null; avatar_url: string | null } | null;
};

/**
 * Recent activity on your stuff — reactions and comments on your posts,
 * most recent first. Rows are populated entirely by Postgres triggers on
 * post_reactions/post_comments (see the notifications migration), never by
 * application code, so this file is read/mark-as-read only.
 */
export async function fetchNotifications(userId: string): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, actor_id, related_content_id, read, created_at, actor:profiles!notifications_actor_id_fkey(name, avatar_url)')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  return ((data ?? []) as unknown as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    actorId: row.actor_id,
    actorName: row.actor?.name?.trim() || 'Someone',
    actorAvatarUrl: row.actor?.avatar_url ?? null,
    relatedPostId: row.related_content_id,
    read: row.read,
    createdAt: row.created_at,
  }));
}

export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('read', false);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', userId)
    .eq('read', false);
  if (error) throw error;
}
