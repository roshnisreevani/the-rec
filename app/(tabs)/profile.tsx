import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Archive, Bell, Bookmark, Download, MapPin, MessageCircle, RotateCcw, Rss, Settings, Users, X } from 'lucide-react-native';
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
import { GameDayBadge } from '@/components/profile/gameday-badge';
import { PhotoViewer } from '@/components/profile/photo-viewer';
import { PickThreeField } from '@/components/profile/pick-three-field';
import { PinnieIcon } from '@/components/profile/pinnie-icon';
import { QrShareModal } from '@/components/profile/qr-share-modal';
import { SportTagsField } from '@/components/profile/sport-tags-field';
import { PostThumbnailGrid } from '@/components/feed/post-thumbnail-grid';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchMyUpcomingEvents, formatEventDate, type UpcomingEvent } from '@/lib/events';
import { fetchFollowCounts } from '@/lib/follows';
import { GAME_DAY_TYPES } from '@/lib/gameday-quiz';
import { fetchMyGroupsCount } from '@/lib/groups';
import { fetchUnreadNotificationCount } from '@/lib/notifications';
import { fetchFeaturedPosts, type Post } from '@/lib/posts';
import { emptyProfile, fetchProfile, fetchSimilarByGameDayType, type Profile, type SimilarPerson } from '@/lib/profile';

