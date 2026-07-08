import { supabase } from '@/lib/supabase';

// Followers/Following on top of the `connections` table. The Rec has no
// directional follow model — connections are mutual friendships with a
// request/accept handshake — but each row records who initiated it
// (`requested_by`), which gives the two lists an honest direction:
//
//   Following = connections I initiated (people I added via Feed search).
//   Followers = connections the other person initiated (people who added me).
//
// Pending requests are included on purpose: tapping Connect should make the
// person show up in Following immediately, not only after they accept.

export type FollowUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type ConnectionRow = {
  user_a: string;
  user_b: string;
  profileA: { name: string | null; avatar_url: string | null } | null;
  profileB: { name: string | null; avatar_url: string | null } | null;
};

const FOLLOW_SELECT =
  'user_a, user_b, profileA:profiles!connections_user_a_fkey(name, avatar_url), profileB:profiles!connections_user_b_fkey(name, avatar_url)';

function toFollowUsers(rows: ConnectionRow[], userId: string): FollowUser[] {
  return rows.map((row) => {
    const otherIsB = row.user_a === userId;
    const profile = otherIsB ? row.profileB : row.profileA;
    return {
      id: otherIsB ? row.user_b : row.user_a,
      name: profile?.name?.trim() || 'Nameless legend',
      avatarUrl: profile?.avatar_url ?? null,
    };
  });
}

/** People who added me (connections initiated by the other user). */
export async function fetchFollowers(userId: string): Promise<FollowUser[]> {
  const { data, error } = await supabase
    .from('connections')
    .select(FOLLOW_SELECT)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .neq('requested_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return toFollowUsers((data ?? []) as unknown as ConnectionRow[], userId);
}

/** People I added (connections I initiated). */
export async function fetchFollowing(userId: string): Promise<FollowUser[]> {
  const { data, error } = await supabase
    .from('connections')
    .select(FOLLOW_SELECT)
    .eq('requested_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return toFollowUsers((data ?? []) as unknown as ConnectionRow[], userId);
}

/** Counts derived from the same queries the lists use, so they always match. */
export async function fetchFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([fetchFollowers(userId), fetchFollowing(userId)]);
  return { followers: followers.length, following: following.length };
}
