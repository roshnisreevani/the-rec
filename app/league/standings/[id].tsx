import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Trophy } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchLeagueDetail, fetchStandings, type StandingsRow } from '@/lib/leagues';

export default function LeagueStandingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [leagueName, setLeagueName] = useState('');
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const [standings, detail] = await Promise.all([
        fetchStandings(id),
        fetchLeagueDetail(id, userId).catch(() => null),
      ]);
      setRows(standings);
      if (detail) setLeagueName(detail.league.name);
    } catch (e) {
      Alert.alert('Could not load standings', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {leagueName ? `${leagueName} · Standings` : 'Standings'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.teamId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            rows.length > 0 ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, styles.teamCell]}>Team</Text>
                <Text style={styles.headerCell}>W</Text>
                <Text style={styles.headerCell}>L</Text>
                <Text style={styles.headerCell}>T</Text>
                <Text style={styles.headerCell}>GP</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Trophy size={32} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={styles.emptyText}>No games completed yet — standings will fill in as results come in.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <View style={styles.teamCell}>
                <Text style={styles.rank}>{index + 1}</Text>
                <Text style={styles.teamName} numberOfLines={1}>
                  {item.teamName}
                </Text>
              </View>
              <Text style={styles.cell}>{item.wins}</Text>
              <Text style={styles.cell}>{item.losses}</Text>
              <Text style={styles.cell}>{item.ties}</Text>
              <Text style={styles.cell}>{item.gamesPlayed}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
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
    spinner: { marginTop: 30 },
    list: { padding: 20 },
    tableHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerCell: { flex: 1, fontSize: 11, fontWeight: WEIGHT.bold, color: colors.textSecondary, textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    teamCell: { flex: 3, flexDirection: 'row', alignItems: 'center', gap: 8 },
    rank: { fontSize: 12, fontWeight: WEIGHT.bold, color: colors.textSecondary, width: 16 },
    teamName: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text, flexShrink: 1 },
    cell: { flex: 1, fontSize: 14, color: colors.text, textAlign: 'center' },
    empty: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 20 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
}
