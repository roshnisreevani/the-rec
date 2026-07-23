import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

export type LeagueFormat = 'single_elim' | 'double_elim' | 'round_robin' | 'season';
export type LeaguePrivacy = 'public' | 'private';
export type LeagueStatus = 'upcoming' | 'active' | 'completed';
export type LeagueRole = 'commissioner' | 'co_commissioner' | 'member';
export type MatchStatus = 'scheduled' | 'completed' | 'forfeit_a' | 'forfeit_b';

export const LEAGUE_FORMAT_LABELS: Record<LeagueFormat, string> = {
  single_elim: 'Single Elimination',
  double_elim: 'Double Elimination',
  round_robin: 'Round Robin',
  season: 'Season Standings',
};

export const LEAGUE_FORMATS: LeagueFormat[] = ['single_elim', 'double_elim', 'round_robin', 'season'];

export type League = {
  id: string;
  name: string;
  description: string;
  sportTag: string | null;
  format: LeagueFormat;
  privacy: LeaguePrivacy;
  status: LeagueStatus;
  maxMembers: number | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  entryRequirements: string;
  avatarUrl: string | null;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  myRole: LeagueRole | null;
};

export type LeagueMember = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: LeagueRole;
  joinedAt: string;
};

export type Team = {
  id: string;
  leagueId: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  createdBy: string;
  createdAt: string;
  memberCount: number;
};

export type TeamRosterMember = {
  id: string;
  teamId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
};

export type MatchTeamRef = { id: string; name: string; avatarUrl: string | null } | null;

export type Match = {
  id: string;
  leagueId: string;
  round: number | null;
  bracketPosition: number | null;
  teamA: MatchTeamRef;
  teamB: MatchTeamRef;
  teamAScore: number | null;
  teamBScore: number | null;
  winnerTeamId: string | null;
  status: MatchStatus;
  scheduledAt: string | null;
  nextMatchId: string | null;
  nextMatchSlot: 'a' | 'b' | null;
  createdAt: string;
};

export type StandingsRow = {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
};

export type Announcement = {
  id: string;
  leagueId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  archivedAt: string | null;
  createdAt: string;
};

export type ActivityEventType = 'match_result' | 'standings_change' | 'team_created' | 'settings_change';

export type ActivityFeedItem = {
  id: string;
  kind: 'bulletin' | ActivityEventType;
  createdAt: string;
  pinned: boolean;
  // Bulletin fields
  authorName?: string;
  authorAvatarUrl?: string | null;
  body?: string;
  imageUrl?: string | null;
  // System-event fields
  actorId?: string | null;
  relatedId?: string | null;
  payload?: Record<string, unknown>;
};

export type StatCategory = {
  id: string;
  leagueId: string;
  name: string;
  unit: string | null;
};

export type StatTotal = {
  statCategoryId: string;
  categoryName: string;
  categoryUnit: string | null;
  userId: string;
  userName: string;
  teamId: string | null;
  total: number;
  entryCount: number;
};

export type LeagueInvitePreview = {
  leagueId: string;
  name: string;
  description: string;
  format: LeagueFormat;
  privacy: LeaguePrivacy;
  memberCount: number;
};

export type JoinLeagueResult = 'joined' | 'already_member';

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 10);
}

type LeagueRow = {
  id: string;
  name: string;
  description: string | null;
  sport_tag: string | null;
  format: LeagueFormat;
  privacy: LeaguePrivacy;
  status: LeagueStatus;
  max_members: number | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  entry_requirements: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  league_members?: { count: number }[] | null;
};

function mapLeagueRow(row: LeagueRow, myRole: LeagueRole | null): League {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    sportTag: row.sport_tag,
    format: row.format,
    privacy: row.privacy,
    status: row.status,
    maxMembers: row.max_members,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    entryRequirements: row.entry_requirements ?? '',
    avatarUrl: row.avatar_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    memberCount: row.league_members?.[0]?.count ?? 1,
    myRole,
  };
}

// 1. Leagues ------------------------------------------------------------

