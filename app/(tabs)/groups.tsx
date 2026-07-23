import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Plus, Users } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupCard } from '@/components/groups/group-card';
import { OpenGameCard } from '@/components/groups/open-game-card';
import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  fetchMyGroups,
  fetchMyPendingGroupInvites,
  respondToGroupInvite,
  type Group,
  type PendingGroupInvite,
} from '@/lib/groups';
import { discoverOpenGames, joinOpenGame, type OpenGame } from '@/lib/open-games';
import { fetchIsVerified } from '@/lib/verification';

type GroupsTab = 'mine' | 'discover';

export default function GroupsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<GroupsTab>('mine');

  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<PendingGroupInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const [games, setGames] = useState<OpenGame[]>([]);
  const [myGoingIds, setMyGoingIds] = useState<Set<string>>(new Set());
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  // Distinguishes "you said no to the location prompt" from any other
  // failure — that one specifically needs an "Open Settings" shortcut since
  // re-requesting permission after a denial is a no-op on both platforms.
  const [locationDenied, setLocationDenied] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!userId) return;
      if (isRefresh) setRefreshing(true);
      try {
        const [fetchedGroups, fetchedInvites] = await Promise.all([
          fetchMyGroups(userId),
          fetchMyPendingGroupInvites(userId),
        ]);
        setGroups(fetchedGroups);
        setInvites(fetchedInvites);
      } catch (e) {
        Alert.alert('Could not load Groups', e instanceof Error ? e.message : 'Unknown error.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId]
  );

  const loadGames = useCallback(async () => {
    if (!userId) return;
    setGamesLoading(true);
    setGamesError(null);
    setLocationDenied(false);
    try {
      fetchIsVerified(userId).then(setIsVerified).catch(() => {});

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGamesError('Location access is off — turn it on in Settings to see games near you.');
        setLocationDenied(true);
        setGames([]);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const fetched = await discoverOpenGames(position.coords.latitude, position.coords.longitude);
      setGames(fetched);
    } catch (e) {
      // Most failures here are transient (a slow/flaky location fix, a
      // one-off network hiccup on the RPC) rather than a real dead end — so
      // silently retry once before bothering the person with an error and a
      // button to press. Only the second failure actually surfaces.
      try {
        const position = await Location.getCurrentPositionAsync({});
        const fetched = await discoverOpenGames(position.coords.latitude, position.coords.longitude);
        setGames(fetched);
      } catch (e2) {
        setGamesError(errorMessage(e2, 'Could not load games near you.'));
      }
    } finally {
      setGamesLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (tab === 'discover') loadGames();
    }, [tab, loadGames])
  );

  const handleJoinGame = async (game: OpenGame) => {
    if (!userId) return;
    setJoiningId(game.id);
    try {
      const result = await joinOpenGame(game.id);
      setMyGoingIds((prev) => new Set(prev).add(game.id));
      if (result === 'going') {
        setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, goingCount: g.goingCount + 1 } : g)));
      } else if (result === 'waitlisted') {
        Alert.alert("You're on the waitlist", "This game is full — we'll add you automatically if a spot opens up.");
      } else {
        Alert.alert('Request sent', "The organizer will review your request to join.");
      }
    } catch (e) {
      Alert.alert('Could not join', errorMessage(e, "You may need a slightly older account to join — give it a few days."));
    } finally {
      setJoiningId(null);
    }
  };

  const handleRespond = async (invite: PendingGroupInvite, accept: boolean) => {
    if (!userId) return;
    setRespondingId(invite.id);
    try {
      await respondToGroupInvite({ id: invite.id, groupId: invite.groupId }, userId, accept);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (accept) load();
    } catch (e) {
      Alert.alert('Could not respond to invite', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setRespondingId(null);
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
        <Text style={styles.headerTitle}>{tab === 'mine' ? 'Teams' : 'Discover'}</Text>
        {tab === 'mine' ? (
          <AnimatedPressable style={styles.createButton} onPress={() => router.push('/create-group')}>
            <Plus size={16} color={ON_ACCENT} strokeWidth={2.5} />
            <Text style={styles.createButtonText}>Create Group</Text>
          </AnimatedPressable>
        ) : (
          <AnimatedPressable
            style={styles.createButton}
            onPress={() => (isVerified ? router.push('/create-open-game') : router.push('/verify-account'))}>
            <Plus size={16} color={ON_ACCENT} strokeWidth={2.5} />
            <Text style={styles.createButtonText}>Post Game</Text>
          </AnimatedPressable>
        )}
      </View>

      <View style={styles.segmentWrap}>
        <AnimatedPressable
          style={[styles.segment, tab === 'mine' && styles.segmentActive]}
          onPress={() => setTab('mine')}>
          <Text style={[styles.segmentText, tab === 'mine' && styles.segmentTextActive]}>My Groups</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.segment, tab === 'discover' && styles.segmentActive]}
          onPress={() => setTab('discover')}>
          <Text style={[styles.segmentText, tab === 'discover' && styles.segmentTextActive]}>Discover</Text>
        </AnimatedPressable>
      </View>

      {tab === 'discover' ? (
        gamesLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <FlatList
            data={games}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={false} onRefresh={loadGames} tintColor={colors.text} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Users size={40} color={colors.textSecondary} strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>{gamesError ? 'Could not load games' : 'No open games nearby'}</Text>
                <Text style={styles.emptyText}>
                  {gamesError ?? 'Nobody has posted an open game near you yet — be the first.'}
                </Text>
                {gamesError ? (
                  <AnimatedPressable
                    style={styles.emptyActionButton}
                    onPress={() => (locationDenied ? Linking.openSettings() : loadGames())}>
                    <Text style={styles.emptyActionButtonText}>
                      {locationDenied ? 'Open Settings' : 'Try again'}
                    </Text>
                  </AnimatedPressable>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <OpenGameCard
                game={item}
                onPress={() => router.push(`/open-game/${item.id}`)}
                onJoin={() => handleJoinGame(item)}
                joining={joiningId === item.id}
                alreadyGoing={myGoingIds.has(item.id)}
              />
            )}
          />
        )
      ) : (
        <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.text} />
        }
        ListHeaderComponent={
          invites.length > 0 ? (
            <View style={styles.invitesSection}>
              <Text style={styles.invitesTitle}>Invites</Text>
              {invites.map((invite) => (
                <View key={invite.id} style={styles.inviteCard}>
                  {invite.groupAvatarUrl ? (
                    <Image source={{ uri: invite.groupAvatarUrl }} style={styles.inviteAvatar} />
                  ) : (
                    <InitialsAvatar name={invite.groupName} size={36} />
                  )}
                  <View style={styles.inviteText}>
                    <Text style={styles.inviteGroupName} numberOfLines={1}>
                      {invite.groupName}
                    </Text>
                    <Text style={styles.inviteSubtext} numberOfLines={1}>
                      {invite.invitedByName} invited you
                    </Text>
                  </View>
                  {respondingId === invite.id ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <View style={styles.inviteActions}>
                      <AnimatedPressable
                        style={styles.declineButton}
                        onPress={() => handleRespond(invite, false)}>
                        <Text style={styles.declineButtonText}>Decline</Text>
                      </AnimatedPressable>
                      <AnimatedPressable style={styles.acceptButton} onPress={() => handleRespond(invite, true)}>
                        <Text style={styles.acceptButtonText}>Accept</Text>
                      </AnimatedPressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Users size={40} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyText}>
              Create a group to get your friends, team, or league together — or open an invite link someone sent
              you.
            </Text>
            <AnimatedPressable style={styles.emptyButton} onPress={() => router.push('/create-group')}>
              <Text style={styles.emptyButtonText}>Create a Group</Text>
            </AnimatedPressable>
          </View>
        }
        renderItem={({ item }) => <GroupCard group={item} onPress={() => router.push(`/group/${item.id}`)} />}
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
      backgroundColor: colors.coral,
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
    invitesSection: { marginBottom: 20, gap: 10 },
    invitesTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    inviteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      padding: 12,
    },
    inviteAvatar: { width: 36, height: 36, borderRadius: 18 },
    inviteText: { flex: 1, gap: 1 },
    inviteGroupName: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    inviteSubtext: { fontSize: 12, color: colors.textSecondary },
    inviteActions: { flexDirection: 'row', gap: 8 },
    declineButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    declineButtonText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    acceptButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    acceptButtonText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 20 },
    emptyTitle: { fontSize: 17, fontWeight: WEIGHT.bold, color: colors.text, marginTop: 4 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    emptyActionButton: {
      marginTop: 6,
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    emptyActionButtonText: { fontSize: 14, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
    emptyButton: {
      marginTop: 8,
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    emptyButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
