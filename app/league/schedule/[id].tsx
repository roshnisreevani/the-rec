import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  addSeasonMatch,
  fetchLeagueDetail,
  fetchMatches,
  fetchTeams,
  forfeitMatch,
  generateRoundRobinSchedule,
  generateSingleEliminationBracket,
  recordMatchResult,
  type League,
  type LeagueRole,
  type Match,
  type Team,
} from '@/lib/leagues';

export default function LeagueScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [league, setLeague] = useState<League | null>(null);
  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>({});
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);

  const [seasonTeamAId, setSeasonTeamAId] = useState<string | null>(null);
  const [seasonTeamBId, setSeasonTeamBId] = useState<string | null>(null);
  const [addingMatch, setAddingMatch] = useState(false);

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const [detail, fetchedTeams, fetchedMatches] = await Promise.all([
        fetchLeagueDetail(id, userId),
        fetchTeams(id),
        fetchMatches(id),
      ]);
      setLeague(detail?.league ?? null);
      setMyRole(detail?.league.myRole ?? null);
      setTeams(fetchedTeams);
      setMatches(fetchedMatches);
    } catch (e) {
      Alert.alert('Could not load schedule', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCommissioner = myRole === 'commissioner' || myRole === 'co_commissioner';

  const handleGenerate = () => {
    if (!id || !league) return;
    const teamIds = teams.map((t) => t.id);

    if (league.format === 'double_elim') {
      Alert.alert(
        'Not built yet',
        'Double-elimination bracket generation is a known gap — add matches manually for now, or switch this league to another format.'
      );
      return;
    }

    Alert.alert(
      league.format === 'season' ? 'Add matches manually' : 'Generate schedule?',
      league.format === 'round_robin'
        ? `This creates one match for every pair of the ${teamIds.length} current teams.`
        : `Teams are seeded in the order they were created. This creates the full ${teamIds.length}-team bracket.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGenerating(true);
            try {
              if (league.format === 'single_elim') {
                await generateSingleEliminationBracket(id, teamIds);
              } else if (league.format === 'round_robin') {
                await generateRoundRobinSchedule(id, teamIds);
              }
              load();
            } catch (e) {
              Alert.alert('Could not generate schedule', errorMessage(e));
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  };

  const handleAddSeasonMatch = async () => {
    if (!id || !seasonTeamAId || !seasonTeamBId || seasonTeamAId === seasonTeamBId) return;
    setAddingMatch(true);
    try {
      await addSeasonMatch({ leagueId: id, teamAId: seasonTeamAId, teamBId: seasonTeamBId, scheduledAt: null });
      setSeasonTeamAId(null);
      setSeasonTeamBId(null);
      load();
    } catch (e) {
      Alert.alert('Could not add match', errorMessage(e));
    } finally {
      setAddingMatch(false);
    }
  };

  const handleSaveResult = async (match: Match) => {
    const entry = scores[match.id];
    const aScore = entry?.a ? parseInt(entry.a, 10) : null;
    const bScore = entry?.b ? parseInt(entry.b, 10) : null;
    if (aScore === null || bScore === null || Number.isNaN(aScore) || Number.isNaN(bScore)) {
      Alert.alert('Enter both scores', 'Fill in a score for each team before saving.');
      return;
    }
    if (!match.teamA || !match.teamB) return;

    const winnerTeamId = aScore === bScore ? null : aScore > bScore ? match.teamA.id : match.teamB.id;
    setSavingMatchId(match.id);
    try {
      await recordMatchResult(match.id, { teamAScore: aScore, teamBScore: bScore, winnerTeamId });
      load();
    } catch (e) {
      Alert.alert('Could not save result', errorMessage(e));
    } finally {
      setSavingMatchId(null);
    }
  };

  const handleForfeit = (match: Match, slot: 'a' | 'b') => {
    const forfeiting = slot === 'a' ? match.teamA : match.teamB;
    Alert.alert(`${forfeiting?.name ?? 'This team'} forfeits?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Forfeit',
        style: 'destructive',
        onPress: async () => {
          setSavingMatchId(match.id);
          try {
            await forfeitMatch(match.id, slot);
            load();
          } catch (e) {
            Alert.alert('Could not record forfeit', errorMessage(e));
          } finally {
            setSavingMatchId(null);
          }
        },
      },
    ]);
  };

  const matchesByRound = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const match of matches) {
      const key = match.round ?? 0;
      const list = map.get(key) ?? [];
      list.push(match);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  const isBracketFormat = league?.format === 'single_elim' || league?.format === 'double_elim';

  if (loading || !league) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {league.name} · Schedule
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {matches.length === 0 ? (
          <View style={styles.empty}>
            <CalendarClock size={32} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyText}>
              {teams.length < 2
                ? 'Create at least 2 teams before generating a schedule.'
                : isCommissioner
                  ? 'No matches yet.'
                  : "The commissioner hasn't set up the schedule yet."}
            </Text>
            {isCommissioner && teams.length >= 2 && league.format !== 'season' ? (
              <AnimatedPressable style={styles.generateButton} onPress={handleGenerate} disabled={generating}>
                {generating ? (
                  <ActivityIndicator color={ON_ACCENT} size="small" />
                ) : (
                  <Text style={styles.generateButtonText}>Generate Schedule</Text>
                )}
              </AnimatedPressable>
            ) : null}
          </View>
        ) : (
          matchesByRound.map(([round, roundMatches]) => (
            <View key={round} style={styles.section}>
              {isBracketFormat ? <Text style={styles.sectionTitle}>Round {round}</Text> : null}
              {roundMatches.map((match) => {
                const entry = scores[match.id] ?? { a: '', b: '' };
                const canEdit =
                  isCommissioner && match.status === 'scheduled' && !!match.teamA && !!match.teamB;
                return (
                  <View key={match.id} style={styles.matchCard}>
                    <View style={styles.matchRow}>
                      <Text style={styles.teamName} numberOfLines={1}>
                        {match.teamA?.name ?? 'BYE'}
                      </Text>
                      {canEdit ? (
                        <TextInput
                          style={styles.scoreInput}
                          keyboardType="number-pad"
                          value={entry.a}
                          onChangeText={(t) => setScores((prev) => ({ ...prev, [match.id]: { ...entry, a: t } }))}
                        />
                      ) : (
                        <Text style={styles.scoreText}>{match.teamAScore ?? '—'}</Text>
                      )}
                    </View>
                    <View style={styles.matchRow}>
                      <Text style={styles.teamName} numberOfLines={1}>
                        {match.teamB?.name ?? (match.round ? 'TBD' : 'BYE')}
                      </Text>
                      {canEdit ? (
                        <TextInput
                          style={styles.scoreInput}
                          keyboardType="number-pad"
                          value={entry.b}
                          onChangeText={(t) => setScores((prev) => ({ ...prev, [match.id]: { ...entry, b: t } }))}
                        />
                      ) : (
                        <Text style={styles.scoreText}>{match.teamBScore ?? '—'}</Text>
                      )}
                    </View>

                    {match.status !== 'scheduled' ? (
                      <Text style={styles.statusText}>
                        {match.status === 'completed'
                          ? match.winnerTeamId
                            ? `${match.winnerTeamId === match.teamA?.id ? match.teamA?.name : match.teamB?.name} won`
                            : 'Tie'
                          : match.status === 'forfeit_a'
                            ? `${match.teamA?.name ?? 'Team A'} forfeited`
                            : `${match.teamB?.name ?? 'Team B'} forfeited`}
                      </Text>
                    ) : null}

                    {canEdit ? (
                      <View style={styles.matchActions}>
                        <AnimatedPressable
                          style={styles.saveResultButton}
                          onPress={() => handleSaveResult(match)}
                          disabled={savingMatchId === match.id}>
                          {savingMatchId === match.id ? (
                            <ActivityIndicator color={ON_ACCENT} size="small" />
                          ) : (
                            <Text style={styles.saveResultButtonText}>Save Result</Text>
                          )}
                        </AnimatedPressable>
                        <AnimatedPressable onPress={() => handleForfeit(match, 'a')} hitSlop={6}>
                          <Text style={styles.forfeitText}>{match.teamA?.name} forfeits</Text>
                        </AnimatedPressable>
                        <AnimatedPressable onPress={() => handleForfeit(match, 'b')} hitSlop={6}>
                          <Text style={styles.forfeitText}>{match.teamB?.name} forfeits</Text>
                        </AnimatedPressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))
        )}

        {isCommissioner && league.format === 'season' && teams.length >= 2 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add a match</Text>
            <View style={styles.pillRow}>
              {teams.map((t) => (
                <AnimatedPressable
                  key={t.id}
                  style={[styles.pill, seasonTeamAId === t.id && styles.pillSelected]}
                  onPress={() => setSeasonTeamAId(t.id)}>
                  <Text style={[styles.pillText, seasonTeamAId === t.id && styles.pillTextSelected]}>{t.name}</Text>
                </AnimatedPressable>
              ))}
            </View>
            <Text style={styles.vsText}>vs</Text>
            <View style={styles.pillRow}>
              {teams
                .filter((t) => t.id !== seasonTeamAId)
                .map((t) => (
                  <AnimatedPressable
                    key={t.id}
                    style={[styles.pill, seasonTeamBId === t.id && styles.pillSelected]}
                    onPress={() => setSeasonTeamBId(t.id)}>
                    <Text style={[styles.pillText, seasonTeamBId === t.id && styles.pillTextSelected]}>{t.name}</Text>
                  </AnimatedPressable>
                ))}
            </View>
            <AnimatedPressable
              style={styles.generateButton}
              onPress={handleAddSeasonMatch}
              disabled={addingMatch || !seasonTeamAId || !seasonTeamBId}>
              {addingMatch ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.generateButtonText}>Add Match</Text>}
            </AnimatedPressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 50 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    generateButton: {
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
      paddingHorizontal: 20,
      paddingVertical: 12,
      marginTop: 4,
    },
    generateButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
    section: { marginTop: 22, gap: 10 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    matchCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      padding: 12,
      gap: 6,
    },
    matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    teamName: { flex: 1, fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    scoreText: { fontSize: 14, fontWeight: WEIGHT.bold, color: colors.text, minWidth: 24, textAlign: 'center' },
    scoreInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.sm,
      width: 44,
      textAlign: 'center',
      paddingVertical: 6,
      color: colors.text,
      fontSize: 14,
    },
    statusText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.blue },
    matchActions: { gap: 6, marginTop: 4, alignItems: 'flex-start' },
    saveResultButton: {
      alignSelf: 'stretch',
      alignItems: 'center',
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
      paddingVertical: 9,
    },
    saveResultButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 13 },
    forfeitText: { fontSize: 11, color: colors.textSecondary, textDecorationLine: 'underline' },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    pillSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
    pillText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    pillTextSelected: { color: ON_ACCENT },
    vsText: { fontSize: 12, color: colors.textSecondary, alignSelf: 'center' },
  });
}