export async function fetchMyLeagues(userId: string): Promise<League[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('league_members')
    .select('league_id, role, joined_at')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });

  if (membershipError) throw membershipError;
  if (!memberships || memberships.length === 0) return [];

  const leagueIds = memberships.map((m) => m.league_id as string);
  const roleByLeagueId = new Map(memberships.map((m) => [m.league_id as string, m.role as LeagueRole]));

  const { data: rows, error } = await supabase
    .from('leagues')
    .select('*, league_members(count)')
    .in('id', leagueIds);

  if (error) throw error;

  const leagues = ((rows ?? []) as unknown as LeagueRow[]).map((row) =>
    mapLeagueRow(row, roleByLeagueId.get(row.id) ?? 'member')
  );

  return leagues.sort((a, b) => {
    const aJoined = memberships.find((m) => m.league_id === a.id)?.joined_at ?? '';
    const bJoined = memberships.find((m) => m.league_id === b.id)?.joined_at ?? '';
    return bJoined.localeCompare(aJoined);
  });
}

/** Public leagues the user hasn't joined yet, for the browse/discover list. */
export async function fetchBrowseLeagues(userId: string): Promise<League[]> {
  const [{ data: memberships, error: membershipError }, { data: rows, error }] = await Promise.all([
    supabase.from('league_members').select('league_id').eq('user_id', userId),
    supabase
      .from('leagues')
      .select('*, league_members(count)')
      .eq('privacy', 'public')
      .order('created_at', { ascending: false }),
  ]);

  if (membershipError) throw membershipError;
  if (error) throw error;

  const joinedIds = new Set((memberships ?? []).map((m) => m.league_id as string));

  return ((rows ?? []) as unknown as LeagueRow[])
    .filter((row) => !joinedIds.has(row.id))
    .map((row) => mapLeagueRow(row, null));
}

export async function createLeague(input: {
  name: string;
  description: string;
  sportTag: string | null;
  format: LeagueFormat;
  privacy: LeaguePrivacy;
  maxMembers: number | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  entryRequirements: string;
  avatarUrl: string | null;
  createdBy: string;
}): Promise<League> {
  const { data, error } = await supabase
    .from('leagues')
    .insert({
      name: input.name,
      description: input.description,
      sport_tag: input.sportTag,
      format: input.format,
      privacy: input.privacy,
      max_members: input.maxMembers,
      registration_opens_at: input.registrationOpensAt,
      registration_closes_at: input.registrationClosesAt,
      entry_requirements: input.entryRequirements,
      avatar_url: input.avatarUrl,
      created_by: input.createdBy,
    })
    .select('*')
    .single();

  if (error) throw error;

  return mapLeagueRow(data as unknown as LeagueRow, 'commissioner');
}

export async function fetchLeagueDetail(
  leagueId: string,
  userId: string
): Promise<{ league: League; members: LeagueMember[] } | null> {
  const { data: leagueRow, error: leagueError } = await supabase
    .from('leagues')
    .select('*, league_members(count)')
    .eq('id', leagueId)
    .maybeSingle();

  if (leagueError) throw leagueError;
  if (!leagueRow) return null;

  const { data: memberRows, error: membersError } = await supabase
    .from('league_members')
    .select('id, user_id, role, joined_at, profiles(name, avatar_url)')
    .eq('league_id', leagueId)
    .order('joined_at', { ascending: true });

  if (membersError) throw membersError;

  const members: LeagueMember[] = ((memberRows ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    role: LeagueRole;
    joined_at: string;
    profiles: { name: string | null; avatar_url: string | null } | null;
  }>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.profiles?.name?.trim() || 'Nameless legend',
    avatarUrl: row.profiles?.avatar_url ?? null,
    role: row.role,
    joinedAt: row.joined_at,
  }));

  const myMembership = members.find((m) => m.userId === userId);
  const league = mapLeagueRow(leagueRow as unknown as LeagueRow, myMembership?.role ?? null);

  return { league, members };
}

