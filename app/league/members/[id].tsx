import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchLeagueDetail, removeMember, setMemberRole, type LeagueMember, type LeagueRole } from '@/lib/leagues';

const ROLE_LABELS: Record<LeagueRole, string> = {
  commissioner: 'Commissioner',
  co_commissioner: 'Co-Commissioner',
  member: 'Member',
};

export default function LeagueMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [leagueName, setLeagueName] = useState('');
  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const detail = await fetchLeagueDetail(id, userId);
      if (!detail) {
        Alert.alert('League not found', "This league doesn't exist or you're no longer a member.");
        router.back();
        return;
      }
      setMembers(detail.members);
      setLeagueName(detail.league.name);
      setMyRole(detail.league.myRole);
    } catch (e) {
      Alert.alert('Could not load members', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCommissioner = myRole === 'commissioner';

  const handleToggleCoCommissioner = async (member: LeagueMember) => {
    setBusyUserId(member.userId);
    try {
      await setMemberRole(member.id, member.role === 'co_commissioner' ? 'member' : 'co_commissioner');
      load();
    } catch (e) {
      Alert.alert('Could not update role', errorMessage(e));
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = (member: LeagueMember) => {
    if (!id) return;
    Alert.alert(`Remove ${member.name}?`, 'They will need a new invite to rejoin.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyUserId(member.userId);
          try {
            await removeMember(id, member.userId);
            load();
          } catch (e) {
            Alert.alert('Could not remove member', errorMessage(e));
          } finally {
            setBusyUserId(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {leagueName ? `${leagueName} · Members` : 'Members'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.memberRow}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <InitialsAvatar name={item.name} size={36} />
              )}
              <Text style={styles.memberName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.role !== 'member' ? (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{ROLE_LABELS[item.role]}</Text>
                </View>
              ) : null}
              {isCommissioner && item.role !== 'commissioner' ? (
                busyUserId === item.userId ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <View style={styles.actions}>
                    <AnimatedPressable style={styles.actionChip} onPress={() => handleToggleCoCommissioner(item)}>
                      <Text style={styles.actionChipText}>
                        {item.role === 'co_commissioner' ? 'Demote' : 'Make Co-Commissioner'}
                      </Text>
                    </AnimatedPressable>
                    <AnimatedPressable style={styles.actionChip} onPress={() => handleRemove(item)}>
                      <Text style={[styles.actionChipText, { color: colors.danger }]}>Remove</Text>
                    </AnimatedPressable>
                  </View>
                )
              ) : null}
            </View>
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
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    spinner: { marginTop: 30 },
    list: { padding: 20, paddingTop: 10 },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, flexWrap: 'wrap' },
    avatarImage: { width: 36, height: 36, borderRadius: 18 },
    memberName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: WEIGHT.medium, minWidth: 80 },
    roleBadge: {
      backgroundColor: colors.borderSoft,
      borderRadius: RADII.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    roleBadgeText: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    actions: { flexDirection: 'row', gap: 8, width: '100%', justifyContent: 'flex-end', marginTop: 4 },
    actionChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    actionChipText: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.text },
  });
}
