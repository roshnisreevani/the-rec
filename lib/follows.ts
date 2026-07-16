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