export async function joinPublicLeague(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('league_members').insert({ league_id: leagueId, user_id: userId, role: 'member' });
  if (error) throw error;
}

export async function leaveLeague(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteLeague(leagueId: string): Promise<void> {
  const { error } = await supabase.from('leagues').delete().eq('id', leagueId);
  if (error) throw error;
}

export async function setMemberRole(memberId: string, role: LeagueRole): Promise<void> {
  const { error } = await supabase.from('league_members').update({ role }).eq('id', memberId);
  if (error) throw error;
}

export async function removeMember(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', userId);
  if (error) throw error;
}

/** The league's Banter thread — auto-created by a trigger the moment the
 * league exists (20260731000000_league_wide_banter.sql), so this is just a
 * lookup. Banter is league-wide: any member can read/post. */
export async function fetchLeagueConversationId(leagueId: string): Promise<string | null> {
  const { data, error } = await supabase.from('conversations').select('id').eq('league_id', leagueId).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/** Whether the league has any match rows yet — the DB enforces this as the
 * format-lock line too (see 20260730000000_league_settings_audit.sql), this
 * is just for the settings screen to disable the format picker up front. */
export async function leagueHasMatches(leagueId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function updateLeagueSettings(
  leagueId: string,
  updates: Partial<{
    name: string;
    description: string;
    format: LeagueFormat;
    maxMembers: number | null;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
    entryRequirements: string;
  }>
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.format !== undefined) row.format = updates.format;
  if (updates.maxMembers !== undefined) row.max_members = updates.maxMembers;
  if (updates.registrationOpensAt !== undefined) row.registration_opens_at = updates.registrationOpensAt;
  if (updates.registrationClosesAt !== undefined) row.registration_closes_at = updates.registrationClosesAt;
  if (updates.entryRequirements !== undefined) row.entry_requirements = updates.entryRequirements;

  const { error } = await supabase.from('leagues').update(row).eq('id', leagueId);
  if (error) throw error;
}

// 2. Invite links (mirrors lib/groups.ts) --------------------------------

export function getLeagueInviteUrl(code: string): string {
  return Linking.createURL('league/join/' + code);
}

export async function fetchOrCreateLeagueInviteCode(leagueId: string, userId: string): Promise<string> {
  const { data: existing, error: fetchError } = await supabase
    .from('league_invites')
    .select('code')
    .eq('league_id', leagueId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing.code as string;

  const code = generateInviteCode();
  const { error: insertError } = await supabase
    .from('league_invites')
    .insert({ league_id: leagueId, code, created_by: userId });

  if (insertError) throw insertError;
  return code;
}

export async function regenerateLeagueInviteCode(leagueId: string): Promise<string> {
  const code = generateInviteCode();
  const { error } = await supabase.from('league_invites').update({ code }).eq('league_id', leagueId);
  if (error) throw error;
  return code;
}

export async function fetchLeagueInvitePreview(code: string): Promise<LeagueInvitePreview | null> {
  const { data, error } = await supabase.rpc('get_league_invite_preview', { p_code: code });
  if (error) throw error;

  const row = (data as unknown as Array<{
    league_id: string;
    name: string;
    description: string | null;
    format: LeagueFormat;
    privacy: LeaguePrivacy;
    member_count: number;
  }>)?.[0];

  if (!row) return null;

  return {
    leagueId: row.league_id,
    name: row.name,
    description: row.description ?? '',
    format: row.format,
    privacy: row.privacy,
    memberCount: row.member_count,
  };
}

export async function joinLeagueViaInvite(code: string): Promise<JoinLeagueResult> {
  const { data, error } = await supabase.rpc('join_league_via_invite', { p_code: code });
  if (error) throw error;
  return data as JoinLeagueResult;
}

// 3. Teams ----------------------------------------------------------------

export async function fetchTeams(leagueId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*, team_members(count)')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    league_id: string;
    name: string;
    description: string | null;
    avatar_url: string | null;
    created_by: string;
    created_at: string;
    team_members: { count: number }[] | null;
  }>).map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    name: row.name,
    description: row.description ?? '',
    avatarUrl: row.avatar_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    memberCount: row.team_members?.[0]?.count ?? 0,
  }));
}

