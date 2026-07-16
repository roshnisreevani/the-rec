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

export type ReplyPreview = { id: string; senderName: string; content: string } | null;

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  content: string;
  imageUrl: string | null;
  createdAt: string;
  deletedForEveryone: boolean;
  replyTo: ReplyPreview;
  voiceUrl: string | null;
  voiceDurationSec: number | null;
};

// Hard cap for a recorded voice note — kept short since it's meant to
// replace a quick text, not a voicemail (also keeps storage/egress small).
export const MAX_VOICE_NOTE_SECONDS = 60;

export type ConversationMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  lastReadAt: string;
  muted: boolean;
};

export type PinnedMessageInfo = {
  id: string;
  content: string;
  senderName: string;
  pinnedByName: string;
} | null;

export type ConversationInfo = {
  id: string;
  type: ConversationType;
  title: string;
  avatarUrl: string | null;
  groupId: string | null;
  otherUserId: string | null;
  // Raw (un-merged) values — used to prefill the rename/re-icon modal, which
  // needs to know whether a custom title/icon is actually set vs. just
  // falling back to the group's real name/avatar.
  customTitle: string | null;
  customAvatarUrl: string | null;
  pinnedMessage: PinnedMessageInfo;
};

export type MessageablePerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  source: 'follow' | 'group';
};

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

// Pinned quick-react row shown on long-press — anything else is reachable
// via the "+" full emoji grid (reuses ReactionBar's EMOJI_BANK).
export const MESSAGE_QUICK_REACTIONS = ['👍', '😂', '🐐', '❤️', '😮'];

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

/** Exact date + time, e.g. "Jul 16, 2:45 PM" — used for the swipe-reveal
 * detail panel, as opposed to messageTimeLabel's relative "2h"/"3d". */
