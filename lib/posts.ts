import { File } from 'expo-file-system';

import { withArchiveStatus } from '@/lib/archive';
import { fetchFollowingIds } from '@/lib/follows';
import { getMockGroup } from '@/lib/groups-mock';
import { fetchBlockedUserIds } from '@/lib/moderation';
import { POST_OF_WEEK_WINDOW_DAYS, type ReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';

export type FeedScope = 'following' | 'discover';

export type MediaType = 'image' | 'video';

export type Post = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  groupId: string | null;
  sportTag: string | null;
  groupName: string;
  groupEmoji: string;
  caption: string;
  location: string | null;
  mediaUrl: string;
  mediaType: MediaType;
  createdAt: string;
  archivedAt: string | null;
  reactionCounts: Record<ReactionType, number>;
  myReactions: ReactionType[];
  commentCount: number;
  // Set when this post is a reshare — a text snapshot of who it came from,
  // taken at reshare time so it still reads correctly even if that account
  // is later renamed or deleted. Null for an original (non-reshared) post.
  resharedFromAuthorName: string | null;
  // Self-rating (1–5) set by the author at post time. Null = not rated.
  // The app hides this from the author themselves — everyone else sees it.
  selfRating: number | null;
  // Set when this post came from sharing an AI highlight clip to Feed —
  // drives the "trading card" rendering (persona badge + score ring) on
  // PostCard/SessionPostCard and lets the card deep-link back to the full
  // highlight. Null for a normal post.
  aiMode: string | null;
  aiVerdictScore: number | null;
  highlightClipId: string | null;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  parentCommentId: string | null; // set = this is a reply to that top-level comment
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
};

type ReactionRow = { type: string; user_id: string };
type CommentCountRow = { count: number };

type PostRow = {
  id: string;
  author_id: string;
  group_id: string | null;
  sport_tag: string | null;
  caption: string | null;
  location: string | null;
  media_url: string;
  media_type: MediaType;
  created_at: string;
  archived_at: string | null;
  reshared_from_author_name: string | null;
  self_rating: number | null;
  ai_mode: string | null;
  ai_verdict_score: number | null;
  highlight_clip_id: string | null;
  author: { name: string | null; avatar_url: string | null } | null;
  reactions: ReactionRow[] | null;
  comments: CommentCountRow[] | null;
};

function rowToPost(row: PostRow, currentUserId: string | undefined): Post {
  // Tally every reaction row by its actual type — word, bank emoji, or
  // custom emoji from search all land here the same way. No preset seeding:
  // a type only appears in reactionCounts once someone's actually used it.
  const reactionCounts: Record<ReactionType, number> = {};
  const myReactions: ReactionType[] = [];

  for (const r of row.reactions ?? []) {
    const type = r.type;
    reactionCounts[type] = (reactionCounts[type] ?? 0) + 1;
    if (currentUserId && r.user_id === currentUserId) myReactions.push(type);
  }

  const group = row.group_id ? getMockGroup(row.group_id) : null;

  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author?.name?.trim() || 'Nameless legend',
    authorAvatarUrl: row.author?.avatar_url ?? null,
    groupId: row.group_id,
    sportTag: row.sport_tag,
    groupName: group?.name ?? 'General',
    groupEmoji: group?.emoji ?? '🏟️',
    caption: row.caption ?? '',
    location: row.location ?? null,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    reactionCounts,
    myReactions,
    commentCount: row.comments?.[0]?.count ?? 0,
    resharedFromAuthorName: row.reshared_from_author_name,
    selfRating: row.self_rating ?? null,
    aiMode: row.ai_mode ?? null,
    aiVerdictScore: row.ai_verdict_score ?? null,
    highlightClipId: row.highlight_clip_id ?? null,
  };
}

const POST_SELECT =
  '*, author:profiles!posts_author_id_fkey(name, avatar_url), reactions:post_reactions(type, user_id), comments:post_comments(count)';