export async function fetchTeam(teamId: string): Promise<Team | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('*, team_members(count)')
    .eq('id', teamId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    league_id: string;
    name: string;
    description: string | null;
    avatar_url: string | null;
    created_by: string;
    created_at: string;
    team_members: { count: number }[] | null;
  };

  return {
    id: row.id,
    leagueId: row.league_id,
    name: row.name,
    description: row.description ?? '',
    avatarUrl: row.avatar_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    memberCount: row.team_members?.[0]?.count ?? 0,
  };
}

export async function createTeam(input: {
  leagueId: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  createdBy: string;
}): Promise<Team> {
  const { data, error } = await supabase
    .from('teams')
    .insert({
      league_id: input.leagueId,
      name: input.name,
      description: input.description,
      avatar_url: input.avatarUrl,
      created_by: input.createdBy,
    })
    .select('*')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    leagueId: data.league_id,
    name: data.name,
    description: data.description ?? '',
    avatarUrl: data.avatar_url,
    createdBy: data.created_by,
    createdAt: data.created_at,
    memberCount: 0,
  };
}

export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', teamId);
  if (error) throw error;
}

export async function fetchTeamRoster(teamId: string): Promise<TeamRosterMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, team_id, user_id, joined_at, profiles(name, avatar_url)')
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    team_id: string;
    user_id: string;
    joined_at: string;
    profiles: { name: string | null; avatar_url: string | null } | null;
  }>).map((row) => ({
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    name: row.profiles?.name?.trim() || 'Nameless legend',
    avatarUrl: row.profiles?.avatar_url ?? null,
    joinedAt: row.joined_at,
  }));
}

/** League members not yet assigned to any team — pool for manual assignment. */
export async function fetchUnassignedLeagueMembers(leagueId: string): Promise<LeagueMember[]> {
  const [{ data: memberRows, error: memberError }, { data: assignedRows, error: assignedError }] = await Promise.all([
    supabase
      .from('league_members')
      .select('id, user_id, role, joined_at, profiles(name, avatar_url)')
      .eq('league_id', leagueId),
    supabase.from('team_members').select('user_id').eq('league_id', leagueId),
  ]);

  if (memberError) throw memberError;
  if (assignedError) throw assignedError;

  const assignedIds = new Set((assignedRows ?? []).map((r) => r.user_id as string));

  return ((memberRows ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    role: LeagueRole;
    joined_at: string;
    profiles: { name: string | null; avatar_url: string | null } | null;
  }>)
    .filter((row) => !assignedIds.has(row.user_id))
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.profiles?.name?.trim() || 'Nameless legend',
      avatarUrl: row.profiles?.avatar_url ?? null,
      role: row.role,
      joinedAt: row.joined_at,
    }));
}

export async function assignMemberToTeam(teamId: string, leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('team_members').insert({ team_id: teamId, league_id: leagueId, user_id: userId });
  if (error) throw error;
}

export async function removeMemberFromTeam(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId);
  if (error) throw error;
}

// 4. Matches / schedule ------------------------------------------------------

type MatchRow = {
  id: string;
  league_id: string;
  round: number | null;
  bracket_position: number | null;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_team_id: string | null;
  status: MatchStatus;
  scheduled_at: string | null;
  next_match_id: string | null;
  next_match_slot: 'a' | 'b' | null;
  created_at: string;
  team_a: { id: string; name: string; avatar_url: string | null } | null;
  team_b: { id: string; name: string; avatar_url: string | null } | null;
};

function mapMatchRow(row: MatchRow): Match {
  return {
    id: row.id,
    leagueId: row.league_id,
    round: row.round,
    bracketPosition: row.bracket_position,
    teamA: row.team_a ? { id: row.team_a.id, name: row.team_a.name, avatarUrl: row.team_a.avatar_url } : null,
    teamB: row.team_b ? { id: row.team_b.id, name: row.team_b.name, avatarUrl: row.team_b.avatar_url } : null,
    teamAScore: row.team_a_score,
    teamBScore: row.team_b_score,
    winnerTeamId: row.winner_team_id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    nextMatchId: row.next_match_id,
    nextMatchSlot: row.next_match_slot,
    createdAt: row.created_at,
  };
}

