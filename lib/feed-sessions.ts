import { totalReactions, type Post } from '@/lib/posts';

export type FeedSession = {
  key: string;
  groupId: string | null;
  groupName: string;
  groupEmoji: string;
  dateLabel: string;
  posts: Post[]; // oldest -> newest within the session
  postCount: number;
  totalReactionsCount: number;
};

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function relativeDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Groups posts (already sorted newest-first by fetchFeed) into "sessions" —
 * clusters of posts from the same group on the same calendar day. Computed
 * entirely from existing group_id/created_at fields already on Post; no new
 * table, and no dependency on Groups' real schema — group name/emoji still
 * come from the same MOCK_GROUPS lookup lib/posts.ts already uses.
 *
 * Sessions are ordered most-recent-first (matching the old flat feed's
 * ordering). Posts *within* a session are oldest-to-newest, so swiping
 * forward through a session's cards moves forward in time, like flipping
 * through a story from where it started.
 */
export function groupPostsIntoSessions(posts: Post[]): FeedSession[] {
  const buckets = new Map<string, Post[]>();
  const order: string[] = [];

  for (const post of posts) {
    const key = `${post.groupId}::${dateKey(post.createdAt)}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(post);
  }

  return order.map((key) => {
    const sessionPosts = [...(buckets.get(key) ?? [])].reverse(); // oldest -> newest
    const first = sessionPosts[0];
    const totalReactionsCount = sessionPosts.reduce((sum, p) => sum + totalReactions(p), 0);

    return {
      key,
      groupId: first.groupId,
      groupName: first.groupName,
      groupEmoji: first.groupEmoji,
      dateLabel: relativeDateLabel(first.createdAt),
      posts: sessionPosts,
      postCount: sessionPosts.length,
      totalReactionsCount,
    };
  });
}

export function sessionStatLine(session: FeedSession): string {
  const postWord = session.postCount === 1 ? 'post' : 'posts';
  const reactionWord = session.totalReactionsCount === 1 ? 'reaction' : 'reactions';
  return `${session.postCount} ${postWord} · ${session.totalReactionsCount} ${reactionWord}`;
}
