import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { PickThreeField } from '@/components/profile/pick-three-field';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { SportTagsField } from '@/components/profile/sport-tags-field';
import { ContentMenu, type ReportReasonOption } from '@/components/moderation/content-menu';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { fetchAllowsConnectionRequests, fetchIsPrivate } from '@/lib/connections';
import {
  fetchFollowCounts,
  fetchFollowState,
  fetchMutualFollowsCount,
  followUser,
  unfollowUser,
  type FollowState,
} from '@/lib/follows';
import { blockUser, fetchBlockedEitherDirection, reportContent, type ReportReason } from '@/lib/moderation';
import { fetchProfile, type Profile } from '@/lib/profile';

const PROFILE_REPORT_REASONS: ReportReasonOption[] = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'fake_profile', label: 'Fake profile' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

export default function UserProfileScreen() {
  const { id, src } = useLocalSearchParams<{ id: string; src?: string }>();
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [follow, setFollow] = useState<FollowState>({ iFollow: false, followsMe: false });
  const [allowsRequests, setAllowsRequests] = useState(true);
  const [isPrivate, setIsPrivate] = useState(true);
  const [mutualCount, setMutualCount] = useState(0);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!currentUserId || !id) return;

    if (id === currentUserId) {
      router.replace('/(tabs)/profile');
      return;
    }

    setLoading(true);
    try {
      const blockedIds = await fetchBlockedEitherDirection(currentUserId);
      if (blockedIds.includes(id)) {
        setBlocked(true);
        setLoading(false);
        return;
      }
      setBlocked(false);

      const [fetchedProfile, allows, priv] = await Promise.all([
        fetchProfile(id),
        fetchAllowsConnectionRequests(id),
        fetchIsPrivate(id),
      ]);

      // Follow state is non-fatal: if the follows table is missing or the
      // query hiccups, still render the profile with a default not-following
      // state (the button shows "Follow"; tapping it surfaces the real error).
      let state: FollowState = { iFollow: false, followsMe: false };
      try {
        state = await fetchFollowState(currentUserId, id);
      } catch (followError) {
        console.warn('[user-profile] could not load follow state:', followError);
      }

      setProfile(fetchedProfile);
      setFollow(state);
      setAllowsRequests(allows);
      setIsPrivate(priv);

      // Non-fatal, shown as a stat row regardless of follow state — fail
      // soft so a hiccup here never blocks the rest of the profile.
      fetchFollowCounts(id).then(setFollowCounts).catch(() => {});
      fetchMutualFollowsCount(currentUserId, id).then(setMutualCount).catch(() => {});
    } catch (e) {
      Alert.alert('Could not load this profile', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleFollow = async () => {
    if (!currentUserId || !id) return;
    if (!allowsRequests) {
      Alert.alert('Follows off', `${profile?.name || 'This person'} isn't accepting new followers right now.`);
      return;
    }
    setBusy(true);
    try {
      await followUser(currentUserId, id);
      setFollow((prev) => ({ ...prev, iFollow: true }));
      await load();
    } catch (e) {
      Alert.alert('Could not follow', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  // Tapping "Following" unfollows immediately — one-way edge, no approval
  // concept, and it never touches their edge toward me.
  const handleUnfollow = async () => {
    if (!currentUserId || !id) return;
    setBusy(true);
    try {
      await unfollowUser(currentUserId, id);
      setFollow((prev) => ({ ...prev, iFollow: false }));
      await load();
    } catch (e) {
      Alert.alert('Could not unfollow', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async (reason: ReportReason) => {
    if (!currentUserId || !id) return;
    try {
      await reportContent(currentUserId, 'profile', id, reason);
      Alert.alert('Reported', "Thanks for flagging this — we'll take a look.");
    } catch (e) {
      Alert.alert('Could not send report', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleBlock = () => {
    if (!currentUserId || !id) return;
    Alert.alert(`Block ${profile?.name || 'this person'}?`, "You won't see each other's content or profiles anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(currentUserId, id);
            router.back();
          } catch (e) {
            Alert.alert('Could not block user', e instanceof Error ? e.message : 'Unknown error.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  if (blocked) {
    return (
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.unavailable}>
          <Text style={styles.unavailableText}>This profile isn't available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) return null;

  const isMutual = follow.iFollow && follow.followsMe;
  const canSeeFullProfile = !isPrivate || isMutual;
  const cameFromQr = src === 'qr' && !follow.iFollow;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile.name || 'Nameless legend'}
        </Text>
        <AnimatedPressable onPress={() => setMenuOpen(true)} hitSlop={8}>
          <MoreHorizontal size={22} color={colors.text} strokeWidth={1.75} />
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <ProfileAvatar name={profile.name} photoUri={profile.avatarUrl} size={84} />
        </View>

        {cameFromQr ? (
          <View style={styles.qrBanner}>
            <Text style={styles.qrBannerText}>
              You scanned {profile.name || "this person's"} code — give them a follow?
            </Text>
          </View>
        ) : null}

        <View style={styles.statRow}>
          <AnimatedPressable style={styles.stat} onPress={() => router.push(`/follows?tab=followers&userId=${id}`)}>
            <Text style={styles.statValue}>{followCounts.followers}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </AnimatedPressable>
          <View style={styles.statDivider} />
          <AnimatedPressable style={styles.stat} onPress={() => router.push(`/follows?tab=following&userId=${id}`)}>
            <Text style={styles.statValue}>{followCounts.following}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </AnimatedPressable>
          <View style={styles.statDivider} />
          <AnimatedPressable style={styles.stat} onPress={() => router.push(`/follows?tab=mutual&userId=${id}`)}>
            <Text style={styles.statValue}>{mutualCount}</Text>
            <Text style={styles.statLabel}>Mutual</Text>
          </AnimatedPressable>
        </View>

        {canSeeFullProfile ? (
          <>
            {profile.location ? <Text style={styles.location}>{profile.location}</Text> : null}
            {profile.legend ? <Text style={styles.bio}>{profile.legend}</Text> : null}
            <SportTagsField editing={false} selected={profile.sportTags} />
          </>
        ) : (
          <Text style={styles.privateText}>Follow each other to see more</Text>
        )}

        <View style={styles.actionRow}>
          {follow.iFollow ? (
            <AnimatedPressable style={styles.connectedButton} onPress={handleUnfollow} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.blue} size="small" />
              ) : (
                <Text style={styles.connectedButtonText}>Following ✓</Text>
              )}
            </AnimatedPressable>
          ) : (
            <AnimatedPressable style={styles.primaryButton} onPress={handleFollow} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={ON_ACCENT} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>{follow.followsMe ? 'Follow back' : 'Follow'}</Text>
              )}
            </AnimatedPressable>
          )}
        </View>

        {follow.followsMe ? <Text style={styles.followsYouText}>Follows you</Text> : null}

        {canSeeFullProfile ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pick Your 3</Text>
              <PickThreeField editing={false} items={profile.pickThree} />
            </View>
          </>
        ) : null}

        </ScrollView>
      </KeyboardAvoidingView>

      <ContentMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        canDelete={false}
        showReportAndBlock
        authorName={profile.name || 'this person'}
        onDelete={() => {}}
        onReport={handleReport}
        onBlock={handleBlock}
        reportReasons={PROFILE_REPORT_REASONS}
      />
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
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text, flex: 1, textAlign: 'center' },
    unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    unavailableText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
    content: { padding: 20, paddingBottom: 48, gap: 4 },
    avatarSection: { alignItems: 'center' },
    qrBanner: {
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: RADII.md,
      backgroundColor: colors.borderSoft,
    },
    qrBannerText: { fontSize: 13, fontWeight: WEIGHT.medium, color: colors.text, textAlign: 'center' },
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
    privateText: {
      marginTop: 14,
      fontSize: 14,
      fontStyle: 'italic',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    location: { marginTop: 14, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    bio: { marginTop: 8, fontSize: 15, fontStyle: 'italic', color: colors.text, textAlign: 'center' },
    actionRow: { marginTop: 18, alignItems: 'center' },
    followsYouText: { marginTop: 8, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
    primaryButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: RADII.md,
      backgroundColor: colors.coral,
    },
    primaryButtonText: { fontWeight: WEIGHT.semibold, fontSize: 14, color: ON_ACCENT },
    secondaryButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    secondaryButtonText: { fontWeight: WEIGHT.semibold, fontSize: 14, color: colors.text },
    connectedButton: {
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.blue,
      backgroundColor: colors.background,
    },
    connectedButtonText: { fontWeight: WEIGHT.semibold, fontSize: 14, color: colors.blue },
    section: { marginTop: 26, gap: 10 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
  });
}