const MATCH_SELECT = '*, team_a:teams!team_a_id(id,name,avatar_url), team_b:teams!team_b_id(id,name,avatar_url)';

export async function fetchMatches(leagueId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('league_id', leagueId)
    .order('round', { ascending: true })
    .order('bracket_position', { ascending: true })
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as MatchRow[]).map(mapMatchRow);
}

/**
 * Generates a single-elimination bracket for the given (already-ordered)
 * team ids — order is treated as seed order, team 0 is the #1 seed. Byes are
 * distributed the same way as the Groups Brackets feature (lib/brackets.ts):
 * top seeds face the lowest remaining seed, with byes handed to the seeds
 * left over from an uneven team count.
 *
 * Double-elimination bracket generation is NOT implemented yet — the schema
 * supports it (loser_next_match_id/slot columns exist) but the generation
 * algorithm is a known gap, flagged rather than shipped half-working.
 */
export async function generateSingleEliminationBracket(leagueId: string, teamIds: string[]): Promise<void> {
  const n = teamIds.length;
  if (n < 2) throw new Error('Need at least 2 teams to generate a bracket.');

  const rounds = Math.ceil(Math.log2(n));
  const matchCount = Math.pow(2, rounds - 1);
  const usedIndices = new Set<number>();
  const round1Pairs: { teamAId: string | null; teamBId: string | null }[] = [];

  for (let i = 0; i < matchCount; i++) {
    const aIdx = i;
    const bIdx = n - 1 - i;

    if (aIdx >= n || usedIndices.has(aIdx)) {
      round1Pairs.push({ teamAId: null, teamBId: null });
      continue;
    }

    usedIndices.add(aIdx);
    const a = teamIds[aIdx];
    let b: string | null = null;
    if (bIdx > aIdx && bIdx < n && !usedIndices.has(bIdx)) {
      usedIndices.add(bIdx);
      b = teamIds[bIdx];
    }
    round1Pairs.push({ teamAId: a, teamBId: b });
  }

  let previousRoundIds: (string | null)[] = [];

  for (let r = 1; r <= rounds; r++) {
    const matchesInRound = Math.pow(2, rounds - r);
    const rows =
      r === 1
        ? round1Pairs.map((pair, i) => ({
            league_id: leagueId,
            round: r,
            bracket_position: i,
            team_a_id: pair.teamAId,
            team_b_id: pair.teamBId,
          }))
        : Array.from({ length: matchesInRound }, (_, i) => ({
            league_id: leagueId,
            round: r,
            bracket_position: i,
            team_a_id: null,
            team_b_id: null,
          }));

    const { data, error } = await supabase.from('matches').insert(rows).select('id, bracket_position');
    if (error) throw error;

    const idsByPosition = new Map((data ?? []).map((m) => [m.bracket_position as number, m.id as string]));
    const currentRoundIds = Array.from({ length: matchesInRound }, (_, i) => idsByPosition.get(i) ?? null);

    for (let i = 0; i < previousRoundIds.length; i++) {
      const prevId = previousRoundIds[i];
      if (!prevId) continue;
      const nextMatchId = currentRoundIds[Math.floor(i / 2)];
      const slot: 'a' | 'b' = i % 2 === 0 ? 'a' : 'b';
      const { error: wireError } = await supabase
        .from('matches')
        .update({ next_match_id: nextMatchId, next_match_slot: slot })
        .eq('id', prevId);
      if (wireError) throw wireError;
    }

    previousRoundIds = currentRoundIds;
  }

  if (rounds > 1) {
    const { data: round1Rows, error } = await supabase
      .from('matches')
      .select('id, team_a_id, team_b_id, next_match_id, next_match_slot')
      .eq('league_id', leagueId)
      .eq('round', 1);
    if (error) throw error;

    for (const row of round1Rows ?? []) {
      const soleTeam = row.team_a_id && !row.team_b_id ? row.team_a_id : null;
      if (!soleTeam || !row.next_match_id) continue;
      await supabase.from('matches').update({ status: 'completed', winner_team_id: soleTeam }).eq('id', row.id);
      await supabase
        .from('matches')
        .update(row.next_match_slot === 'a' ? { team_a_id: soleTeam } : { team_b_id: soleTeam })
        .eq('id', row.next_match_id);
    }
  }
}

