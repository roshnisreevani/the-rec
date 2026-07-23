import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  Lock,
  Megaphone,
  MessagesSquare,
  Pin,
  Settings,
  ShieldCheck,
  Trophy,
  UserPlus,
  Users2,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { GOLD, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  deleteLeague,
  describeActivityItem,
  fetchActivityFeed,
  fetchLeagueConversationId,
  fetchLeagueDetail,
  LEAGUE_FORMAT_LABELS,
  leaveLeague,
  type ActivityFeedItem,
  type League,
} from '@/lib/leagues';

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [league, setLeague] = useState<League | null>(null);
  const [feed, setFeed] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const detail = await fetchLeagueDetail(id, userId);
      if (!detail) {
        Alert.alert('League not found', "This league doesn't exist or you're no longer a member.");
        router.back();
        return;
      }
      setLeague(detail.league);

      try {
        setFeed(await fetchActivityFeed(id, 8));
      } catch (feedError) {
        console.warn('[league] could not load activity feed:', feedError);
      }
    } catch (e) {
      Alert.alert('Could not load league', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCommissioner = league?.myRole === 'commissioner' || league?.myRole === 'co_commissioner';

  const handleOpenBanter = async () => {
    if (!league) return;
    try {
      const conversationId = await fetchLeagueConversationId(league.id);
      if (!conversationId) {
        Alert.alert('No Banter thread yet', 'Pull to refresh and try again in a moment.');
        return;
      }
      router.push(`/chat/${conversationId}`);
    } catch (e) {
      Alert.alert('Could not open Banter', errorMessage(e));
    }
  };

  const handleLeaveOrDelete = () => {
    if (!league || !userId) return;
    const isOwner = league.myRole === 'commissioner';

    Alert.alert(
      isOwner ? 'Delete this league?' : 'Leave this league?',
      isOwner ? 'This removes the league, its teams, matches, and all data. This cannot be undone.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isOwner ? 'Delete' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              if (isOwner) {
                await deleteLeague(league.id);
              } else {
                await leaveLeague(league.id, userId);
              }
              router.back();
            } catch (e) {
              setBusy(false);
              Alert.alert('Something went wrong', errorMessage(e));
            }
          },
        },
      ]
    );
  };

  if (loading || !league) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {league.name}
        </Text>
        <View style={styles.headerIcons}>
          {isCommissioner ? (
            <AnimatedPressable onPress={() => router.push(`/league/settings/${league.id}`)} hitSlop={8}>
              <Settings size={21} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
          ) : null}
          {isCommissioner ? (
            <AnimatedPressable onPress={() => router.push(`/league/invite/${league.id}`)} hitSlop={8}>
              <UserPlus size={22} color={colors.text} strokeWidth={1.75} />
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable onPress={() => router.push(`/league/members/${league.id}`)} hitSlop={8}>
            <Users2 size={22} color={colors.text} strokeWidth={1.75} />
          </AnimatedPressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarRow}>
          {league.avatarUrl ? (
            <Image source={{ uri: league.avatarUrl }} style={styles.leagueAvatar} />
          ) : (
            <InitialsAvatar name={league.name} size={72} />
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.typePill}>
            <Text style={styles.typePillText}>{LEAGUE_FORMAT_LABELS[league.format]}</Text>
          </View>
          <View style={styles.metaItem}>
            {league.privacy === 'private' ? <Lock size={13} color={colors.textSecondary} strokeWidth={2} /> : null}
            <Text style={styles.metaText}>{league.privacy === 'private' ? 'Private' : 'Public'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Users2 size={13} color={colors.textSecondary} strokeWidth={2} />
            <Text style={styles.metaText}>
              {league.memberCount} member{league.memberCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {league.description ? <Text style={styles.description}>{league.description}</Text> : null}

        {league.entryRequirements ? (
          <View style={styles.requirementsBox}>
            <ShieldCheck size={14} color={colors.textSecondary} strokeWidth={2} />
            <Text style={styles.requirementsText}>{league.entryRequirements}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <AnimatedPressable
            style={[styles.actionButton, styles.actionButtonBox]}
            onPress={() => router.push(`/league/teams/${league.id}`)}>
            <Users2 size={16} color={colors.text} strokeWidth={2} />
            <Text style={styles.actionButtonText}>Teams</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.actionButton, styles.actionButtonBox]}
            onPress={() => router.push(`/league/schedule/${league.id}`)}>
            <CalendarClock size={16} color={colors.text} strokeWidth={2} />
            <Text style={styles.actionButtonText}>Schedule</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.actionButton, styles.actionButtonBox]}
            onPress={() => router.push(`/league/standings/${league.id}`)}>
            <Trophy size={16} color={colors.text} strokeWidth={2} />
            <Text style={styles.actionButtonText}>Standings</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.actionButton, styles.actionButtonBox]}
            onPress={() => router.push(`/league/stats/${league.id}`)}>
            <BarChart3 size={16} color={colors.text} strokeWidth={2} />
            <Text style={styles.actionButtonText}>Stats</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.actionButton, styles.actionButtonBox]}
            onPress={() => router.push(`/league/announcements/${league.id}`)}>
            <Megaphone size={16} color={colors.text} strokeWidth={2} />
            <Text style={styles.actionButtonText}>{isCommissioner ? 'Manage Bulletin' : 'Bulletin'}</Text>
          </AnimatedPressable>
          <AnimatedPressable style={[styles.actionButton, styles.actionButtonBox]} onPress={handleOpenBanter}>
            <MessagesSquare size={16} color={colors.text} strokeWidth={2} />
            <Text style={styles.actionButtonText}>Banter</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Announcements</Text>
          </View>
          {feed.length === 0 ? (
            <View style={styles.emptyAnnouncements}>
              <Megaphone size={22} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={styles.emptyAnnouncementsText}>Nothing here yet — activity will show up as the league gets going.</Text>
            </View>
          ) : (
            feed.map((item) =>
              item.kind === 'bulletin' && item.pinned ? (
                <View key={item.id} style={styles.pinnedCard}>
                  <View style={styles.pinnedTopRow}>
                    <Pin size={13} color={colors.text} strokeWidth={2} />
                    <Text style={styles.pinnedLabel}>Pinned</Text>
                  </View>
                  {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.pinnedImage} /> : null}
                  <Text style={styles.pinnedBody}>{item.body}</Text>
                  <Text style={styles.pinnedMeta}>{item.authorName}</Text>
                </View>
              ) : (
                <View key={item.id} style={styles.announcementRow}>
                  {item.kind === 'bulletin' ? (
                    item.authorAvatarUrl ? (
                      <Image source={{ uri: item.authorAvatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <InitialsAvatar name={item.authorName ?? '?'} size={32} />
                    )
                  ) : (
                    <View style={styles.systemIconCircle}>
                      <Trophy size={14} color={colors.textSecondary} strokeWidth={2} />
                    </View>
                  )}
                  <View style={styles.announcementText}>
                    {item.kind === 'bulletin' ? (
                      <Text style={styles.announcementAuthor} numberOfLines={1}>
                        {item.authorName}
                      </Text>
                    ) : null}
                    <Text style={styles.announcementBody} numberOfLines={2}>
                      {item.kind === 'bulletin' ? item.body : describeActivityItem(item)}
                    </Text>
                  </View>
                </View>
              )
            )
          )}
        </View>

        <AnimatedPressable style={styles.leaveButton} onPress={handleLeaveOrDelete} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.leaveButtonText}>
              {league.myRole === 'commissioner' ? 'Delete League' : 'Leave League'}
            </Text>
          )}
        </AnimatedPressable>
      </ScrollView>
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
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    avatarRow: { alignItems: 'center', marginBottom: 16 },
    leagueAvatar: { width: 72, height: 72, borderRadius: 36 },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
    typePill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    typePillText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 12, color: colors.textSecondary },
    description: { fontSize: 14, color: colors.text, marginTop: 12, lineHeight: 20 },
    requirementsBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 12,
      padding: 10,
      borderRadius: RADII.md,
      backgroundColor: colors.borderSoft,
    },
    requirementsText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
    actionButton: { flexBasis: '47%', flexGrow: 1 },
    actionButtonBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingVertical: 12,
    },
    actionButtonText: { color: colors.text, fontWeight: WEIGHT.semibold, fontSize: 14 },
    section: { marginTop: 26, gap: 4 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    emptyAnnouncements: { alignItems: 'center', gap: 6, paddingVertical: 16 },
    emptyAnnouncementsText: { fontSize: 13, fontStyle: 'italic', color: colors.textSecondary, textAlign: 'center' },
    pinnedCard: {
      backgroundColor: colors.borderSoft,
      borderLeftWidth: 4,
      borderLeftColor: GOLD,
      borderRadius: 0,
      padding: 14,
      marginBottom: 10,
      gap: 4,
    },
    pinnedTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pinnedImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: RADII.sm, marginTop: 4 },
    pinnedLabel: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.text },
    pinnedBody: { fontSize: 15, fontWeight: WEIGHT.medium, color: colors.text, lineHeight: 21 },
    pinnedMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    announcementRow: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
    avatarImage: { width: 32, height: 32, borderRadius: 16 },
    systemIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    announcementText: { flex: 1, gap: 2 },
    announcementAuthor: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    announcementBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    leaveButton: { alignItems: 'center', paddingVertical: 14, marginTop: 30 },
    leaveButtonText: { color: colors.danger, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
