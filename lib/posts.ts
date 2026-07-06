import { File } from 'expo-file-system';

import { getMockGroup } from '@/lib/groups-mock';
import { fetchBlockedUserIds } from '@/lib/moderation';
import { POST_OF_WEEK_WINDOW_DAYS, REACTIONS, type ReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';

export type MediaType = 'image' | 'video';

export type Post = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  groupId: string;
  groupName: string;
  groupEmoji: string;
  caption: string;
  mediaUrl: string;
  mediaType: MediaType;
  createdAt: string;
  reactionCounts: Record<ReactionType, number>;
  myReactions: ReactionType[];
  commentCount: number;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

type ReactionRow = { type: string; user_id: string };
type CommentCountRow = { count: number };

type PostRow = {
  id: string;
  author_id: string;
  group_id: string;
  caption: string | null;
  media_url: string;
  media_type: MediaType;
  created_at: string;
  author: { name: string | null; avatar_url: string | null } | null;
  reactions: ReactionRow[] | null;
  comments: CommentCountRow[] | null;
};

function emptyReactionCounts(): Record<ReactionType, number> {
  return REACTIONS.reduce(
    (acc, r) => {
      acc[r.type] = 0;
      return acc;
    },
    {} as Record<ReactionType, number>
  );
}

function rowToPost(row: PostRow, currentUserId: string | undefined): Post {
  const reactionCounts = emptyReactionCounts();
  const myReactions: ReactionType[] = [];

  for (const r of row.reactions ?? []) {
    const type = r.type as ReactionType;
    if (type in reactionCounts) {
      reactionCounts[type] += 1;
      if (currentUserId && r.user_id === currentUserId) myReactions.push(type);
    }
  }

  const group = getMockGroup(row.group_id);

  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author?.name?.trim() || 'Nameless legend',
    authorAvatarUrl: row.author?.avatar_url ?? null,
    groupId: row.group_id,
    groupName: group?.name ?? row.group_id,
    groupEmoji: group?.emoji ?? '🏟️',
    caption: row.caption ?? '',
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    createdAt: row.created_at,
    reactionCounts,
    myReactions,
    commentCount: row.comments?.[0]?.count ?? 0,
  };
}

/**
 * Chronological feed. "Groups the user is a member of" is currently every
 * mock group (see lib/groups-mock.ts) since real membership doesn't exist
 * yet — once it does, add a `.in('group_id', memberGroupIds)` filter here.
 *
 * Posts from anyone the current user has blocked are filtered out client
 * side (rather than in the query) since the block list is small and this
 * keeps the Supabase query itself simple.
 */
export async function fetchFeed(currentUserId: string | undefined): Promise<Post[]> {
  const [{ data, error }, blockedIds] = await Promise.all([
    supabase
      .from('posts')
      .select('*, author:profiles(name, avatar_url), reactions:post_reactions(type, user_id), comments:post_comments(count)')
      .order('created_at', { ascending: false }),
    fetchBlockedUserIds(currentUserId),
  ]);

  if (error) throw error;

  const blocked = new Set(blockedIds);
  return ((data ?? []) as unknown as PostRow[])
    .filter((row) => !blocked.has(row.author_id))
    .map((row) => rowToPost(row, currentUserId));
}

export function totalReactions(post: Post): number {
  return Object.values(post.reactionCounts).reduce((sum, n) => sum + n, 0);
}

/**
 * Finds the id of the single post with the most total reactions among posts
 * created within the last POST_OF_WEEK_WINDOW_DAYS days. Returns null if
 * there's no post in that window (or every post has zero reactions).
 */
export function computePostOfWeekId(posts: Post[]): string | null {
  const cutoff = Date.now() - POST_OF_WEEK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let bestId: string | null = null;
  let bestCount = 0;

  for (const post of posts) {
    if (new Date(post.createdAt).getTime() < cutoff) continue;
    const count = totalReactions(post);
    if (count > 0 && count > bestCount) {
      bestCount = count;
      bestId = post.id;
    }
  }

  return bestId;
}

async function uploadFeedMedia(userId: string, localUri: string, mediaType: MediaType): Promise<string> {
  const file = new File(localUri);
  const bytes = await file.bytes();

  const extMatch = localUri.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch?.[1] ?? (mediaType === 'video' ? 'mov' : 'jpg')).toLowerCase();
  const contentType = mediaType === 'video' ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext === 'png' ? 'png' : 'jpeg'}`;

  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const { error } = await supabase.storage.from('feed-media').upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from('feed-media').getPublicUrl(path);
  return data.publicUrl;
}

export async function createPost(input: {
  authorId: string;
  groupId: string;
  caption: string;
  localMediaUri: string;
  mediaType: MediaType;
}): Promise<void> {
  const mediaUrl = await uploadFeedMedia(input.authorId, input.localMediaUri, input.mediaType);

  const { error } = await supabase.from('posts').insert({
    author_id: input.authorId,
    group_id: input.groupId,
    caption: input.caption,
    media_url: mediaUrl,
    media_type: input.mediaType,
  });

  if (error) throw error;
}

/**
 * Toggles a single reaction on/off for the current user. `next` is the
 * desired end state (true = react, false = un-react) — the caller already
 * knows this from its own optimistic UI state.
 */
export async function setReaction(postId: string, userId: string, type: ReactionType, next: boolean): Promise<void> {
  if (next) {
    const { error } = await supabase.from('post_reactions').upsert(
      { post_id: postId, user_id: userId, type },
      { onConflict: 'post_id,user_id,type' }
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('type', type);
    if (error) throw error;
  }
}

export async function fetchComments(postId: string, currentUserId?: string): Promise<Comment[]> {
  const [{ data, error }, blockedIds] = await Promise.all([
    supabase
      .from('post_comments')
      .select('*, author:profiles(name)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true }),
    fetchBlockedUserIds(currentUserId),
  ]);

  if (error) throw error;

  const blocked = new Set(blockedIds);

  return ((data ?? []) as unknown as Array<{
    id: string;
    post_id: string;
    author_id: string;
    body: string;
    created_at: string;
    author: { name: string | null } | null;
  }>)
    .filter((row) => !blocked.has(row.author_id))
    .map((row) => ({
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      authorName: row.author?.name?.trim() || 'Nameless legend',
      body: row.body,
      createdAt: row.created_at,
    }));
}

export async function addComment(postId: string, userId: string, body: string): Promise<void> {
  const { error } = await supabase.from('post_comments').insert({
    post_id: postId,
    user_id: userId,
    body: body.trim(),
  });
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
}

/**
 * Pulls the storage path back out of a Supabase Storage public URL, e.g.
 * ".../storage/v1/object/public/feed-media/<user id>/<file>" -> "<user id>/<file>".
 * Returns null if the URL doesn't look like one of our own public URLs (so
 * post deletion never throws over a media-cleanup edge case).
 */
function storagePathFromPublicUrl(bucket: string, url: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

/**
 * Deletes a post and, best-effort, its media file from the feed-media
 * bucket. Storage cleanup failures are logged but never block the post row
 * itself from being deleted — an orphaned file is a lot less bad than being
 * unable to delete your own post.
 */
export async function deletePost(post: Pick<Post, 'id' | 'mediaUrl'>): Promise<void> {
  const path = storagePathFromPublicUrl('feed-media', post.mediaUrl);
  if (path) {
    const { error: storageError } = await supabase.storage.from('feed-media').remove([path]);
    if (storageError) {
      console.warn('[posts] could not delete feed media for post', post.id, storageError);
    }
  }

  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw error;
}