/** Full pairwise schedule — every team plays every other team once. */
export async function generateRoundRobinSchedule(leagueId: string, teamIds: string[]): Promise<void> {
  if (teamIds.length < 2) throw new Error('Need at least 2 teams for a round-robin schedule.');

  const rows: { league_id: string; team_a_id: string; team_b_id: string }[] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      rows.push({ league_id: leagueId, team_a_id: teamIds[i], team_b_id: teamIds[j] });
    }
  }

  const { error } = await supabase.from('matches').insert(rows);
  if (error) throw error;
}

/** Season format: commissioner adds matches one at a time as they're scheduled. */
export async function addSeasonMatch(input: {
  leagueId: string;
  teamAId: string;
  teamBId: string;
  scheduledAt: string | null;
}): Promise<void> {
  const { error } = await supabase.from('matches').insert({
    league_id: input.leagueId,
    team_a_id: input.teamAId,
    team_b_id: input.teamBId,
    scheduled_at: input.scheduledAt,
  });
  if (error) throw error;
}

/**
 * Records a completed match's score/winner and, for bracket formats,
 * advances the winner into the next round's slot. `winnerTeamId` should be
 * null only for a season/round-robin tie.
 */
export async function recordMatchResult(
  matchId: string,
  input: { teamAScore: number | null; teamBScore: number | null; winnerTeamId: string | null }
): Promise<void> {
  const { data: match, error: fetchError } = await supabase
    .from('matches')
    .select('next_match_id, next_match_slot')
    .eq('id', matchId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('matches')
    .update({
      team_a_score: input.teamAScore,
      team_b_score: input.teamBScore,
      winner_team_id: input.winnerTeamId,
      status: 'completed',
    })
    .eq('id', matchId);
  if (error) throw error;

  if (input.winnerTeamId && match.next_match_id) {
    const { error: advanceError } = await supabase
      .from('matches')
      .update(match.next_match_slot === 'a' ? { team_a_id: input.winnerTeamId } : { team_b_id: input.winnerTeamId })
      .eq('id', match.next_match_id);
    if (advanceError) throw advanceError;
  }
}

export async function forfeitMatch(matchId: string, forfeitingSlot: 'a' | 'b'): Promise<void> {
  const { data: match, error } = await supabase.from('matches').select('team_a_id, team_b_id').eq('id', matchId).single();
  if (error) throw error;

  const winnerTeamId = forfeitingSlot === 'a' ? match.team_b_id : match.team_a_id;
  if (!winnerTeamId) throw new Error('Both teams must be set before recording a forfeit.');

  const { data: matchRow, error: fetchError } = await supabase
    .from('matches')
    .select('next_match_id, next_match_slot')
    .eq('id', matchId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from('matches')
    .update({ winner_team_id: winnerTeamId, status: forfeitingSlot === 'a' ? 'forfeit_a' : 'forfeit_b' })
    .eq('id', matchId);
  if (updateError) throw updateError;

  if (matchRow.next_match_id) {
    const { error: advanceError } = await supabase
      .from('matches')
      .update(matchRow.next_match_slot === 'a' ? { team_a_id: winnerTeamId } : { team_b_id: winnerTeamId })
      .eq('id', matchRow.next_match_id);
    if (advanceError) throw advanceError;
  }
}

// 5. Standings (Postgres view — always live, never stale) -------------------

export async function fetchStandings(leagueId: string): Promise<StandingsRow[]> {
  const { data, error } = await supabase
    .from('league_standings')
    .select('*')
    .eq('league_id', leagueId)
    .order('wins', { ascending: false })
    .order('losses', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    team_id: string;
    team_name: string;
    games_played: number;
    wins: number;
    losses: number;
    ties: number;
  }>).map((row) => ({
    teamId: row.team_id,
    teamName: row.team_name,
    gamesPlayed: row.games_played,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
  }));
}

// 6. Stat categories + entries ----------------------------------------------

export async function fetchStatCategories(leagueId: string): Promise<StatCategory[]> {
  const { data, error } = await supabase
    .from('league_stat_categories')
    .select('id, league_id, name, unit')
    .eq('league_id', leagueId)
    .order('name', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({ id: row.id, leagueId: row.league_id, name: row.name, unit: row.unit }));
}

export async function createStatCategory(leagueId: string, name: string, unit: string | null): Promise<StatCategory> {
  const { data, error } = await supabase
    .from('league_stat_categories')
    .insert({ league_id: leagueId, name, unit })
    .select('id, league_id, name, unit')
    .single();

  if (error) throw error;
  return { id: data.id, leagueId: data.league_id, name: data.name, unit: data.unit };
}

export async function deleteStatCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from('league_stat_categories').delete().eq('id', categoryId);
  if (error) throw error;
}

