import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft, Lock, MessagesSquare, UserPlus, Users2, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { fetchGroupConversationId } from '@/lib/banter';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import {
  deleteGroup,
  fetchGroupDetail,
  fetchJoinRequests,
  GROUP_TYPE_LABELS,
  leaveGroup,
  respondToJoinRequest,
  type Group,
  type GroupMember,
  type JoinRequest,
} from '@/lib/groups';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const detail = await fetchGroupDetail(id, userId);
      if (!detail) {
        Alert.alert('Group not found', "This group doesn't exist or you're no longer a member.");
        router.back();
        return;
      }
      setGroup(detail.group);
      setMembers(detail.members);

      if (detail.group.myRole === 'owner' && detail.group.privacy === 'private') {
        setJoinRequests(await fetchJoinRequests(id));
      } else {
        setJoinRequests([]);
      }
    } catch (e) {
      Alert.alert('Could not load group', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleLeaveOrDelete = () => {
    if (!group || !userId) return;
    const isOwner = group.myRole === 'owner';

    Alert.alert(
      isOwner ? 'Delete this group?' : 'Leave this group?',
      isOwner ? 'This removes the group and all its members. This cannot be undone.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isOwner ? 'Delete' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              if (isOwner) {
                await deleteGroup(group.id);
              } else {
                await leaveGroup(group.id, userId);
              }
              router.back();
            } catch (e) {
              setBusy(false);
              Alert.alert('Something went wrong', e instanceof Error ? e.message : 'Unknown error.');
            }
          },
        },
      ]
    );
  };

  const handleRespondToRequest = async (request: JoinRequest, approve: boolean) => {
    setRespondingRequestId(request.id);
    try {
      await respondToJoinRequest(request.id, approve);
      setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
      if (approve) load();
    } catch (e) {
      Alert.alert('Could not respond to request', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setRespondingRequestId(null);
    }
  };

  if (loading || !group) {
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
          {group.name}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarRow}>
          {group.avatarUrl ? (
            <Image source={{ uri: group.avatarUrl }} style={styles.groupAvatar} />
          ) : (
            <InitialsAvatar name={group.name} size={72} />
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.typePill}>
            <Text style={styles.typePillText}>{GROUP_TYPE_LABELS[group.groupType]}</Text>
          </View>
          <View style={styles.metaItem}>
            {group.privacy === 'private' ? (
              <Lock size={13} color={colors.textSecondary} strokeWidth={2} />
            ) : null}
            <Text style={styles.metaText}>{group.privacy === 'private' ? 'Private' : 'Public'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Users2 size={13} color={colors.textSecondary} strokeWidth={2} />
            <Text style={styles.metaText}>
              {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {group.description ? <Text style={styles.description}>{group.description}</Text> : null}

        <View style={styles.actionRow}>
          <AnimatedPressable
            style={[styles.inviteButton, styles.actionButton]}
            onPress={() => router.push(`/group/invite/${group.id}`)}>
            <UserPlus size={16} color={ON_ACCENT} strokeWidth={2} />
            <Text style={styles.inviteButtonText}>Invite</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.banterButton, styles.actionButton]}
            onPress={async () => {
              try {
                const conversationId = await fetchGroupConversationId(group.id);
                if (!conversationId) {
                  Alert.alert('No Banter thread yet', 'Pull to refresh and try again in a moment.');
                  return;
                }
                router.push(`/chat/${conversationId}`);
              } catch (e) {
                Alert.alert('Could not open Banter', e instanceof Error ? e.message : 'Unknown error.');
              }
            }}>
            <MessagesSquare size={16} color={colors.text} strokeWidth={2} />
            <Text style={styles.banterButtonText}>Banter</Text>
          </AnimatedPressable>
        </View>

        {joinRequests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Join Requests</Text>
            {joinRequests.map((request) => (
              <View key={request.id} style={styles.requestRow}>
                {request.userAvatarUrl ? (
                  <Image source={{ uri: request.userAvatarUrl }} style={styles.avatarImage} />
                ) : (
                  <InitialsAvatar name={request.userName} size={36} />
                )}
                <Text style={styles.memberName} numberOfLines={1}>
                  {request.userName}
                </Text>
                {respondingRequestId === request.id ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <View style={styles.requestActions}>
                    <AnimatedPressable
                      style={styles.requestDecline}
                      onPress={() => handleRespondToRequest(request, false)}
                      hitSlop={6}>
                      <X size={16} color={colors.text} strokeWidth={2.25} />
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={styles.requestApprove}
                      onPress={() => handleRespondToRequest(request, true)}
                      hitSlop={6}>
                      <Check size={16} color={ON_ACCENT} strokeWidth={2.25} />
                    </AnimatedPressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              {member.avatarUrl ? (
                <Image source={{ uri: member.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <InitialsAvatar name={member.name} size={36} />
              )}
              <Text style={styles.memberName} numberOfLines={1}>
                {member.name}
              </Text>
              {member.role === 'owner' ? (
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>Owner</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <AnimatedPressable style={styles.leaveButton} onPress={handleLeaveOrDelete} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.leaveButtonText}>{group.myRole === 'owner' ? 'Delete Group' : 'Leave Group'}</Text>
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
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    avatarRow: { alignItems: 'center', marginBottom: 16 },
    groupAvatar: { width: 72, height: 72, borderRadius: 36 },
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
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    actionButton: { flex: 1 },
    inviteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 12,
    },
    inviteButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
    banterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingVertical: 12,
    },
    banterButtonText: { color: colors.text, fontWeight: WEIGHT.semibold, fontSize: 14 },
    section: { marginTop: 26, gap: 4 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text, marginBottom: 8 },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    requestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    avatarImage: { width: 36, height: 36, borderRadius: 18 },
    memberName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: WEIGHT.medium },
    ownerBadge: {
      backgroundColor: colors.borderSoft,
      borderRadius: RADII.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    ownerBadgeText: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    requestActions: { flexDirection: 'row', gap: 8 },
    requestDecline: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    requestApprove: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leaveButton: { alignItems: 'center', paddingVertical: 14, marginTop: 30 },
    leaveButtonText: { color: colors.danger, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
