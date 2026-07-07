import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Bell, Flame, Settings } from 'lucide-react-native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PickThreeField } from '@/components/profile/pick-three-field';
import { GroupsBadge } from '@/components/profile/groups-badge';
import { PennieBadge } from '@/components/profile/pennie-badge';
import { SportsBadge } from '@/components/profile/sports-badge';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { QrShareModal } from '@/components/profile/qr-share-modal';
import { SportTagsField } from '@/components/profile/sport-tags-field';
import { TrophyCase } from '@/components/profile/trophy-case';
import { WalkupSongRow } from '@/components/profile/walkup-song-row';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { MOCK_GAMES_COUNT, MOCK_GROUPS_COUNT, MOCK_STREAK_WEEKS, MOCK_PENNIES_COUNT } from '@/lib/mock-stats';
import { emptyProfile, fetchProfile, saveProfile, type Profile, type Trophy } from '@/lib/profile';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const fetched = await fetchProfile(userId);
      setProfile(fetched);
    } catch (e) {
      Alert.alert('Could not load your profile', e instanceof Error ? e.message : 'Unknown error.');
      setProfile(emptyProfile(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Reload every time this tab gains focus, so edits made on the Edit Profile
  // screen show up immediately when the user comes back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Exactly one trophy can be "legendary" at a time — marking a new one
  // automatically clears the flag from whichever trophy had it before.
  const withLegendaryEnforced = (trophies: Trophy[], legendaryId: string | null): Trophy[] =>
    trophies.map((t) => ({ ...t, legendary: legendaryId !== null && t.id === legendaryId }));

  const handleAddTrophy = async (trophy: Omit<Trophy, 'id'>) => {
    if (!profile) return;
    const id = generateId();
    const added: Trophy = { ...trophy, id };
    const nextTrophies = trophy.legendary
      ? withLegendaryEnforced([...profile.trophies, added], id)
      : [...profile.trophies, added];
    const next: Profile = { ...profile, trophies: nextTrophies };
    setProfile(next);
    try {
      await saveProfile(next);
    } catch (e) {
      setProfile(profile);
      Alert.alert('Could not add trophy', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleUpdateTrophy = async (trophy: Trophy) => {
    if (!profile) return;
    const merged = profile.trophies.map((t) => (t.id === trophy.id ? trophy : t));
    const nextTrophies = trophy.legendary ? withLegendaryEnforced(merged, trophy.id) : merged;
    const next: Profile = { ...profile, trophies: nextTrophies };
    setProfile(next);
    try {
      await saveProfile(next);
    } catch (e) {
      setProfile(profile);
      Alert.alert('Could not update trophy', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleRemoveTrophy = async (id: string) => {
    if (!profile) return;
    const next: Profile = { ...profile, trophies: profile.trophies.filter((t) => t.id !== id) };
    setProfile(next);
    try {
      await saveProfile(next);
    } catch (e) {
      setProfile(profile);
      Alert.alert('Could not remove trophy', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Top row: name + settings/bell icons */}
        <View style={styles.topRow}>
          <Text style={styles.topName} numberOfLines={1}>
            {profile.name || 'Nameless legend'}
          </Text>
          <View style={styles.topIcons}>
            <AnimatedPressable hitSlop={8} onPress={() => Alert.alert('Notifications', 'Nothing new yet.')}>
              <Bell size={22} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
            <AnimatedPressable hitSlop={8} onPress={() => router.push('/settings')}>
              <Settings size={22} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Streak counter — mock until real attendance tracking exists */}
        <View style={styles.streakPill}>
          <Flame size={14} color={colors.coral} strokeWidth={2} fill={colors.coral} />
          <Text style={styles.streakText}>{MOCK_STREAK_WEEKS}-week streak</Text>
        </View>

        {/* Walk-up song — compact row right under the name/streak */}
        <View style={styles.songRowWrap}>
          {profile.walkupSong ? (
            <WalkupSongRow song={profile.walkupSong} />
          ) : (
            <Text style={styles.placeholderText}>No walk-up song yet — biggest character flaw, honestly.</Text>
          )}
        </View>

        {/* Avatar + stat row */}
        <View style={styles.avatarSection}>
          <ProfileAvatar name={profile.name} photoUri={profile.avatarUrl} size={84} />
          <View style={styles.statRow}>
            <PennieBadge count={MOCK_PENNIES_COUNT} />
            <GroupsBadge count={MOCK_GROUPS_COUNT} />
            <SportsBadge count={MOCK_GAMES_COUNT} />
          </View>
        </View>

        <Text style={styles.location}>{profile.location || 'Location unknown (probably local)'}</Text>

        <Text style={[styles.bio, !profile.legend && styles.placeholderText]}>
          {profile.legend || 'peaked in 8th grade, still showing up'}
        </Text>

        <SportTagsField editing={false} selected={profile.sportTags} />

        {/* Edit profile + Share */}
        <View style={styles.actionRow}>
          <AnimatedPressable style={styles.secondaryButton} onPress={() => router.push('/edit-profile')}>
            <Text style={styles.secondaryButtonText}>Edit profile</Text>
          </AnimatedPressable>
          <AnimatedPressable style={styles.primaryButton} onPress={handleShare}>
            <Text style={styles.primaryButtonText}>Share</Text>
          </AnimatedPressable>
        </View>

        {/* Pick Your 3 — now the sole primary section here since walk-up song moved up top */}
        <Section title="Pick Your 3" styles={styles}>
          <PickThreeField editing={false} items={profile.pickThree} />
        </Section>
      </ScrollView>

      {userId ? (
        <QrShareModal
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          userId={userId}
          name={profile.name}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Stat({ value, label, styles }: { value: number; label: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  children,
  styles,
}: {
  title: string;
  children: ReactNode;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 48, gap: 4 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topName: { fontSize: 20, fontWeight: WEIGHT.bold, color: colors.text, flex: 1 },
    topIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    streakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: RADII.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    streakText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    songRowWrap: { marginTop: 14 },
    avatarSection: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 18 },
    statRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
    stat: { alignItems: 'center' },
    statValue: { fontSize: 18, fontWeight: WEIGHT.bold, color: colors.text },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    location: { marginTop: 14, fontSize: 14, color: colors.textSecondary },
    bio: { marginTop: 8, fontSize: 15, fontStyle: 'italic', color: colors.text },
    placeholderText: { fontStyle: 'italic', color: colors.textSecondary },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    secondaryButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 11,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    secondaryButtonText: { fontWeight: WEIGHT.semibold, fontSize: 14, color: colors.text },
    primaryButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 11,
      borderRadius: RADII.md,
      backgroundColor: colors.coral,
    },
    primaryButtonText: { fontWeight: WEIGHT.semibold, fontSize: 14, color: ON_ACCENT },
    section: { marginTop: 26, gap: 10 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
  });
}
