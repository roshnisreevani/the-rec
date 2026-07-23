import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Plus, Trophy } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeagueCard } from '@/components/leagues/league-card';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchBrowseLeagues, fetchMyLeagues, joinPublicLeague, type League } from '@/lib/leagues';

type LeaguesTab = 'mine' | 'discover';

export default function LeaguesScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<LeaguesTab>('mine');
  const [myLeagues, setMyLeagues] = useState<League[]>([]);
  const [browseLeagues, setBrowseLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!userId) return;
      if (isRefresh) setRefreshing(true);
      try {
        const [mine, browse] = await Promise.all([fetchMyLeagues(userId), fetchBrowseLeagues(userId)]);
        setMyLeagues(mine);
        setBrowseLeagues(browse);
      } catch (e) {
        Alert.alert('Could not load Leagues', errorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleJoin = async (league: League) => {
    if (!userId) return;
    setJoiningId(league.id);
    try {
      await joinPublicLeague(league.id, userId);
      router.push(`/league/${league.id}`);
      load();
    } catch (e) {
      Alert.alert('Could not join league', errorMessage(e));
    } finally {
      setJoiningId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leagues</Text>
        <AnimatedPressable style={styles.createButton} onPress={() => router.push('/create-league')}>
          <Plus size={16} color={ON_ACCENT} strokeWidth={2.5} />
          <Text style={styles.createButtonText}>Create League</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.segmentWrap}>
        <AnimatedPressable
          style={[styles.segment, tab === 'mine' && styles.segmentActive]}
          onPress={() => setTab('mine')}>
          <Text style={[styles.segmentText, tab === 'mine' && styles.segmentTextActive]}>My Leagues</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.segment, tab === 'discover' && styles.segmentActive]}
          onPress={() => setTab('discover')}>
          <Text style={[styles.segmentText, tab === 'discover' && styles.segmentTextActive]}>Discover</Text>
        </AnimatedPressable>
      </View>

      {tab === 'mine' ? (
        <FlatList
          data={myLeagues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.text} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Trophy size={40} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No leagues yet</Text>
              <Text style={styles.emptyText}>
                Create a league to run a bracket, round robin, or season standings — or join one from the Discover
                tab or an invite link.
              </Text>
              <AnimatedPressable style={styles.emptyButton} onPress={() => router.push('/create-league')}>
                <Text style={styles.emptyButtonText}>Create a League</Text>
              </AnimatedPressable>
            </View>
          }
          renderItem={({ item }) => <LeagueCard league={item} onPress={() => router.push(`/league/${item.id}`)} />}
        />
      ) : (
        <FlatList
          data={browseLeagues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.text} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Trophy size={40} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No public leagues to join</Text>
              <Text style={styles.emptyText}>Nobody&apos;s opened a public league yet — be the first to create one.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.discoverRow}>
              <LeagueCard league={item} onPress={() => router.push(`/league/${item.id}`)} />
              <AnimatedPressable
                style={styles.joinButton}
                onPress={() => handleJoin(item)}
                disabled={joiningId === item.id}>
                {joiningId === item.id ? (
                  <ActivityIndicator color={ON_ACCENT} size="small" />
                ) : (
                  <Text style={styles.joinButtonText}>Join League</Text>
                )}
              </AnimatedPressable>
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
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 24, fontWeight: WEIGHT.bold, color: colors.text },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.blue,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    createButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 13 },
    segmentWrap: {
      flexDirection: 'row',
      backgroundColor: colors.borderSoft,
      borderRadius: RADII.md,
      padding: 3,
      marginHorizontal: 20,
      marginBottom: 14,
    },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADII.sm },
    segmentActive: { backgroundColor: colors.background },
    segmentText: { fontSize: 13, color: colors.textSecondary },
    segmentTextActive: { fontWeight: WEIGHT.semibold, color: colors.text },
    list: { paddingHorizontal: 20, paddingBottom: 48, flexGrow: 1 },
    discoverRow: { marginBottom: 14, gap: 8 },
    joinButton: {
      alignItems: 'center',
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
      paddingVertical: 10,
      marginTop: -6,
    },
    joinButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 13 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 20 },
    emptyTitle: { fontSize: 17, fontWeight: WEIGHT.bold, color: colors.text, marginTop: 4 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    emptyButton: {
      marginTop: 8,
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    emptyButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