export async function recordPlayerStat(input: {
  leagueId: string;
  statCategoryId: string;
  userId: string;
  teamId: string | null;
  matchId: string | null;
  value: number;
  recordedBy: string;
}): Promise<void> {
  const { error } = await supabase.from('player_stats').insert({
    league_id: input.leagueId,
    stat_category_id: input.statCategoryId,
    user_id: input.userId,
    team_id: input.teamId,
    match_id: input.matchId,
    value: input.value,
    recorded_by: input.recordedBy,
  });
  if (error) throw error;
}

export async function fetchStatTotals(leagueId: string): Promise<StatTotal[]> {
  const { data, error } = await supabase
    .from('league_player_stat_totals')
    .select('*')
    .eq('league_id', leagueId)
    .order('total', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    stat_category_id: string;
    category_name: string;
    category_unit: string | null;
    user_id: string;
    team_id: string | null;
    total: number;
    entry_count: number;
  }>;

  if (rows.length === 0) return [];

  // The view is an aggregate over player_stats, so PostgREST can't reliably
  // embed a profiles join through it — fetch names in a second query instead.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', userIds);
  if (profileError) throw profileError;

  const nameByUserId = new Map((profileRows ?? []).map((p) => [p.id as string, (p.name as string | null)?.trim()]));

  return rows.map((row) => ({
    statCategoryId: row.stat_category_id,
    categoryName: row.category_name,
    categoryUnit: row.category_unit,
    userId: row.user_id,
    userName: nameByUserId.get(row.user_id) || 'Nameless legend',
    teamId: row.team_id,
    total: Number(row.total),
    entryCount: row.entry_count,
  }));
}

// 7. Announcements ------------------------------------------------------------

type AnnouncementRow = {
  id: string;
  league_id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  pinned: boolean;
  archived_at: string | null;
  created_at: string;
  profiles: { name: string | null; avatar_url: string | null } | null;
};

const ANNOUNCEMENT_SELECT = 'id, league_id, author_id, body, image_url, pinned, archived_at, created_at, profiles(name, avatar_url)';

function mapAnnouncementRow(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    leagueId: row.league_id,
    authorId: row.author_id,
    authorName: row.profiles?.name?.trim() || 'Nameless legend',
    authorAvatarUrl: row.profiles?.avatar_url ?? null,
    body: row.body,
    imageUrl: row.image_url,
    pinned: row.pinned,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

/** Active (non-archived) Bulletin posts, pinned ones first. */
export async function fetchAnnouncements(leagueId: string): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('league_announcements')
    .select(ANNOUNCEMENT_SELECT)
    .eq('league_id', leagueId)
    .is('archived_at', null)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as AnnouncementRow[]).map(mapAnnouncementRow);
}

