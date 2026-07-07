import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Plus, Users } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupCard } from '@/components/groups/group-card';
import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import {
  fetchMyGroups,
  fetchMyPendingGroupInvites,
  respondToGroupInvite,
  type Group,
  type PendingGroupInvite,
} from '@/lib/groups';

export default function GroupsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<PendingGroupInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
        <Text style={styles.headerTitle}>Groups</Text>
        <AnimatedPressable style={styles.createButton} onPress={() => router.push('/create-group')}>
          <Plus size={16} color={ON_ACCENT} strokeWidth={2.5} />
          <Text style={styles.createButtonText}>Create Group</Text>
        </AnimatedPressable>
      </View>

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
