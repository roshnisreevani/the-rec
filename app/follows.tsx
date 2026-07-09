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
import { fetchFollowers, fetchFollowing, type FollowUser } from '@/lib/follows';

type Tab = 'followers' | 'following';

export default function FollowsScreen() {
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<Tab>(initialTab === 'following' ? 'following' : 'followers');
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        const [fetchedFollowers, fetchedFollowing] = await Promise.all([
          fetchFollowers(userId),
          fetchFollowing(userId),
        ]);
        if (cancelled) return;
        setFollowers(fetchedFollowers);
        setFollowing(fetchedFollowing);
      } catch (e) {
        if (!cancelled) Alert.alert('Could not load list', errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const data = tab === 'followers' ? followers : following;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>{tab === 'followers' ? 'Followers' : 'Following'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.tabRow}>
        {(['followers', 'following'] as const).map((t) => {
          const selected = t === tab;
          return (
            <AnimatedPressable
              key={t}
              style={[styles.tabPill, selected && styles.tabPillSelected]}
              onPress={() => setTab(t)}>
              <Text style={[styles.tabPillText, selected && styles.tabPillTextSelected]}>
                {t === 'followers' ? `Followers (${followers.length})` : `Following (${following.length})`}
              </Text>
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
              {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
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