/**
 * Feed, scoped to either "following" (chronological — posts from people you
 * follow, plus your own) or "discover" (everyone, ranked by 🔥 count instead
 * of recency — see the heat-sort note below). Defaults to "following".
 *
 * "Groups the user is a member of" is currently every mock group (see
 * lib/groups-mock.ts) since real membership doesn't exist yet — once it
 * does, add a `.in('group_id', memberGroupIds)` filter here.
 *
 * Posts from anyone the current user has blocked are filtered out client
 * side (rather than in the query) since the block list is small and this
 * keeps the Supabase query itself simple. Posts that have aged out to
 * Archive (see lib/archive.ts) are excluded from both scopes — Archive is
 * browsed separately, never mixed into Feed.
 */
export async function fetchFeed(currentUserId: string | undefined, scope: FeedScope = 'following'): Promise<Post[]> {
  const [{ data, error }, blockedIds, followingIds] = await Promise.all([
    // Group-scoped posts (group_id set) never appear in the general feed —
    // they live exclusively in their group's own feed (fetchGroupPosts).
    // RLS additionally hides them from non-members at the database (see the
    // group_post_privacy migration); this filter is what keeps them out of
    // members' main feeds too.
    supabase.from('posts').select(POST_SELECT).is('group_id', null).order('created_at', { ascending: false }),
    fetchBlockedUserIds(currentUserId),
    scope === 'following' && currentUserId ? fetchFollowingIds(currentUserId) : Promise.resolve<string[]>([]),
  ]);

  if (error) throw error;

  const blocked = new Set(blockedIds);
  const allPosts = ((data ?? []) as unknown as PostRow[])
    .filter((row) => !blocked.has(row.author_id))
    .map((row) => rowToPost(row, currentUserId));

  // Archive rank/floor is computed across every fetched post so it's correct
  // regardless of which scope is asking — a "following" view and a
  // "discover" view of the same author's posts must agree on which of that
  // author's posts have aged out.
  const active = withArchiveStatus(allPosts).filter((p) => !p.isArchived);

  if (scope === 'discover') {
    // Discover reads as "trending," not a second copy of Following — ranked
    // by 🔥 count (the same signal HeatMeter renders) rather than
    // chronological, so it doesn't just mirror whatever's newest.
    return [...active].sort((a, b) => (b.reactionCounts['🔥'] ?? 0) - (a.reactionCounts['🔥'] ?? 0));
  }

  const followingSet = new Set(followingIds);
  const followingPosts = active.filter((p) => p.authorId === currentUserId || followingSet.has(p.authorId));

  // Feed's empty-ish state (under MIN_FEED_POSTS) gets backfilled with a
  // few posts that aged out on their own — never ones the owner explicitly
  // deleted/archived (archivedAt !== null stays excluded) — so a quiet Feed
  // still has something in it instead of a blank screen. Purely a read-time
  // fill: nothing is un-archived in the DB, this just re-surfaces a few for
  // this one fetch.
  if (followingPosts.length < MIN_FEED_POSTS) {
    const withStatus = withArchiveStatus(allPosts);
    const naturallyExpired = withStatus.filter(
      (p) =>
        p.isArchived &&
        p.archivedAt === null &&
        (p.authorId === currentUserId || followingSet.has(p.authorId)) &&
        !followingPosts.some((fp) => fp.id === p.id)
    );
    const needed = MIN_FEED_POSTS - followingPosts.length;
    const backfill = shuffle(naturallyExpired).slice(0, needed);
    return [...followingPosts, ...backfill];
  }

  return followingPosts;
}

const MIN_FEED_POSTS = 3;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The current user's own posts that have aged out to their private Archive.
 * Never anyone else's — Archive is always just your own old posts, browsed
 * on your own terms, not a public or shared view.
 */
