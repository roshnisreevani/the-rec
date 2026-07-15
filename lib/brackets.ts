import { errorMessage } from '@/lib/error-message';
import { supabase } from '@/lib/supabase';

export type BracketStatus = 'active' | 'completed';
export type SeedingMethod = 'random' | 'manual';

export type Bracket = {
  id: string;
  groupId: string;
  createdBy: string;
  name: string;
  sportTag: string | null;
  description: string | null;
  startDate: string | null;
  seeding: SeedingMethod;
  status: BracketStatus;
  createdAt: string;
};

export type BracketParticipant = {
  id: string;
  bracketId: string;
  userId: string | null;
  displayName: string;
  seed: number;
};

export type BracketMatch = {
  id: string;
  bracketId: string;
  round: number;
  matchIndex: number;
  participantA: BracketParticipant | null;
  participantB: BracketParticipant | null;
  winnerId: string | null;
};

export type BracketDetail = {
  bracket: Bracket;
  participants: BracketParticipant[];
  matches: BracketMatch[];
  totalRounds: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Returns ceil(log2(n)) — number of rounds for n participants. */
function totalRounds(n: number): number {
  return Math.ceil(Math.log2(n));
}

export async function fetchGroupBrackets(groupId: string): Promise<Bracket[]> {
  const { data, error } = await supabase
    .from('brackets')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(errorMessage(error, 'Could not fetch brackets'));

  return (data ?? []).map((r) => ({
    id: r.id,
    groupId: r.group_id,
    createdBy: r.created_by,
    name: r.name,
    sportTag: r.sport_tag,
    description: r.description,
    startDate: r.start_date,
    seeding: r.seeding,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function fetchBracketDetail(bracketId: string): Promise<BracketDetail | null> {
  const [bracketRes, participantsRes, matchesRes] = await Promise.all([
    supabase.from('brackets').select('*').eq('id', bracketId).single(),
    supabase.from('bracket_participants').select('*').eq('bracket_id', bracketId).order('seed'),
    supabase.from('bracket_matches').select('*').eq('bracket_id', bracketId).order('round').order('match_index'),
  ]);

  if (bracketRes.error) throw new Error(errorMessage(bracketRes.error, 'Could not fetch bracket'));
  if (!bracketRes.data) return null;
  if (participantsRes.error) throw new Error(errorMessage(participantsRes.error, 'Could not fetch participants'));
  if (matchesRes.error) throw new Error(errorMessage(matchesRes.error, 'Could not fetch matches'));

  const b = bracketRes.data;
  const bracket: Bracket = {
    id: b.id,
    groupId: b.group_id,
    createdBy: b.created_by,
    name: b.name,
    sportTag: b.sport_tag,
    description: b.description,
    startDate: b.start_date,
    seeding: b.seeding,
    status: b.status,
    createdAt: b.created_at,
  };

  const participants: BracketParticipant[] = (participantsRes.data ?? []).map((p) => ({
    id: p.id,
    bracketId: p.bracket_id,
    userId: p.user_id,
    displayName: p.display_name,
    seed: p.seed,
  }));

  const participantMap = new Map(participants.map((p) => [p.id, p]));

  const matches: BracketMatch[] = (matchesRes.data ?? []).map((m) => ({
    id: m.id,
    bracketId: m.bracket_id,
    round: m.round,
    matchIndex: m.match_index,
    participantA: m.participant_a_id ? (participantMap.get(m.participant_a_id) ?? null) : null,
    participantB: m.participant_b_id ? (participantMap.get(m.participant_b_id) ?? null) : null,
    winnerId: m.winner_id,
  }));

  return { bracket, participants, matches, totalRounds: totalRounds(participants.length) };
}

export async function createBracket(input: {
  groupId: string;
  createdBy: string;
  name: string;
  sportTag: string | null;
  description: string | null;
  startDate: string | null;
  seeding: SeedingMethod;
  participants: { userId: string; displayName: string }[];
}): Promise<string> {
  const { data: bracketData, error: bracketError } = await supabase
    .from('brackets')
    .insert({
      group_id: input.groupId,
      created_by: input.createdBy,
      name: input.name,
      sport_tag: input.sportTag,
      description: input.description,
      start_date: input.startDate,
      seeding: input.seeding,
    })
    .select('id')
    .single();

  if (bracketError) throw new Error(errorMessage(bracketError, 'Could not create bracket'));

  const bracketId = bracketData.id;

  // Apply seeding
  const ordered = input.seeding === 'random' ? shuffle(input.participants) : input.participants;

  const { data: participantData, error: participantError } = await supabase
    .from('bracket_participants')
    .insert(
      ordered.map((p, i) => ({
        bracket_id: bracketId,
        user_id: p.userId,
        display_name: p.displayName,
        seed: i + 1,
      }))
    )
    .select('id, seed');

  if (participantError) throw new Error(errorMessage(participantError, 'Could not add participants'));

  // Sort participants by seed
  const seededParticipants = (participantData ?? []).sort((a, b) => a.seed - b.seed);
  const n = seededParticipants.length;
  const rounds = totalRounds(n);

  // Build round 1 matches: standard bracket pairing (1 vs last, 2 vs second-last…)
  // with byes for odd participants
  const round1Matches: { participant_a_id: string | null; participant_b_id: string | null }[] = [];
  const matchCount = Math.pow(2, rounds - 1); // always a power of 2

  for (let i = 0; i < matchCount; i++) {
    const aIdx = i;
    const bIdx = n - 1 - i;
    const a = aIdx < n ? seededParticipants[aIdx].id : null;
    const b = bIdx > aIdx && bIdx < n ? seededParticipants[bIdx].id : null;
    round1Matches.push({ participant_a_id: a, participant_b_id: b });
  }

  // Build all matches across all rounds (later rounds empty until winners advance)
  const allMatches: object[] = [];
  for (let r = 1; r <= rounds; r++) {
    const matchesInRound = Math.pow(2, rounds - r);
    for (let m = 0; m < matchesInRound; m++) {
      if (r === 1) {
        allMatches.push({
          bracket_id: bracketId,
          round: r,
          match_index: m,
          participant_a_id: round1Matches[m]?.participant_a_id ?? null,
          participant_b_id: round1Matches[m]?.participant_b_id ?? null,
          winner_id: null,
        });
      } else {
        allMatches.push({
          bracket_id: bracketId,
          round: r,
          match_index: m,
          participant_a_id: null,
          participant_b_id: null,
          winner_id: null,
        });
      }
    }
  }

  const { error: matchError } = await supabase.from('bracket_matches').insert(allMatches);
  if (matchError) throw new Error(errorMessage(matchError, 'Could not create bracket matches'));

  // Auto-advance any byes in round 1 (participant with no opponent)
  for (let i = 0; i < round1Matches.length; i++) {
    const match = round1Matches[i];
    if (match.participant_a_id && !match.participant_b_id) {
      // Bye — auto-advance participant_a
      await advanceWinnerInternal(bracketId, 1, i, match.participant_a_id, rounds);
    }
  }

  return bracketId;
}

/** Internal helper: set winner and advance to next round. */
async function advanceWinnerInternal(
  bracketId: string,
  round: number,
  matchIndex: number,
  winnerId: string,
  totalRoundsCount: number
): Promise<void> {
  // Find the match row id
  const { data: matchRow } = await supabase
    .from('bracket_matches')
    .select('id')
    .eq('bracket_id', bracketId)
    .eq('round', round)
    .eq('match_index', matchIndex)
    .single();

  if (!matchRow) return;

  await supabase.from('bracket_matches').update({ winner_id: winnerId }).eq('id', matchRow.id);

  const nextRound = round + 1;
  if (nextRound > totalRoundsCount) {
    // Final — mark bracket completed
    await supabase.from('brackets').update({ status: 'completed' }).eq('id', bracketId);
    return;
  }

  // Slot the winner into the next round's match
  const nextMatchIndex = Math.floor(matchIndex / 2);
  const isSlotA = matchIndex % 2 === 0;

  const { data: nextMatch } = await supabase
    .from('bracket_matches')
    .select('id')
    .eq('bracket_id', bracketId)
    .eq('round', nextRound)
    .eq('match_index', nextMatchIndex)
    .single();

  if (!nextMatch) return;

  await supabase
    .from('bracket_matches')
    .update(isSlotA ? { participant_a_id: winnerId } : { participant_b_id: winnerId })
    .eq('id', nextMatch.id);
}

export async function reportMatchWinner(
  bracketId: string,
  round: number,
  matchIndex: number,
  winnerId: string,
  totalRoundsCount: number
): Promise<void> {
  await advanceWinnerInternal(bracketId, round, matchIndex, winnerId, totalRoundsCount);
}
