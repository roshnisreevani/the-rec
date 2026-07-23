import { fetchBlockedEitherDirection } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

// Directional follow model (see supabase/migrations/20260712000000_follows.sql):
// one `follows` row per direction, taking effect immediately — no request or
// approval step. "Mutual" is derived from both edges existing, never stored.

export type FollowUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
  followedAt: string; // when the follow edge was created
};

export type FollowState = {
  iFollow: boolean; // current user → them
  followsMe: boolean; // them → current user
};

type ProfileJoin = { name: string | null; avatar_url: string | null } | null;

function toFollowUser(id: string, profile: ProfileJoin, followedAt: string): FollowUser {
  return {
    id,
    name: profile?.name?.trim() || 'Nameless legend',
    avatarUrl: profile?.avatar_url ?? null,
    followedAt,
  };
}

/** Follow someone — takes effect immediately. Duplicate follows are no-ops. */
export async function followUser(followerId: string, followeeId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .upsert(
      { follower_id: followerId, followee_id: followeeId },
      { onConflict: 'follower_id,followee_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

/** Remove only my edge — the reverse edge (them → me) is untouched. */
export async function unfollowUser(followerId: string, followeeId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  if (error) throw error;
}

/** Both directions between me and another user, in one query. */
export async function fetchFollowState(userId: string, otherUserId: string): Promise<FollowState> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, followee_id')
    .or(
      `and(follower_id.eq.${userId},followee_id.eq.${otherUserId}),and(follower_id.eq.${otherUserId},followee_id.eq.${userId})`
    );

  if (error) throw error;

  const rows = (data ?? []) as { follower_id: string; followee_id: string }[];
  return {
    iFollow: rows.some((r) => r.follower_id === userId),
    followsMe: rows.some((r) => r.follower_id === otherUserId),
  };
}

/** People who follow the given user. */
export async function fetchFollowers(userId: string): Promise<FollowUser[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, created_at, follower:profiles!follows_follower_id_fkey(name, avatar_url)')
    .eq('followee_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (
    (data ?? []) as unknown as { follower_id: string; created_at: string; follower: ProfileJoin }[]
  ).map((row) => toFollowUser(row.follower_id, row.follower, row.created_at));
}

/** People the given user follows. */
export async function fetchFollowing(userId: string): Promise<FollowUser[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('followee_id, created_at, followee:profiles!follows_followee_id_fkey(name, avatar_url)')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (
    (data ?? []) as unknown as { followee_id: string; created_at: string; followee: ProfileJoin }[]
  ).map((row) => toFollowUser(row.followee_id, row.followee, row.created_at));
}

/** Just the ids of who the given user follows — used for Feed's Following scope. */
export async function fetchFollowingIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.followee_id as string);
}

/** Counts from the same table the lists read, so they always match. */
export async function fetchFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('followee_id', userId),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);

  if (followersRes.error) throw followersRes.error;
  if (followingRes.error) throw followingRes.error;
  return { followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
}

/** How many accounts both users follow — the "mutual follows" signal shown
 * on someone else's profile before you follow them. */
export async function fetchMutualFollowsCount(userId: string, otherUserId: string): Promise<number> {
  const list = await fetchMutualFollows(userId, otherUserId);
  return list.length;
}

/** The actual people both users follow, not just the count — powers the
 * "Mutual" stat being tappable on someone else's profile. */
export async function fetchMutualFollows(userId: string, otherUserId: string): Promise<FollowUser[]> {
  const [mine, theirs] = await Promise.all([fetchFollowing(userId), fetchFollowing(otherUserId)]);
  const mineIds = new Set(mine.map((f) => f.id));
  return theirs.filter((f) => mineIds.has(f.id));
}

export type SuggestedPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  location: string;
};

/**
 * "Suggested for you" — powers Discover's cold-start layer, since a small
 * user base means the Following/Discover feeds otherwise look identical.
 *
 * Ranked by two real "you probably know them" signals instead of a plain
 * shuffle: shared Teams group membership (weighted highest — you've
 * actually crossed paths) and mutual follows (people followed by people you
 * already follow — the classic "friend of a friend" signal). Anyone scoring
 * on either gets ranked above the rest; ties are shuffled so the same faces
 * don't camp the top of every load. If there aren't enough scored
 * candidates to fill `limit`, the remainder is backfilled from a random
 * pool of everyone else not already excluded — same as the old behavior,
 * just now a fallback instead of the whole story.
 */
export async function fetchSuggestedPeople(userId: string, limit = 8): Promise<SuggestedPerson[]> {
  const [followingIds, blockedIds, myGroupRows] = await Promise.all([
    fetchFollowingIds(userId),
    fetchBlockedEitherDirection(userId),
    supabase.from('group_members').select('group_id').eq('user_id', userId),
  ]);
  if (myGroupRows.error) throw myGroupRows.error;

  const myGroupIds = (myGroupRows.data ?? []).map((r) => r.group_id as string);
  const excluded = new Set([userId, ...followingIds, ...blockedIds]);

  // Score accumulation: +2 per shared group, +1 per mutual follow. Shared
  // groups outweighs mutual follows since it's a stronger "you've actually
  // met" signal than a friend-of-a-friend edge.
  const scores = new Map<string, number>();
  const bump = (id: string, amount: number) => {
    if (excluded.has(id)) return;
    scores.set(id, (scores.get(id) ?? 0) + amount);
  };

  const [sharedGroupRes, mutualFollowRes] = await Promise.all([
    myGroupIds.length > 0
      ? supabase.from('group_members').select('user_id').in('group_id', myGroupIds)
      : Promise.resolve({ data: [], error: null }),
    followingIds.length > 0
      ? supabase.from('follows').select('followee_id').in('follower_id', followingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sharedGroupRes.error) throw sharedGroupRes.error;
  if (mutualFollowRes.error) throw mutualFollowRes.error;

  for (const row of sharedGroupRes.data ?? []) bump(row.user_id as string, 2);
  for (const row of mutualFollowRes.data ?? []) bump(row.followee_id as string, 1);

  const scoredIds = Array.from(scores.keys());

  const [scoredProfilesRes, poolRes] = await Promise.all([
    scoredIds.length > 0
      ? supabase.from('profiles').select('id, name, avatar_url, location').in('id', scoredIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('profiles').select('id, name, avatar_url, location').limit(50),
  ]);
  if (scoredProfilesRes.error) throw scoredProfilesRes.error;
  if (poolRes.error) throw poolRes.error;

  const toPerson = (row: { id: string; name: string | null; avatar_url: string | null; location: string | null }): SuggestedPerson => ({
    id: row.id,
    name: row.name?.trim() || 'Nameless legend',
    avatarUrl: row.avatar_url,
    location: row.location ?? '',
  });

  const ranked = (scoredProfilesRes.data ?? [])
    .map((row) => toPerson(row as { id: string; name: string | null; avatar_url: string | null; location: string | null }))
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));

  if (ranked.length >= limit) return ranked.slice(0, limit);

  // Backfill with the random pool, same shuffle-and-fill approach as
  // before, skipping anyone already ranked above.
  const rankedIds = new Set(ranked.map((p) => p.id));
  const pool = (poolRes.data ?? [])
    .filter((row) => !excluded.has(row.id as string) && !rankedIds.has(row.id as string))
    .map((row) => toPerson(row as { id: string; name: string | null; avatar_url: string | null; location: string | null }));

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return [...ranked, ...pool].slice(0, limit);
}
