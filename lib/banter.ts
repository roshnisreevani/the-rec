import { supabase } from '@/lib/supabase';

export type ConversationType = 'dm' | 'group' | 'event';

export type InboxItem = {
  conversationId: string;
  type: ConversationType;
  groupId: string | null;
  title: string;
  avatarUrl: string | null;
  otherUserId: string | null;
  lastMessageText: string | null;
  lastMessageSender: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: string;
};

export type ConversationInfo = {
  id: string;
  type: ConversationType;
  title: string;
  avatarUrl: string | null;
  groupId: string | null;
  otherUserId: string | null;
};

export type MessageablePerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  source: 'connection' | 'group';
};

export function messageTimeLabel(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export async function fetchInbox(): Promise<InboxItem[]> {
  const { data, error } = await supabase.rpc('get_banter_inbox');
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    conversation_id: string;
    conv_type: ConversationType;
    group_id: string | null;
    title: string;
    avatar_url: string | null;
    other_user_id: string | null;
    last_message_text: string | null;
    last_message_sender: string | null;
    last_message_at: string | null;
    unread_count: number;
  }>).map((row) => ({
    conversationId: row.conversation_id,
    type: row.conv_type,
    groupId: row.group_id,
    title: row.title?.trim() || 'Conversation',
    avatarUrl: row.avatar_url,
    otherUserId: row.other_user_id,
    lastMessageText: row.last_message_text,
    lastMessageSender: row.last_message_sender?.trim() || null,
    lastMessageAt: row.last_message_at,
    unreadCount: Number(row.unread_count ?? 0),
  }));
}

export async function fetchConversationInfo(conversationId: string, userId: string): Promise<ConversationInfo | null> {
  const { data: convRow, error: convError } = await supabase
    .from('conversations')
    .select('id, conv_type, group_id, groups(name, avatar_url)')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError) throw convError;
  if (!convRow) return null;

  const row = convRow as unknown as {
    id: string;
    conv_type: ConversationType;
    group_id: string | null;
    groups: { name: string; avatar_url: string | null } | null;
  };

  if (row.conv_type !== 'dm') {
    return {
      id: row.id,
      type: row.conv_type,
      title: row.groups?.name?.trim() || 'Conversation',
      avatarUrl: row.groups?.avatar_url ?? null,
      groupId: row.group_id,
      otherUserId: null,
    };
  }

  const { data: otherRow, error: otherError } = await supabase
    .from('conversation_members')
    .select('user_id, profiles(name, avatar_url)')
    .eq('conversation_id', conversationId)
    .neq('user_id', userId)
    .maybeSingle();

  if (otherError) throw otherError;

  const other = otherRow as unknown as {
    user_id: string;
    profiles: { name: string | null; avatar_url: string | null } | null;
  } | null;

  return {
    id: row.id,
    type: 'dm',
    title: other?.profiles?.name?.trim() || 'Nameless legend',
    avatarUrl: other?.profiles?.avatar_url ?? null,
    groupId: null,
    otherUserId: other?.user_id ?? null,
  };
}

/** Latest messages, oldest-first (capped at 100 — enough for a basic history). */
export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, content, created_at, profiles(name, avatar_url)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    sender_id: string;
    content: string;
    created_at: string;
    profiles: { name: string | null; avatar_url: string | null } | null;
  }>)
    .map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      senderName: row.profiles?.name?.trim() || 'Nameless legend',
      senderAvatarUrl: row.profiles?.avatar_url ?? null,
      content: row.content,
      createdAt: row.created_at,
    }))
    .reverse();
}

export async function sendMessage(conversationId: string, senderId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content });
  if (error) throw error;
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Opens (or creates) the DM thread with another user. The database enforces
 * that the two share a connection or group and aren't blocked. */
export async function getOrCreateDm(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_dm', { p_other_user_id: otherUserId });
  if (error) throw error;
  return data as string;
}

export async function fetchGroupConversationId(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('group_id', groupId)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/**
 * Everyone the user is allowed to DM: accepted connections plus co-members
 * of their groups, deduped (connections win the label), minus anyone blocked
 * in either direction.
 */
export async function fetchMessageablePeople(userId: string, blockedIds: string[]): Promise<MessageablePerson[]> {
  const [{ data: connRows, error: connError }, { data: myGroupRows, error: myGroupsError }] = await Promise.all([
    supabase
      .from('connections')
      .select(
        'user_a, user_b, profileA:profiles!connections_user_a_fkey(name, avatar_url), profileB:profiles!connections_user_b_fkey(name, avatar_url)'
      )
      .eq('status', 'accepted')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from('group_members').select('group_id').eq('user_id', userId),
  ]);

  if (connError) throw connError;
  if (myGroupsError) throw myGroupsError;

  const blocked = new Set(blockedIds);
  const people = new Map<string, MessageablePerson>();

  for (const row of ((connRows ?? []) as unknown as Array<{
    user_a: string;
    user_b: string;
    profileA: { name: string | null; avatar_url: string | null } | null;
    profileB: { name: string | null; avatar_url: string | null } | null;
  }>)) {
    const otherIsA = row.user_b === userId;
    const otherId = otherIsA ? row.user_a : row.user_b;
    const profile = otherIsA ? row.profileA : row.profileB;
    if (blocked.has(otherId)) continue;
    people.set(otherId, {
      id: otherId,
      name: profile?.name?.trim() || 'Nameless legend',
      avatarUrl: profile?.avatar_url ?? null,
      source: 'connection',
    });
  }

  const groupIds = (myGroupRows ?? []).map((row) => row.group_id as string);
  if (groupIds.length > 0) {
    const { data: mateRows, error: matesError } = await supabase
      .from('group_members')
      .select('user_id, profiles(name, avatar_url)')
      .in('group_id', groupIds)
      .neq('user_id', userId);

    if (matesError) throw matesError;

    for (const row of ((mateRows ?? []) as unknown as Array<{
      user_id: string;
      profiles: { name: string | null; avatar_url: string | null } | null;
    }>)) {
      if (blocked.has(row.user_id) || people.has(row.user_id)) continue;
      people.set(row.user_id, {
        id: row.user_id,
        name: row.profiles?.name?.trim() || 'Nameless legend',
        avatarUrl: row.profiles?.avatar_url ?? null,
        source: 'group',
      });
    }
  }

  return Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name));
}