export function fullMessageTimeLabel(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
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

/** Total unread across every Banter thread — used for the tab bar badge. */
export async function fetchTotalUnreadCount(): Promise<number> {
  const inbox = await fetchInbox();
  return inbox.reduce((sum, item) => sum + item.unreadCount, 0);
}

async function resolvePinnedMessage(pinnedMessageId: string | null, pinnedById: string | null): Promise<PinnedMessageInfo> {
  if (!pinnedMessageId) return null;

  const [{ data: msgRow, error: msgError }, { data: pinnerRow, error: pinnerError }] = await Promise.all([
    supabase
      .from('messages')
      .select('id, content, profiles!messages_sender_id_fkey(name)')
      .eq('id', pinnedMessageId)
      .maybeSingle(),
    pinnedById ? supabase.from('profiles').select('name').eq('id', pinnedById).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (msgError) throw msgError;
  if (pinnerError) throw pinnerError;
  if (!msgRow) return null;

  const msg = msgRow as unknown as { id: string; content: string; profiles: { name: string | null } | null };
  return {
    id: msg.id,
    content: msg.content,
    senderName: msg.profiles?.name?.trim() || 'Nameless legend',
    pinnedByName: (pinnerRow as unknown as { name: string | null } | null)?.name?.trim() || 'Someone',
  };
}

export async function fetchConversationInfo(conversationId: string, userId: string): Promise<ConversationInfo | null> {
  const { data: convRow, error: convError } = await supabase
    .from('conversations')
    .select(
      'id, conv_type, group_id, custom_title, custom_avatar_url, pinned_message_id, pinned_by, groups(name, avatar_url)'
    )
    .eq('id', conversationId)
    .maybeSingle();

  if (convError) throw convError;
  if (!convRow) return null;

  const row = convRow as unknown as {
    id: string;
    conv_type: ConversationType;
    group_id: string | null;
    custom_title: string | null;
    custom_avatar_url: string | null;
    pinned_message_id: string | null;
    pinned_by: string | null;
    groups: { name: string; avatar_url: string | null } | null;
  };

  const pinnedMessage = await resolvePinnedMessage(row.pinned_message_id, row.pinned_by);

  if (row.conv_type !== 'dm') {
    return {
      id: row.id,
      type: row.conv_type,
      title: row.custom_title?.trim() || row.groups?.name?.trim() || 'Conversation',
      avatarUrl: row.custom_avatar_url ?? row.groups?.avatar_url ?? null,
      groupId: row.group_id,
      otherUserId: null,
      customTitle: row.custom_title,
      customAvatarUrl: row.custom_avatar_url,
      pinnedMessage,
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
    customTitle: null,
    customAvatarUrl: null,
    pinnedMessage,
  };
}

/** Pins (or unpins, with a null message id) a message in a conversation.
 * Runs through a security-definer RPC that checks membership itself, rather
 * than opening general UPDATE access to conversations via RLS. */
export async function setPinnedMessage(conversationId: string, messageId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_pinned_message', {
    p_conversation_id: conversationId,
    p_message_id: messageId,
  });
  if (error) throw error;
}

/** Sets (or clears, with nulls) a group thread's custom nickname/icon —
 * DM threads don't use this. */
export async function setConversationCustomization(
  conversationId: string,
  title: string | null,
  avatarUrl: string | null
): Promise<void> {
  const { error } = await supabase.rpc('set_conversation_customization', {
    p_conversation_id: conversationId,
    p_title: title,
    p_avatar_url: avatarUrl,
  });
  if (error) throw error;
}

/** Latest messages, oldest-first (capped at 100 — enough for a basic history).
 * Messages the current user has "deleted for me" are excluded entirely;
 * messages deleted "for everyone" still come back so the UI can render a
 * placeholder in their place. */
export async function fetchMessages(
  conversationId: string,
  userId: string,
  blockedSenderIds: string[] = []
): Promise<ChatMessage[]> {
  let query = supabase
    .from('messages')
    .select(
      'id, sender_id, content, image_url, created_at, deleted_at, reply_to_message_id, voice_url, voice_duration_sec, profiles!messages_sender_id_fkey(name, avatar_url)'
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100);

  // Filtered in the query itself — not fetched-then-discarded client-side —
  // so a blocked person's messages never leave the server for this user.
  if (blockedSenderIds.length > 0) {
    query = query.not('sender_id', 'in', `(${blockedSenderIds.join(',')})`);
  }

  const [{ data, error }, { data: hiddenRows, error: hiddenError }] = await Promise.all([
    query,
    supabase.from('message_deletions').select('message_id').eq('user_id', userId),
  ]);

  if (error) throw error;
  if (hiddenError) throw hiddenError;

  const hiddenIds = new Set(((hiddenRows ?? []) as Array<{ message_id: string }>).map((r) => r.message_id));

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    sender_id: string;
    content: string;
    image_url: string | null;
    created_at: string;
    deleted_at: string | null;
    reply_to_message_id: string | null;
    voice_url: string | null;
    voice_duration_sec: number | null;
    profiles: { name: string | null; avatar_url: string | null } | null;
  }>;

  // Reply previews are resolved from this same fetched batch — cheap (no
  // extra query) and covers the overwhelming majority of replies, since
  // people reply to something recent. A reply to a message outside this
  // 100-row window just won't get a preview (falls back to a generic label).
  const byId = new Map(rows.map((r) => [r.id, r]));

  return rows
    .filter((row) => !hiddenIds.has(row.id))
    .map((row) => {
      const replySource = row.reply_to_message_id ? byId.get(row.reply_to_message_id) : undefined;
      return {
        id: row.id,
        senderId: row.sender_id,
        senderName: row.profiles?.name?.trim() || 'Nameless legend',
        senderAvatarUrl: row.profiles?.avatar_url ?? null,
        content: row.deleted_at ? '' : row.content,
        imageUrl: row.deleted_at ? null : (row.image_url ?? null),
        createdAt: row.created_at,
        deletedForEveryone: row.deleted_at !== null,
        replyTo: row.reply_to_message_id
          ? {
              id: row.reply_to_message_id,
              senderName: replySource?.profiles?.name?.trim() || 'Someone',
              content: replySource ? replySource.content : 'Original message',
            }
          : null,
        voiceUrl: row.deleted_at ? null : row.voice_url,
        voiceDurationSec: row.voice_duration_sec,
      };
    })
    .reverse();
}

/** Deletes a message for everyone in the thread — only the sender may do
 * this. Content is cleared from the UI but the row is kept (moderation). */
export async function deleteMessageForEveryone(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

/** Hides a message from just the current user's view — everyone else still sees it. */
export async function deleteMessageForMe(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('message_deletions')
    .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' });
  if (error) throw error;
}

/** All members of a conversation with their current read state — used to
 * compute "seen by" per message (any member whose last_read_at is at or
 * after a message's created_at has seen it). */
export async function fetchConversationMembers(conversationId: string): Promise<ConversationMember[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('user_id, last_read_at, muted, profiles(name, avatar_url)')
    .eq('conversation_id', conversationId);
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    user_id: string;
    last_read_at: string;
    muted: boolean;
    profiles: { name: string | null; avatar_url: string | null } | null;
  }>).map((row) => ({
    userId: row.user_id,
    name: row.profiles?.name?.trim() || 'Nameless legend',
    avatarUrl: row.profiles?.avatar_url ?? null,
    lastReadAt: row.last_read_at,
    muted: row.muted,
  }));
}

