import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchFollowers, fetchFollowing, fetchMutualFollows, type FollowUser } from '@/lib/follows';

type Tab = 'followers' | 'following' | 'mutual';

/**
 * Followers/Following list — for your own profile by default, or for
 * someone else's when a `userId` param is passed (e.g. from user/[id].tsx's
 * stat row). A "Mutual" tab only appears when viewing someone else, showing
 * who you both follow.
 */
export default function FollowsScreen() {
  const { tab: initialTab, userId: targetUserIdParam } = useLocalSearchParams<{ tab?: string; userId?: string }>();
  const { session } = useAuth();
  const myUserId = session?.user.id;
  const targetUserId = targetUserIdParam || myUserId;
  const isOwnProfile = targetUserId === myUserId;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<Tab>(
    initialTab === 'following' ? 'following' : initialTab === 'mutual' ? 'mutual' : 'followers'
  );
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [mutual, setMutual] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetUserId) return;
    let cancelled = false;

    (async () => {
      try {
        const [fetchedFollowers, fetchedFollowing, fetchedMutual] = await Promise.all([
          fetchFollowers(targetUserId),
          fetchFollowing(targetUserId),
          !isOwnProfile && myUserId ? fetchMutualFollows(myUserId, targetUserId) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setFollowers(fetchedFollowers);
        setFollowing(fetchedFollowing);
        setMutual(fetchedMutual);
      } catch (e) {
        if (!cancelled) Alert.alert('Could not load list', errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUserId, myUserId, isOwnProfile]);

  const data = tab === 'followers' ? followers : tab === 'following' ? following : mutual;

  const tabs: Tab[] = isOwnProfile ? ['followers', 'following'] : ['followers', 'following', 'mutual'];

  const tabLabel = (t: Tab) => {
    if (t === 'followers') return `Followers (${followers.length})`;
    if (t === 'following') return `Following (${following.length})`;
    return `Mutual (${mutual.length})`;
  };

  const headerTitle = tab === 'followers' ? 'Followers' : tab === 'following' ? 'Following' : 'Mutual';

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.tabRow}>
        {tabs.map((t) => {
          const selected = t === tab;
          return (
            <AnimatedPressable
              key={t}
              style={[styles.tabPill, selected && styles.tabPillSelected]}
              onPress={() => setTab(t)}>
              <Text style={[styles.tabPillText, selected && styles.tabPillTextSelected]}>{tabLabel(t)}</Text>
            </AnimatedPressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'followers'
                ? 'No followers yet.'
                : tab === 'following'
                  ? 'Not following anyone yet.'
                  : "No mutual follows yet."}
            </Text>
          }
          renderItem={({ item }) => (
            <AnimatedPressable style={styles.row} onPress={() => router.push(`/user/${item.id}`)}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <InitialsAvatar name={item.name} size={40} />
              )}
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
            </AnimatedPressable>
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
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
    tabPill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    tabPillSelected: { backgroundColor: colors.coral, borderColor: colors.coral },
    tabPillText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    tabPillTextSelected: { color: ON_ACCENT },
    spinner: { marginTop: 30 },
    list: { padding: 20, paddingTop: 12, flexGrow: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    rowName: { flex: 1, fontSize: 14, fontWeight: WEIGHT.medium, color: colors.text },
    empty: { marginTop: 40, textAlign: 'center', fontSize: 14, color: colors.textSecondary },
  });
}
