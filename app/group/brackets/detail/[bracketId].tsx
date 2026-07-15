import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Trophy } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, GOLD, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import {
  fetchBracketDetail,
  reportMatchWinner,
  type BracketDetail,
  type BracketMatch,
  type BracketParticipant,
} from '@/lib/brackets';
import { SPORTS } from '@/lib/sports';

function sportLabel(tag: string | null) {
  if (!tag) return null;
  const sport = SPORTS.find((s) => s.value === tag);
  return sport ? `${sport.emoji} ${sport.label}` : null;
}

function MatchCard({
  match,
  onSelectWinner,
  canReport,
  styles,
  colors,
}: {
  match: BracketMatch;
  onSelectWinner: (match: BracketMatch) => void;
  canReport: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof import('@/contexts/theme-context').useThemeColors>;
}) {
  const a = match.participantA;
  const b = match.participantB;
  const done = !!match.winnerId;

  const rowStyle = (p: BracketParticipant | null) => {
    if (!p) return styles.participantRowEmpty;
    if (done && p.id === match.winnerId) return styles.participantRowWinner;
    if (done && p.id !== match.winnerId) return styles.participantRowLoser;
    return styles.participantRow;
  };

  const textStyle = (p: BracketParticipant | null) => {
    if (!p) return styles.participantNameEmpty;
    if (done && p.id === match.winnerId) return styles.participantNameWinner;
    if (done && p.id !== match.winnerId) return styles.participantNameLoser;
    return styles.participantName;
  };

  return (
    <Pressable
      style={[styles.matchCard, done && styles.matchCardDone]}
      onPress={() => !done && canReport && onSelectWinner(match)}
      disabled={done || !canReport || !a || !b}>
      {[a, b].map((p, i) => (
        <View key={i} style={rowStyle(p)}>
          <Text style={textStyle(p)} numberOfLines={1}>
            {p ? p.displayName : 'TBD'}
          </Text>
          {done && p?.id === match.winnerId ? (
            <Trophy size={12} color={GOLD} strokeWidth={2} />
          ) : null}
        </View>
      ))}
      {!done && canReport && a && b ? (
        <Text style={styles.tapHint}>tap to report winner</Text>
      ) : null}
    </Pressable>
  );
}

export default function BracketDetailScreen() {
  const { bracketId } = useLocalSearchParams<{ bracketId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [detail, setDetail] = useState<BracketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    if (!bracketId) return;
    try {
      setDetail(await fetchBracketDetail(bracketId));
    } catch (e) {
      Alert.alert('Could not load bracket', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [bracketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSelectWinner = (match: BracketMatch) => {
    if (!detail) return;
    const options = [match.participantA, match.participantB].filter(Boolean) as BracketParticipant[];
    Alert.alert(
      'Who won?',
      undefined,
      [
        ...options.map((p) => ({
          text: p.displayName,
          onPress: async () => {
            setReporting(true);
            try {
              await reportMatchWinner(
                detail.bracket.id,
                match.round,
                match.matchIndex,
                p.id,
                detail.totalRounds
              );
              await load();
            } catch (e) {
              Alert.alert('Could not save result', e instanceof Error ? e.message : 'Unknown error.');
            } finally {
              setReporting(false);
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (loading || !detail) {
    return (
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={colors?.text} /></View>
      </SafeAreaView>
    );
  }

  const { bracket, matches, totalRounds } = detail;

  // Find champion: winner of the final match
  const finalMatch = matches.find((m) => m.round === totalRounds && m.matchIndex === 0);
  const champion = finalMatch?.winnerId
    ? detail.participants.find((p) => p.id === finalMatch.winnerId)
    : null;

  // Group matches by round
  const roundsMap = new Map<number, BracketMatch[]>();
  for (const m of matches) {
    if (!roundsMap.has(m.round)) roundsMap.set(m.round, []);
    roundsMap.get(m.round)!.push(m);
  }

  const roundNumbers = Array.from(roundsMap.keys()).sort((a, b) => a - b);

  const roundLabel = (r: number) => {
    if (r === totalRounds) return '🏆 Final';
    if (r === totalRounds - 1) return 'Semifinals';
    if (r === totalRounds - 2) return 'Quarterfinals';
    return `Round ${r}`;
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{bracket.name}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Meta */}
        <View style={styles.meta}>
          {sportLabel(bracket.sportTag) ? (
            <Text style={styles.metaText}>{sportLabel(bracket.sportTag)}</Text>
          ) : null}
          {bracket.description ? (
            <Text style={styles.metaText}>{bracket.description}</Text>
          ) : null}
          <Text style={styles.metaText}>{detail.participants.length} participants</Text>
        </View>

        {/* Champion banner */}
        {champion ? (
          <View style={styles.championBanner}>
            <Trophy size={22} color={GOLD} strokeWidth={1.75} />
            <View>
              <Text style={styles.championLabel}>Champion</Text>
              <Text style={styles.championName}>{champion.displayName}</Text>
            </View>
          </View>
        ) : null}

        {reporting ? <ActivityIndicator color={colors.coral} style={{ marginVertical: 8 }} /> : null}

        {/* Bracket tree — scrolls horizontally */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.bracketTree}>
            {roundNumbers.map((r) => (
              <View key={r} style={styles.roundCol}>
                <Text style={styles.roundLabel}>{roundLabel(r)}</Text>
                <View style={styles.matchList}>
                  {(roundsMap.get(r) ?? [])
                    .sort((a, b) => a.matchIndex - b.matchIndex)
                    .map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        onSelectWinner={handleSelectWinner}
                        canReport={bracket.status === 'active' && !reporting}
                        styles={styles}
                        colors={colors}
                      />
                    ))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    content: { padding: 20, gap: 20, paddingBottom: 60 },
    meta: { gap: 4 },
    metaText: { fontSize: 13, color: colors.textSecondary },
    championBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: GOLD + '22',
      borderWidth: 1,
      borderColor: GOLD,
      borderRadius: RADII.lg,
      padding: 16,
    },
    championLabel: { fontSize: 11, fontWeight: WEIGHT.bold, color: GOLD, textTransform: 'uppercase' },
    championName: { fontSize: 18, fontWeight: WEIGHT.bold, color: colors.text },
    bracketTree: { flexDirection: 'row', gap: 12, paddingBottom: 8 },
    roundCol: { width: 160, gap: 10 },
    roundLabel: { fontSize: 12, fontWeight: WEIGHT.bold, color: colors.textSecondary, textAlign: 'center' },
    matchList: { gap: 10 },
    matchCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      overflow: 'hidden',
      backgroundColor: colors.background,
    },
    matchCardDone: { borderColor: colors.border },
    participantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    participantRowWinner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: GOLD + '18',
    },
    participantRowLoser: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      opacity: 0.45,
    },
    participantRowEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    participantName: { fontSize: 13, fontWeight: WEIGHT.medium, color: colors.text, flex: 1 },
    participantNameWinner: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text, flex: 1 },
    participantNameLoser: { fontSize: 13, fontWeight: WEIGHT.medium, color: colors.textSecondary, flex: 1 },
    participantNameEmpty: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', flex: 1 },
    tapHint: { fontSize: 10, color: colors.textSecondary, textAlign: 'center', paddingVertical: 5 },
  });
}
