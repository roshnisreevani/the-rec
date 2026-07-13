import { fetchBlockedEitherDirection } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

// The request/accept "connections" concept was replaced by the directional
// Follows model (see lib/follows.ts + supabase/migrations/20260712000000_follows.sql).
// What's left here is everything that never depended on that concept:
// private-profile settings, per-user notes, and person search. The legacy
// `connections` table itself is kept read-only in the DB (no code writes to
// it anymore) per that migration's own comment.

export type PersonSearchResult = {
  id: string;
  name: string;
  avatarUrl: string | null;
  location: string;
};

export type ConnectionNote = {
  note: string;
  updatedAt: string | null;
};

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
 * Whether the given profile is private (full details hidden from anyone not
 * yet connected). Private by default per spec — see the connections_privacy
 * _and_notes migration.
 */
export async function fetchIsPrivate(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('is_private').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.is_private ?? true;
}

export async function updateIsPrivate(userId: string, isPrivate: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_private: isPrivate }).eq('id', userId);
  if (error) throw error;
}

/**
 * Private note the current user has written about someone they're
 * connected to — visible only to its author (enforced by connection_notes'
 * RLS, not just this function). Returns an empty note (not null) when none
 * exists yet, so the UI can render a blank editable field either way.
 */
export async function fetchConnectionNote(authorId: string, otherUserId: string): Promise<ConnectionNote> {
  const { data, error } = await supabase
    .from('connection_notes')
    .select('note, updated_at')
    .eq('author_id', authorId)
    .eq('other_user_id', otherUserId)
    .maybeSingle();

  if (error) throw error;
  return { note: data?.note ?? '', updatedAt: data?.updated_at ?? null };
}

export async function saveConnectionNote(authorId: string, otherUserId: string, note: string): Promise<void> {
  const { error } = await supabase.from('connection_notes').upsert(
    {
      author_id: authorId,
      other_user_id: otherUserId,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'author_id,other_user_id' }
  );
  if (error) throw error;
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