export async function fetchArchivedPosts(userId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('author_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const posts = ((data ?? []) as unknown as PostRow[]).map((row) => rowToPost(row, userId));
  return withArchiveStatus(posts)
    .filter((p) => p.isArchived)
    .map(({ isArchived: _isArchived, ...post }) => post);
}

/** Posts scoped to one group, newest first. RLS additionally guarantees only
 * members can read these rows (see the group_posts migration). */
export async function fetchGroupPosts(groupId: string, currentUserId: string | undefined): Promise<Post[]> {
  const [{ data, error }, blockedIds] = await Promise.all([
    supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(name, avatar_url), reactions:post_reactions(type, user_id), comments:post_comments(count)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
    fetchBlockedUserIds(currentUserId),
  ]);

  if (error) throw error;

  const blocked = new Set(blockedIds);
  return ((data ?? []) as unknown as PostRow[])
    .filter((row) => !blocked.has(row.author_id))
    .map((row) => rowToPost(row, currentUserId));
}

/** Names of everyone who reacted to a post with a specific emoji/type —
 * powers the long-press "who reacted with this" view on a reaction pill. */
export async function fetchReactionUsers(postId: string, type: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('post_reactions')
    .select('user:profiles(name)')
    .eq('post_id', postId)
    .eq('type', type);

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{ user: { name: string | null } | null }>).map(
    (row) => row.user?.name?.trim() || 'Nameless legend'
  );
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
  groupId?: string | null;
  sportTag: string | null;
  caption: string;
  location?: string | null;
  localMediaUri: string;
  mediaType: MediaType;
  selfRating?: number | null;
}): Promise<void> {
  const mediaUrl = await uploadFeedMedia(input.authorId, input.localMediaUri, input.mediaType);

  const { error } = await supabase.from('posts').insert({
    author_id: input.authorId,
    group_id: input.groupId ?? null,
    sport_tag: input.sportTag,
    caption: input.caption,
    location: input.location?.trim() || null,
    media_url: mediaUrl,
    media_type: input.mediaType,
    self_rating: input.selfRating ?? null,
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
      .select('*, author:profiles(name, avatar_url), likes:comment_likes(user_id)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true }),
    fetchBlockedUserIds(currentUserId),
  ]);

  if (error) throw error;

  const blocked = new Set(blockedIds);

  // Note: the commenter column on post_comments is `user_id` (see the feed
  // schema, its RLS policies, and addComment below).
  return ((data ?? []) as unknown as Array<{
    id: string;
    post_id: string;
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
      postId: row.post_id,
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

/**
 * Toggles a like on a comment. Mirrors setReaction's upsert/delete contract.
 */
export async function setCommentLike(commentId: string, userId: string, next: boolean): Promise<void> {
  if (next) {
    const { error } = await supabase
      .from('comment_likes')
      .upsert({ comment_id: commentId, user_id: userId }, { onConflict: 'comment_id,user_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

export async function addComment(
  postId: string,
  userId: string,
  body: string,
  parentCommentId?: string | null
): Promise<void> {
  const { error } = await supabase.from('post_comments').insert({
    post_id: postId,
    user_id: userId,
    body: body.trim(),
    parent_comment_id: parentCommentId ?? null,
  });
  if (error) throw error;
}

/** One post by id — RLS decides whether the caller may see it (general posts
 * for everyone, group posts for members). Null when missing or not visible. */
export async function fetchPostById(postId: string, currentUserId: string | undefined): Promise<Post | null> {
  const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('id', postId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToPost(data as unknown as PostRow, currentUserId);
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
 * Permanently deletes a post and, best-effort, its media file from the
 * feed-media bucket. Storage cleanup failures are logged but never block
 * the post row itself from being deleted — an orphaned file is a lot less
 * bad than being unable to delete your own post.
 *
 * This is real, irreversible deletion — only ever offered from within
 * Archive ("Delete forever"), never from Feed. Deleting from Feed itself
 * goes through archivePost instead.
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

/**
 * Soft-delete: what "delete" from Feed actually does now. The post isn't
 * removed — it's marked archived and immediately drops out of Feed,
 * landing in the author's private Archive alongside anything that aged out
 * naturally. Nothing is lost; the author can still reshare it or promote it
 * to their Profile from there, or delete it for real.
 */
export async function archivePost(post: Pick<Post, 'id'>): Promise<void> {
  const { error } = await supabase.from('posts').update({ archived_at: new Date().toISOString() }).eq('id', post.id);
  if (error) throw error;
}

/**
 * Reshare: posts a brand-new copy of the same photo/caption (fresh id, fresh
 * timestamp, starts with 0 reactions/comments), attributed to whoever tapped
 * reshare — NOT necessarily the original author, since this is now also
 * available directly from Feed on anyone's post, not just your own from
 * Archive. `posts` RLS requires author_id = auth.uid(), so this must always
 * be the resharing user's own id, never post.authorId. The original post
 * (and its own author) is untouched either way.
 *
 * Stamps reshared_from_* so the new copy visibly shows "Reshared from
 * {authorName}" wherever it's rendered — a name snapshot is stored (not just
 * the id) so that label survives the source account being renamed or deleted.
 */
export async function resharePost(
  post: Pick<Post, 'id' | 'authorId' | 'authorName' | 'groupId' | 'sportTag' | 'caption' | 'mediaUrl' | 'mediaType'>,
  resharedByUserId: string
): Promise<void> {
  const { error } = await supabase.from('posts').insert({
    author_id: resharedByUserId,
    group_id: post.groupId,
    sport_tag: post.sportTag,
    caption: post.caption,
    media_url: post.mediaUrl,
    media_type: post.mediaType,
    reshared_from_post_id: post.id,
    reshared_from_author_id: post.authorId,
    reshared_from_author_name: post.authorName,
  });
  if (error) throw error;
}

/**
 * Same idea as resharePost, but into a specific group's feed rather than the
 * general one — the "Share to a group" destination in the share sheet. Same
 * reshared_from_* attribution stamping as resharePost.
 */
export async function shareToGroup(
  post: Pick<Post, 'id' | 'authorId' | 'authorName' | 'sportTag' | 'caption' | 'mediaUrl' | 'mediaType'>,
  groupId: string,
  sharedByUserId: string
): Promise<void> {
  const { error } = await supabase.from('posts').insert({
    author_id: sharedByUserId,
    group_id: groupId,
    sport_tag: post.sportTag,
    caption: post.caption,
    media_url: post.mediaUrl,
    media_type: post.mediaType,
    reshared_from_post_id: post.id,
    reshared_from_author_id: post.authorId,
    reshared_from_author_name: post.authorName,
  });
  if (error) throw error;
}

/** Bookmarks a post to the current user's own private Saved list — visible
 * only to them, doesn't post or notify anyone. */
export async function savePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_posts')
    .upsert({ user_id: userId, post_id: postId }, { onConflict: 'user_id,post_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unsavePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('saved_posts').delete().eq('user_id', userId).eq('post_id', postId);
  if (error) throw error;
}

/** The current user's saved posts, most recently saved first. */
export async function fetchSavedPosts(userId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('saved_posts')
    .select(`post:posts(${POST_SELECT})`)
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as { post: PostRow | null }[])
    .filter((row): row is { post: PostRow } => row.post !== null)
    .map((row) => rowToPost(row.post, userId));
}

/**
 * Ids of the current user's own posts currently promoted to their Profile's
 * Featured section — used by the Archive screen to show "Add to Profile"
 * vs. "Remove from Profile" per tile.
 */
export async function fetchFeaturedPostIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('featured_posts').select('post_id').eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.post_id as string));
}

/** The current user's own posts, promoted onto their public Profile. */
export async function fetchFeaturedPosts(userId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('featured_posts')
    .select(`post:posts(${POST_SELECT})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as { post: PostRow | null }[])
    .filter((row): row is { post: PostRow } => row.post !== null)
    .map((row) => rowToPost(row.post, userId));
}

/** Promotes one of your own archived posts to your public Profile. */
export async function featurePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('featured_posts').insert({ user_id: userId, post_id: postId });
  if (error) throw error;
}

/** Removes a post from your Profile's Featured section (post itself is untouched). */
export async function unfeaturePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('featured_posts').delete().eq('user_id', userId).eq('post_id', postId);
  if (error) throw error;
}