export async function postAnnouncement(
  leagueId: string,
  authorId: string,
  body: string,
  imageUrl: string | null = null
): Promise<void> {
  const { error } = await supabase
    .from('league_announcements')
    .insert({ league_id: leagueId, author_id: authorId, body, image_url: imageUrl });
  if (error) throw error;
}

export async function pinAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase.from('league_announcements').update({ pinned: true }).eq('id', announcementId);
  if (error) throw error;
}

export async function unpinAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase.from('league_announcements').update({ pinned: false }).eq('id', announcementId);
  if (error) throw error;
}

export async function archiveAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase
    .from('league_announcements')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', announcementId);
  if (error) throw error;
}

export async function deleteAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase.from('league_announcements').delete().eq('id', announcementId);
  if (error) throw error;
}

// 8. Announcements home: merged Bulletin + system-event activity feed --------
// Bulletin posts (from league_announcements) are never duplicated into
// league_activity_feed — their pinned/archived state can change after
// posting. Merged client-side: pinned Bulletin posts always float to the
// top, everything else (unpinned Bulletin + system events) is one
// reverse-chronological list below.

export async function fetchActivityFeed(leagueId: string, limit = 30): Promise<ActivityFeedItem[]> {
  const [{ data: announcementRows, error: announcementError }, { data: eventRows, error: eventError }] = await Promise.all([
    supabase
      .from('league_announcements')
      .select(ANNOUNCEMENT_SELECT)
      .eq('league_id', leagueId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('league_activity_feed')
      .select('id, event_type, actor_id, related_id, payload, created_at')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (announcementError) throw announcementError;
  if (eventError) throw eventError;

  const bulletinItems: ActivityFeedItem[] = ((announcementRows ?? []) as unknown as AnnouncementRow[]).map((row) => {
    const announcement = mapAnnouncementRow(row);
    return {
      id: announcement.id,
      kind: 'bulletin',
      createdAt: announcement.createdAt,
      pinned: announcement.pinned,
      authorName: announcement.authorName,
      authorAvatarUrl: announcement.authorAvatarUrl,
      body: announcement.body,
      imageUrl: announcement.imageUrl,
    };
  });

  const systemItems: ActivityFeedItem[] = ((eventRows ?? []) as unknown as Array<{
    id: string;
    event_type: ActivityEventType;
    actor_id: string | null;
    related_id: string | null;
    payload: Record<string, unknown>;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    kind: row.event_type,
    createdAt: row.created_at,
    pinned: false,
    actorId: row.actor_id,
    relatedId: row.related_id,
    payload: row.payload,
  }));

  const pinned = bulletinItems.filter((item) => item.pinned);
  const rest = [...bulletinItems.filter((item) => !item.pinned), ...systemItems].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return [...pinned, ...rest].slice(0, limit);
}

/** One-line human summary for a system-generated activity feed item. */
export function describeActivityItem(item: ActivityFeedItem): string {
  const payload = item.payload ?? {};
  switch (item.kind) {
    case 'match_result': {
      const aName = (payload.team_a_name as string | null) ?? 'Team A';
      const bName = (payload.team_b_name as string | null) ?? 'Team B';
      if (payload.status === 'forfeit_a') return `${bName} won — ${aName} forfeited`;
      if (payload.status === 'forfeit_b') return `${aName} won — ${bName} forfeited`;
      const aScore = payload.team_a_score;
      const bScore = payload.team_b_score;
      return `${aName} ${aScore ?? '–'} · ${bScore ?? '–'} ${bName}`;
    }
    case 'standings_change':
      return `${payload.team_name ?? 'A team'} moved to #${payload.new_rank}`;
    case 'team_created':
      return `${payload.team_name ?? 'A new team'} was formed`;
    case 'settings_change': {
      const fields = Object.keys(payload);
      if (fields.length === 0) return 'League settings were updated';
      return `Updated ${fields.join(', ').replace(/_/g, ' ')}`;
    }
    default:
      return '';
  }
}
