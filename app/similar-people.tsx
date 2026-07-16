import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchFollowCounts, fetchFollowState, fetchMutualFollowsCount, followUser, unfollowUser } from '@/lib/follows';
import { GAME_DAY_TYPES, type GameDayType } from '@/lib/gameday-quiz';
import { fetchSimilarByGameDayType, type SimilarPerson } from '@/lib/profile';

type EnrichedPerson = SimilarPerson & {
  followers: number;
  following: number;
  mutualCount: number;
  iFollow: boolean;
};

/**
 * The destination for Profile's "See N people like you" link — everyone who
 * landed on the same game-day type. Was previously plain unpressable text;
 * this is the actual screen it should have opened all along. Now also shows
 * each person's follower/following counts, how many mutual follows you
 * share, and a one-tap Follow so this list is actually useful for
 * connecting with them, not just browsing names.
 */
export default function SimilarPeopleScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const gameDayType = type as GameDayType;
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [people, setPeople] = useState<EnrichedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !gameDayType) return;
    try {
      const base = await fetchSimilarByGameDayType(userId, gameDayType);
      const enriched = await Promise.all(
        base.map(async (person) => {
          const [counts, mutualCount, followState] = await Promise.all([
            fetchFollowCounts(person.id),
            fetchMutualFollowsCount(userId, person.id),
            fetchFollowState(userId, person.id),
          ]);
          return {
            ...person,
            followers: counts.followers,
            following: counts.following,
            mutualCount,
            iFollow: followState.iFollow,
          };
        })
      );
      setPeople(enriched);
    } catch (e) {
      Alert.alert('Could not load this list', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId, gameDayType]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const typeLabel = gameDayType ? GAME_DAY_TYPES[gameDayType]?.label : null;

  const handleToggleFollow = async (person: EnrichedPerson) => {
    if (!userId) return;
    setBusyId(person.id);
    const nextFollow = !person.iFollow;
    setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, iFollow: nextFollow } : p)));
    try {
      if (nextFollow) {
        await followUser(userId, person.id);
      } else {
        await unfollowUser(userId, person.id);
      }
    } catch (e) {
      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, iFollow: !nextFollow } : p)));
      Alert.alert('Could not update follow', errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {typeLabel ?? 'People like you'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No one else has this type yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <AnimatedPressable style={styles.rowMain} onPress={() => router.push(`/user/${item.id}`)}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <InitialsAvatar name={item.name} size={44} />
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.followers} followers · {item.following} following
                    {item.mutualCount > 0 ? ` · ${item.mutualCount} mutual` : ''}
                  </Text>
                </View>
              </AnimatedPressable>

              <AnimatedPressable
                style={[styles.followButton, item.iFollow && styles.followButtonActive]}
                onPress={() => handleToggleFollow(item)}
                disabled={busyId === item.id}>
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={item.iFollow ? colors.text : colors.background} />
                ) : (
                  <Text style={[styles.followButtonText, item.iFollow && styles.followButtonTextActive]}>
                    {item.iFollow ? 'Following' : 'Follow'}
                  </Text>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text, flex: 1, textAlign: 'center' },
    spinner: { marginTop: 30 },
    list: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
    empty: {
      marginTop: 40,
      textAlign: 'center',
      fontStyle: 'italic',
      color: colors.textSecondary,
      paddingHorizontal: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarImage: { width: 44, height: 44, borderRadius: 22 },
    rowText: { flex: 1, gap: 2 },
    rowName: { fontSize: 15, fontWeight: WEIGHT.semibold, color: colors.text },
    rowMeta: { fontSize: 12, color: colors.textSecondary },
    followButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 78,
      alignItems: 'center',
    },
    followButtonActive: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    followButtonText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.background },
    followButtonTextActive: { color: colors.text },
  });
}
