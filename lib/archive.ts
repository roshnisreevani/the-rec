import type { Post } from '@/lib/posts';

// Aging-out design (see project handoff): posts should never force a
// decision on the poster. After ARCHIVE_WINDOW_DAYS, an old post quietly
// drops out of the public Feed into a private Archive — not deleted, not
// public, not featured. ARCHIVE_FLOOR_COUNT guarantees an author's Feed
// presence never goes below a small floor just because they haven't posted
// recently: their most recent ARCHIVE_FLOOR_COUNT posts stay visible
// regardless of age.
//
// Deliberately NOT a DB trigger: this is time-based read-time visibility,
// not a reaction to a discrete event, so it's computed here over whatever
// posts were just fetched rather than stored/mutated in Postgres.
export const ARCHIVE_WINDOW_DAYS = 2;
export const ARCHIVE_FLOOR_COUNT = 2;

export type PostWithArchiveStatus = Post & { isArchived: boolean };

/**
 * Tags each post with whether it's in Archive, via either path:
 *
 * 1. Explicit: `archivedAt` is set — the author deliberately deleted it
 *    from Feed (soft-delete). Always archived, no further computation.
 * 2. Aged out: older than ARCHIVE_WINDOW_DAYS AND beyond the author's most
 *    recent ARCHIVE_FLOOR_COUNT *non-explicitly-archived* posts (ranked
 *    across ALL of that author's eligible posts in the given list, not
 *    just ones passing some other filter — so the floor is correct
 *    regardless of what scope/tab is asking).
 */
export function withArchiveStatus(posts: Post[]): PostWithArchiveStatus[] {
  const cutoff = Date.now() - ARCHIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // Explicitly-archived posts don't participate in (or count toward) the
  // floor — a deliberately-deleted post shouldn't keep someone else's older
  // post artificially "safe" from aging out.
  const eligibleForRank = posts.filter((p) => p.archivedAt === null);
  const newestFirst = [...eligibleForRank].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const rankById = new Map<string, number>();
  const countByAuthor = new Map<string, number>();
  for (const post of newestFirst) {
    const rank = (countByAuthor.get(post.authorId) ?? 0) + 1;
    countByAuthor.set(post.authorId, rank);
    rankById.set(post.id, rank);
  }

  return posts.map((post) => {
    if (post.archivedAt !== null) return { ...post, isArchived: true };
    const rank = rankById.get(post.id) ?? Infinity;
    const isArchived = new Date(post.createdAt).getTime() < cutoff && rank > ARCHIVE_FLOOR_COUNT;
    return { ...post, isArchived };
  });
}