export default function ProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [gameDayShareOpen, setGameDayShareOpen] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [pickThreeViewerIndex, setPickThreeViewerIndex] = useState<number | null>(null);
  const [activeContentTab, setActiveContentTab] = useState<'pickThree' | 'featured'>('pickThree');
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [groupsCount, setGroupsCount] = useState(0);
  const [featuredPosts, setFeaturedPosts] = useState<Post[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [similarPeople, setSimilarPeople] = useState<SimilarPerson[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;

    // All independent — fired together instead of one-by-one, so the screen
    // is ready after the slowest single request rather than the sum of all
    // of them. allSettled (not all) because the profile itself is the only
    // fatal one; a badge/count failing shouldn't block the rest.
    const [profileResult, notifResult, followResult, groupsResult, featuredResult, upcomingResult] =
      await Promise.allSettled([
        fetchProfile(userId),
        fetchUnreadNotificationCount(userId),
        fetchFollowCounts(userId),
        fetchMyGroupsCount(userId),
        fetchFeaturedPosts(userId),
        fetchMyUpcomingEvents(userId),
      ]);

    let loadedProfile: Profile | null = null;
    if (profileResult.status === 'fulfilled') {
      loadedProfile = profileResult.value;
      setProfile(loadedProfile);
    } else {
      Alert.alert('Could not load your profile', errorMessage(profileResult.reason));
      loadedProfile = emptyProfile(userId);
      setProfile(loadedProfile);
    }
    setLoading(false);

    // The rest are non-critical — each just keeps its last known value (or
    // its default) if its own fetch failed, without an alert per one.
    if (notifResult.status === 'fulfilled') setUnreadNotificationsCount(notifResult.value);
    if (followResult.status === 'fulfilled') setFollowCounts(followResult.value);
    if (groupsResult.status === 'fulfilled') setGroupsCount(groupsResult.value);
    if (featuredResult.status === 'fulfilled') setFeaturedPosts(featuredResult.value);
    if (upcomingResult.status === 'fulfilled') setUpcomingEvents(upcomingResult.value);

    if (loadedProfile.gameDayType) {
      fetchSimilarByGameDayType(userId, loadedProfile.gameDayType)
        .then(setSimilarPeople)
        .catch(() => setSimilarPeople([]));
    } else {
      setSimilarPeople([]);
    }
  }, [userId]);

  // Reload every time this tab gains focus, so edits made on the Edit Profile
  // screen show up immediately when the user comes back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
        {/* Top row: split left (Settings, Saved) / right (Connections, Archive,
            Notifications) instead of one clump — easier to scan, and keeps
            the two "personal config" icons away from the three "content"
            ones. The old person-add icon linked to /requests — gone now that
            follows are instant and there's nothing to approve. */}
        <View style={styles.topRow}>
          <View style={styles.topIcons}>
            <AnimatedPressable hitSlop={8} onPress={() => router.push('/settings')}>
              <Settings size={22} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
            <AnimatedPressable hitSlop={8} onPress={() => router.push('/saved-posts')}>
              <Bookmark size={22} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
          </View>
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
          </View>
        </View>

        {/* Centered header: crest photo → name → bio → location → streak/type pill */}
        <View style={styles.headerStack}>
          <AnimatedPressable onPress={() => setAvatarViewerOpen(true)} hitSlop={4}>
            <CrestAvatar name={profile.name} photoUri={profile.avatarUrl} size={155} />
          </AnimatedPressable>

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

          {/* Game-day type pill — a lightweight identity signal. Tapping it
              opens the share sheet if set, or the quiz if not taken yet. */}
          {profile.gameDayType ? (
            <View style={styles.identityPill}>
              <AnimatedPressable style={styles.identityPillItem} onPress={() => setGameDayShareOpen(true)}>
                <GameDayBadge type={profile.gameDayType} size={15} />
                <Text style={styles.identityPillText}>{GAME_DAY_TYPES[profile.gameDayType].label}</Text>
              </AnimatedPressable>
            </View>
          ) : null}

          {!profile.gameDayType ? (
            <AnimatedPressable onPress={() => router.push('/gameday-quiz')}>
              <Text style={styles.gameDayEmptyLink}>Take the 1-minute quiz to find your game-day type</Text>
            </AnimatedPressable>
          ) : null}

          {profile.gameDayType && similarPeople.length > 0 ? (
            <AnimatedPressable
              onPress={() => router.push(`/similar-people?type=${profile.gameDayType}`)}
              hitSlop={6}>
              <Text style={styles.seeAllLink}>See {similarPeople.length} people like you</Text>
            </AnimatedPressable>
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

        {/* Upcoming — next RSVP'd game pulled across all groups (see
            lib/events.ts fetchMyUpcomingEvents). Replaces the old static
            Pick Your 3 photo grid with something that reflects real
            commitments and is always relevant, not a one-time upload. */}
        {upcomingEvents.length > 0 ? (
          <Section title="Upcoming" styles={styles}>
            <AnimatedPressable
              style={styles.upcomingCard}
              onPress={() => router.push('/my-schedule')}>
              <View style={styles.upcomingTopRow}>
                <Text style={styles.upcomingDate}>{formatEventDate(upcomingEvents[0].eventDate).toUpperCase()}</Text>
                <View style={styles.goingPill}>
                  <Text style={styles.goingPillText}>Going</Text>
                </View>
              </View>
              <Text style={styles.upcomingTitle}>{upcomingEvents[0].title}</Text>
            </AnimatedPressable>
            {upcomingEvents.length > 1 ? (
              <AnimatedPressable onPress={() => router.push('/my-schedule')}>
                <Text style={styles.seeAllLink}>See full schedule</Text>
              </AnimatedPressable>
            ) : null}
          </Section>
        ) : null}

        {/* Pick Your 3 / Featured — a tab switcher instead of two stacked
            grids, so both are always reachable (Featured no longer hides
            when empty) without doubling the scroll length. */}
        <View style={styles.contentTabsWrap}>
          <View style={styles.contentTabsRow}>
            <AnimatedPressable onPress={() => setActiveContentTab('pickThree')}>
              <Text style={[styles.contentTab, activeContentTab === 'pickThree' && styles.contentTabActive]}>
                Pick Your 3
              </Text>
              {activeContentTab === 'pickThree' ? <View style={styles.contentTabIndicator} /> : null}
            </AnimatedPressable>
            <AnimatedPressable onPress={() => setActiveContentTab('featured')}>
              <Text style={[styles.contentTab, activeContentTab === 'featured' && styles.contentTabActive]}>
                Featured
              </Text>
              {activeContentTab === 'featured' ? <View style={styles.contentTabIndicator} /> : null}
            </AnimatedPressable>
          </View>

          {activeContentTab === 'pickThree' ? (
            <PickThreeField
              editing={false}
              items={profile.pickThree}
              onPressItem={setPickThreeViewerIndex}
            />
          ) : featuredPosts.length > 0 ? (
            <PostThumbnailGrid posts={featuredPosts} colors={colors} />
          ) : (
            <Text style={styles.contentEmptyText}>Nothing featured yet.</Text>
          )}
        </View>
      </ScrollView>

      {userId ? (
        <QrShareModal
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          userId={userId}
          name={profile.name}
        />
      ) : null}

      {/* Game-day type share sheet — feed/Banter/export are placeholders for
          now (posting + image export are their own chunks of work), but the
          picker itself is real. */}
      <Modal
        visible={gameDayShareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGameDayShareOpen(false)}>
        <Pressable style={styles.shareBackdrop} onPress={() => setGameDayShareOpen(false)}>
          <Pressable style={styles.shareSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.shareSheetTitle}>Share your game-day type</Text>
            <AnimatedPressable
              style={styles.shareOption}
              onPress={() => {
                setGameDayShareOpen(false);
                Alert.alert('Share to Feed', 'Coming soon.');
              }}>
              <Rss size={18} color={colors.text} strokeWidth={1.75} />
              <Text style={styles.shareOptionText}>Share to Feed</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.shareOption}
              onPress={() => {
                setGameDayShareOpen(false);
                Alert.alert('Share in Banter', 'Coming soon.');
              }}>
              <MessageCircle size={18} color={colors.text} strokeWidth={1.75} />
              <Text style={styles.shareOptionText}>Share with friends in Banter</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.shareOption}
              onPress={() => {
                setGameDayShareOpen(false);
                Alert.alert('Export image', 'Coming soon.');
              }}>
              <Download size={18} color={colors.text} strokeWidth={1.75} />
              <Text style={styles.shareOptionText}>Export as image</Text>
            </AnimatedPressable>
            <View style={styles.shareDivider} />
            <AnimatedPressable
              style={styles.shareOption}
              onPress={() => {
                setGameDayShareOpen(false);
                router.push('/gameday-quiz');
              }}>
              <RotateCcw size={18} color={colors.text} strokeWidth={1.75} />
              <Text style={styles.shareOptionText}>Retake quiz</Text>
            </AnimatedPressable>
          </Pressable>
        </Pressable>
      </Modal>

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

      <PhotoViewer
        photos={profile.pickThree}
        initialIndex={pickThreeViewerIndex ?? 0}
        visible={pickThreeViewerIndex !== null}
        onClose={() => setPickThreeViewerIndex(null)}
      />
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
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    // Everything in the header is center-aligned, stacked photo-first.
    headerStack: { alignItems: 'center', gap: 8, marginTop: 8 },
    // Combined streak + game-day type pill — one small surface instead of
    // two separate blocks, matching the compact centered layout.
    identityPill: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      backgroundColor: colors.borderSoft,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 7,
      gap: 10,
    },
    identityPillItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    identityPillText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    gameDayEmptyLink: { fontSize: 12, color: colors.coral, textAlign: 'center', marginTop: 2 },
    name: { fontSize: 22, fontWeight: WEIGHT.bold, color: colors.text, textAlign: 'center' },
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
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    contentTabsWrap: { marginTop: 26, gap: 12 },
    contentTabsRow: {
      flexDirection: 'row',
      gap: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    contentTab: { fontSize: 13, color: colors.textSecondary, paddingBottom: 8 },
    contentTabActive: { color: colors.text, fontWeight: WEIGHT.semibold },
    contentTabIndicator: {
      position: 'absolute',
      bottom: -1,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: colors.coral,
    },
    contentEmptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
    upcomingCard: { backgroundColor: colors.borderSoft, borderRadius: RADII.lg, padding: 14 },
    upcomingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    upcomingDate: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.coral },
    goingPill: {
      backgroundColor: colors.background,
      borderRadius: RADII.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    goingPillText: { fontSize: 10, fontWeight: WEIGHT.semibold, color: colors.text },
    upcomingTitle: { fontSize: 15, fontWeight: WEIGHT.semibold, color: colors.text },
    seeAllLink: { fontSize: 12, color: colors.coral, textAlign: 'center' },
    shareBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    shareSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 32,
      gap: 4,
    },
    shareSheetTitle: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.textSecondary, marginBottom: 10 },
    shareOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
    shareOptionText: { fontSize: 15, color: colors.text },
    shareDivider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 4 },
  });
}