/** Mutes/unmutes a thread for just the current user — everyone else's
 * notifications are unaffected. */
export async function setConversationMuted(conversationId: string, userId: string, muted: boolean): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ muted })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  imageUrl?: string | null,
  replyToMessageId?: string | null
): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    image_url: imageUrl ?? null,
    reply_to_message_id: replyToMessageId ?? null,
  });
  if (error) throw error;
}

/** Sends a recorded voice note. content can't be empty (DB check), so it
 * gets a small placeholder caption rather than failing the insert. */
export async function sendVoiceMessage(
  conversationId: string,
  senderId: string,
  voiceUrl: string,
  durationSec: number,
  replyToMessageId?: string | null
): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content: '🎤 Voice note',
    voice_url: voiceUrl,
    voice_duration_sec: Math.round(durationSec),
    reply_to_message_id: replyToMessageId ?? null,
  });
  if (error) throw error;
}

/** All reactions across every message in a conversation, grouped per
 * message-id -> emoji -> { count, mine }. One query for the whole thread
 * rather than one per message. */
export async function fetchMessageReactions(
  conversationId: string,
  userId: string
): Promise<Record<string, ReactionSummary[]>> {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji, messages!inner(conversation_id)')
    .eq('messages.conversation_id', conversationId);
  if (error) throw error;

  const grouped = new Map<string, Map<string, ReactionSummary>>();
  for (const row of (data ?? []) as unknown as Array<{ message_id: string; user_id: string; emoji: string }>) {
    let byEmoji = grouped.get(row.message_id);
    if (!byEmoji) {
      byEmoji = new Map();
      grouped.set(row.message_id, byEmoji);
    }
    const existing = byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false };
    existing.count += 1;
    if (row.user_id === userId) existing.mine = true;
    byEmoji.set(row.emoji, existing);
  }

  const result: Record<string, ReactionSummary[]> = {};
  for (const [messageId, byEmoji] of grouped) {
    result[messageId] = Array.from(byEmoji.values());
  }
  return result;
}

/** Toggles a reaction — adds it if the user hasn't reacted with that emoji
 * on this message yet, removes it if they have (same tap-to-toggle pattern
 * as Feed's post reactions). */
export async function toggleMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
    if (error) throw error;
  }
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
 * Everyone the user is allowed to DM: anyone with a follow edge in either
 * direction (matches get_or_create_dm's rule), plus co-members of their
 * groups, deduped (follows win the label), minus anyone blocked in either
 * direction.
 */
export async function fetchMessageablePeople(userId: string, blockedIds: string[]): Promise<MessageablePerson[]> {
  const [{ data: followRows, error: followsError }, { data: myGroupRows, error: myGroupsError }] = await Promise.all([
    supabase
      .from('follows')
      .select(
        'follower_id, followee_id, follower:profiles!follows_follower_id_fkey(name, avatar_url), followee:profiles!follows_followee_id_fkey(name, avatar_url)'
      )
      .or(`follower_id.eq.${userId},followee_id.eq.${userId}`),
    supabase.from('group_members').select('group_id').eq('user_id', userId),
  ]);

  if (followsError) throw followsError;
  if (myGroupsError) throw myGroupsError;

  const blocked = new Set(blockedIds);
  const people = new Map<string, MessageablePerson>();

  for (const row of ((followRows ?? []) as unknown as Array<{
    follower_id: string;
    followee_id: string;
    follower: { name: string | null; avatar_url: string | null } | null;
    followee: { name: string | null; avatar_url: string | null } | null;
  }>)) {
    const otherIsFollower = row.followee_id === userId;
    const otherId = otherIsFollower ? row.follower_id : row.followee_id;
    const profile = otherIsFollower ? row.follower : row.followee;
    if (blocked.has(otherId)) continue;
    people.set(otherId, {
      id: otherId,
      name: profile?.name?.trim() || 'Nameless legend',
      avatarUrl: profile?.avatar_url ?? null,
      source: 'follow',
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
