import { fetchBlockedEitherDirection } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

export type ConnectionStatus = 'pending' | 'accepted';

export type ConnectionState = {
  connectionId: string | null;
  status: ConnectionStatus | null;
  // Only meaningful when status === 'pending' — true if the current user
  // sent the request (so they'd see "Cancel"), false if they received it
  // (so they'd see "Accept"/"Decline").
  requestedByMe: boolean;
};

export type ConnectionRequest = {
  connectionId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatarUrl: string | null;
  otherUserLocation: string;
  createdAt: string;
};

export type PersonSearchResult = {
  id: string;
  name: string;
  avatarUrl: string | null;
  location: string;
};

// Every row is stored with user_a < user_b so a pair never produces two rows
// (one for each request direction).
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

type ConnectionRow = {
  id: string;
  user_a: string;
  user_b: string;
  status: ConnectionStatus;
  requested_by: string;
  created_at: string;
  profileA: { name: string | null; avatar_url: string | null; location: string | null } | null;
  profileB: { name: string | null; avatar_url: string | null; location: string | null } | null;
};

function rowToRequest(row: ConnectionRow, currentUserId: string): ConnectionRequest {
  const isUserA = row.user_a === currentUserId;
  const otherProfile = isUserA ? row.profileB : row.profileA;
  const otherUserId = isUserA ? row.user_b : row.user_a;

  return {
    connectionId: row.id,
    otherUserId,
    otherUserName: otherProfile?.name?.trim() || 'Nameless legend',
    otherUserAvatarUrl: otherProfile?.avatar_url ?? null,
    otherUserLocation: otherProfile?.location ?? '',
    createdAt: row.created_at,
  };
}

const REQUEST_SELECT =
  '*, profileA:profiles!connections_user_a_fkey(name, avatar_url, location), profileB:profiles!connections_user_b_fkey(name, avatar_url, location)';

/**
 * Current connection state between the current user and someone else's
 * profile — drives which button (Connect / Pending / Connected) shows on
 * the read-only profile screen.
 */
export async function fetchConnectionState(currentUserId: string, otherUserId: string): Promise<ConnectionState> {
  const [userA, userB] = canonicalPair(currentUserId, otherUserId);

  const { data, error } = await supabase
    .from('connections')
    .select('id, status, requested_by')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { connectionId: null, status: null, requestedByMe: false };

  return {
    connectionId: data.id,
    status: data.status as ConnectionStatus,
    requestedByMe: data.requested_by === currentUserId,
  };
}

export async function sendConnectionRequest(currentUserId: string, otherUserId: string): Promise<void> {
  const [userA, userB] = canonicalPair(currentUserId, otherUserId);
  const { error } = await supabase.from('connections').insert({
    user_a: userA,
    user_b: userB,
    requested_by: currentUserId,
    status: 'pending',
  });
  if (error) throw error;
}

export async function acceptConnection(connectionId: string): Promise<void> {
  const { error } = await supabase
    .from('connections')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', connectionId);
  if (error) throw error;
}

/**
 * Covers decline (recipient rejecting a pending request), cancel (requester
 * withdrawing their own pending request), and disconnect (either side of an
 * already-accepted connection) — all are just "remove this row."
 */
export async function removeConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.from('connections').delete().eq('id', connectionId);
  if (error) throw error;
}

export async function fetchReceivedRequests(userId: string): Promise<ConnectionRequest[]> {
  const { data, error } = await supabase
    .from('connections')
    .select(REQUEST_SELECT)
    .eq('status', 'pending')
    .neq('requested_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as ConnectionRow[]).map((row) => rowToRequest(row, userId));
}

export async function fetchSentRequests(userId: string): Promise<ConnectionRequest[]> {
  const { data, error } = await supabase
    .from('connections')
    .select(REQUEST_SELECT)
    .eq('status', 'pending')
    .eq('requested_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as ConnectionRow[]).map((row) => rowToRequest(row, userId));
}

/**
 * Count of accepted connections for the profile stat row. No explicit
 * user_a/user_b filter needed — RLS already restricts rows to ones the
 * current user is part of.
 */
export async function fetchConnectionsCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('connections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted');

  if (error) throw error;
  return count ?? 0;
}

export async function fetchAllowsConnectionRequests(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('allow_connection_requests')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.allow_connection_requests ?? true;
}

/**
 * Search people by name for the Find People screen. Excludes yourself and
 * anyone blocked in either direction (see fetchBlockedEitherDirection).
 */
export async function searchPeople(currentUserId: string, query: string): Promise<PersonSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [{ data, error }, blockedIds] = await Promise.all([
    supabase.from('profiles').select('id, name, avatar_url, location').ilike('name', `%${trimmed}%`).limit(20),
    fetchBlockedEitherDirection(currentUserId),
  ]);

  if (error) throw error;

  const blocked = new Set(blockedIds);
  return (data ?? [])
    .filter((row) => row.id !== currentUserId && !blocked.has(row.id))
    .map((row) => ({
      id: row.id,
      name: (row.name as string | null) ?? '',
      avatarUrl: row.avatar_url,
      location: row.location ?? '',
    }));
}
