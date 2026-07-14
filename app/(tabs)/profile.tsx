import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Archive, Bell, Flame, MapPin, Settings, Users, X } from 'lucide-react-native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CrestAvatar } from '@/components/profile/crest-avatar';
import { PickThreeField } from '@/components/profile/pick-three-field';
import { PinnieIcon } from '@/components/profile/pinnie-icon';
import { QrShareModal } from '@/components/profile/qr-share-modal';
import { SportTagsField } from '@/components/profile/sport-tags-field';
import { TrophyCase } from '@/components/profile/trophy-case';
import { PostThumbnailGrid } from '@/components/feed/post-thumbnail-grid';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { fetchActivityStreakWeeks } from '@/lib/activity-streak';
import { fetchFollowCounts } from '@/lib/follows';
import { fetchMyGroupsCount } from '@/lib/groups';
import { fetchUnreadNotificationCount } from '@/lib/notifications';
import { fetchFeaturedPosts, type Post } from '@/lib/posts';
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
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [groupsCount, setGroupsCount] = useState(0);
  const [featuredPosts, setFeaturedPosts] = useState<Post[]>([]);
  const [streakWeeks, setStreakWeeks] = useState(0);

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

    // Drives the small badge on the bell icon — non-fatal: the badge just
    // stays at its last known value if this fails.
    try {
      setUnreadNotificationsCount(await fetchUnreadNotificationCount(userId));
    } catch {
      // Non-critical.
    }
    // Stat-row counts — same non-fatal treatment as the badges above.
    try {
      setFollowCounts(await fetchFollowCounts(userId));
    } catch {
      // Non-critical.
    }
    try {
      setGroupsCount(await fetchMyGroupsCount(userId));
    } catch {
      // Non-critical.
    }
    try {
      setFeaturedPosts(await fetchFeaturedPosts(userId));
    } catch {
      // Non-critical — Featured section just stays empty if this fails.
    }
    try {
      setStreakWeeks(await fetchActivityStreakWeeks(userId));
    } catch {
      // Non-critical — streak just stays at its last known value if this fails.
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
        {/* Top row: settings/bell icons (name moved into the centered header).
            The old person-add icon linked to /requests — gone now that follows
            are instant and there's nothing to approve. */}
        <View style={styles.topRow}>
          <View style={styles.topIcons}>
            <AnimatedPressable hitSlop={8} onPress={() => router.push('/connections')}>
              <Users size={22} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
            <AnimatedPressable hitSlop={8} onPress={() => router.push('/archive')}>
              <Archive size={22} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
            <AnimatedPressable hitSlop={8} onPress={() => router.push('/notifications')} style={styles.iconWrap}>
              <Bell size={22} color={colors.text} strokeWidth={1.75} />
              {unreadNotificationsCount > 0 ? (
                <IconBadge count={unreadNotificationsCount} color={colors.coral} styles={styles} />
              ) : null}
            </AnimatedPressable>
            <AnimatedPressable hitSlop={8} onPress={() => router.push('/settings')}>
              <Settings size={22} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Centered header: crest photo → streak → name → bio → location */}
        <View style={styles.headerStack}>
          <AnimatedPressable onPress={() => setAvatarViewerOpen(true)} hitSlop={4}>
            <CrestAvatar name={profile.name} photoUri={profile.avatarUrl} size={155} />
          </AnimatedPressable>

          {/* Streak counter — consecutive weeks with any app activity (see
              lib/activity-streak.ts). Hidden below 1 week rather than showing
              a deflating "0-week streak" to brand-new or inactive users. */}
          {streakWeeks > 0 ? (
            <View style={styles.streakPill}>
              <Flame size={14} color={colors.coral} strokeWidth={2} fill={colors.coral} />
              <Text style={styles.streakText}>{streakWeeks}-week streak</Text>
            </View>
          ) : null}

          <Text style={styles.name} numberOfLines={1}>
            {profile.name || 'Nameless legend'}
          </Text>

          {profile.legend ? <Text style={styles.bio}>{profile.legend}</Text> : null}

          {profile.location ? (
            <View style={styles.locationRow}>
              <MapPin size={14} color={colors.textSecondary} strokeWidth={1.75} />
              <Text style={styles.location} numberOfLines={2}>
                {profile.location}
              </Text>
            </View>
          ) : null}

        </View>

        {/* Stats — light rounded container, thin dividers */}
        <View style={styles.statRow}>
          <StatItem
            icon={<PinnieIcon size={17} color={colors.blue} />}
            value={followCounts.followers}
            label="Followers"
            onPress={() => router.push('/follows?tab=followers')}
            styles={styles}
          />
          <View style={styles.statDivider} />
          <StatItem
            icon={<PinnieIcon size={17} color={colors.coral} />}
            value={followCounts.following}
            label="Following"
            onPress={() => router.push('/follows?tab=following')}
            styles={styles}
          />
          <View style={styles.statDivider} />
          <StatItem
            icon={<Users size={17} color={colors.text} strokeWidth={1.75} />}
            value={groupsCount}
            label="Groups"
            onPress={() => router.push('/my-groups')}
            styles={styles}
          />
        </View>

        <View style={styles.sportTagsWrap}>
          <SportTagsField editing={false} selected={profile.sportTags} />
        </View>

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

        {/* Featured — posts promoted from Archive, deliberately separate
            from Pick Your 3. Read-only here; managed from /archive. */}
        {featuredPosts.length > 0 ? (
          <Section title="Featured" styles={styles}>
            <PostThumbnailGrid posts={featuredPosts} colors={colors} />
          </Section>
        ) : null}
      </ScrollView>

      {userId ? (
        <QrShareModal
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          userId={userId}
          name={profile.name}
        />
      ) : null}

      {/* Instagram-style enlarged view of the profile picture */}
      <Modal
        visible={avatarViewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarViewerOpen(false)}>
        <Pressable style={styles.avatarViewerBackdrop} onPress={() => setAvatarViewerOpen(false)}>
          <AnimatedPressable
            style={styles.avatarViewerClose}
            onPress={() => setAvatarViewerOpen(false)}
            hitSlop={10}>
            <X size={26} color="#FFFFFF" strokeWidth={2} />
          </AnimatedPressable>
          <CrestAvatar
            name={profile.name}
            photoUri={profile.avatarUrl}
            size={Math.round(Dimensions.get('window').width * 0.8)}
          />
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Small count badge for the top-row icons — deliberately given a distinct
// color per icon (blue for Connections/requests, coral for Notifications)
// so a pending connection request and unread post activity never look like
// the same kind of thing at a glance.
function IconBadge({ count, color, styles }: { count: number; color: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={[styles.iconBadge, { backgroundColor: color }]}>
      <Text style={styles.iconBadgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

function StatItem({
  icon,
  value,
  label,
  onPress,
  styles,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const content = (
    <>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (!onPress) return <View style={styles.stat}>{content}</View>;
  return (
    <AnimatedPressable style={styles.stat} onPress={onPress} hitSlop={4}>
      {content}
    </AnimatedPressable>
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
    iconWrap: { position: 'relative' },
    iconBadge: {
      position: 'absolute',
      top: -4,
      right: -6,
      minWidth: 15,
      height: 15,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: colors.background,
    },
    iconBadgeText: { fontSize: 9, fontWeight: WEIGHT.bold, color: ON_ACCENT },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
    topIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    // Everything in the header is center-aligned, stacked photo-first.
    headerStack: { alignItems: 'center', gap: 8, marginTop: 8 },
    streakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 2,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: RADII.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    streakText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    name: { fontSize: 22, fontFamily: FONTS.display, color: colors.text, textAlign: 'center' },
    locationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    // Light rounded container with thin dividers between the three stats.
    statRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: 18,
      backgroundColor: colors.borderSoft,
      borderRadius: RADII.lg,
      paddingVertical: 12,
    },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    statDivider: { width: 1, backgroundColor: colors.border },
    statValue: { fontSize: 17, fontWeight: WEIGHT.bold, color: colors.text },
    statLabel: { fontSize: 11, color: colors.textSecondary },
    location: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    bio: {
      fontSize: 14,
      fontStyle: 'italic',
      fontWeight: WEIGHT.semibold,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    sportTagsWrap: { alignItems: 'center', marginTop: 14 },
    avatarViewerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarViewerClose: { position: 'absolute', top: 60, right: 24 },
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
    secondaryButtonText: { fontFamily: FONTS.displaySemibold, fontSize: 14, color: colors.text },
    primaryButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 11,
      borderRadius: RADII.md,
      backgroundColor: colors.coral,
    },
    primaryButtonText: { fontFamily: FONTS.displaySemibold, fontSize: 14, color: ON_ACCENT },
    section: { marginTop: 26, gap: 10 },
    sectionTitle: { fontSize: 13, fontFamily: FONTS.displaySemibold, color: colors.text },
  });
}
