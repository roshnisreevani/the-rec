import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  deleteTeam,
  fetchLeagueDetail,
  fetchStandings,
  fetchTeam,
  fetchTeamRoster,
  removeMemberFromTeam,
  type LeagueRole,
  type StandingsRow,
  type Team,
  type TeamRosterMember,
} from '@/lib/leagues';

export default function TeamDetailScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<TeamRosterMember[]>([]);
  const [record, setRecord] = useState<StandingsRow | null>(null);
  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!teamId || !userId) return;
    try {
      const fetchedTeam = await fetchTeam(teamId);
      if (!fetchedTeam) {
        Alert.alert('Team not found');
        router.back();
        return;
      }
      setTeam(fetchedTeam);

      const [fetchedRoster, standings, detail] = await Promise.all([
        fetchTeamRoster(teamId),
        fetchStandings(fetchedTeam.leagueId).catch(() => []),
        fetchLeagueDetail(fetchedTeam.leagueId, userId).catch(() => null),
      ]);
      setRoster(fetchedRoster);
      setRecord(standings.find((s) => s.teamId === teamId) ?? null);
      setMyRole(detail?.league.myRole ?? null);
    } catch (e) {
      Alert.alert('Could not load team', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [teamId, userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCommissioner = myRole === 'commissioner' || myRole === 'co_commissioner';

  const handleRemoveFromTeam = (member: TeamRosterMember) => {
    if (!teamId) return;
    Alert.alert(`Remove ${member.name} from ${team?.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeMemberFromTeam(teamId, member.userId);
            load();
          } catch (e) {
            Alert.alert('Could not remove member', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handleDeleteTeam = () => {
    if (!team) return;
    Alert.alert('Delete this team?', 'This removes the team and its roster. Matches already scheduled are unaffected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteTeam(team.id);
            router.back();
          } catch (e) {
            setBusy(false);
            Alert.alert('Could not delete team', errorMessage(e));
          }
        },
      },
    ]);
  };

  if (loading || !team) {
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
          {team.name}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarRow}>
          {team.avatarUrl ? (
            <Image source={{ uri: team.avatarUrl }} style={styles.teamAvatar} />
          ) : (
            <InitialsAvatar name={team.name} size={72} />
          )}
        </View>

        {team.description ? <Text style={styles.description}>{team.description}</Text> : null}

        {record ? (
          <View style={styles.recordRow}>
            <View style={styles.recordItem}>
              <Text style={styles.recordValue}>{record.wins}</Text>
              <Text style={styles.recordLabel}>Wins</Text>
            </View>
            <View style={styles.recordItem}>
              <Text style={styles.recordValue}>{record.losses}</Text>
              <Text style={styles.recordLabel}>Losses</Text>
            </View>
            <View style={styles.recordItem}>
              <Text style={styles.recordValue}>{record.ties}</Text>
              <Text style={styles.recordLabel}>Ties</Text>
            </View>
            <View style={styles.recordItem}>
              <Text style={styles.recordValue}>{record.gamesPlayed}</Text>
              <Text style={styles.recordLabel}>Played</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Roster</Text>
          {roster.length === 0 ? (
            <Text style={styles.emptyText}>No members on this team yet.</Text>
          ) : (
            roster.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <InitialsAvatar name={member.name} size={36} />
                )}
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.name}
                </Text>
                {isCommissioner ? (
                  <AnimatedPressable onPress={() => handleRemoveFromTeam(member)} hitSlop={8}>
                    <Trash2 size={16} color={colors.danger} strokeWidth={2} />
                  </AnimatedPressable>
                ) : null}
              </View>
            ))
          )}
        </View>

        {isCommissioner ? (
          <AnimatedPressable style={styles.deleteButton} onPress={handleDeleteTeam} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.danger} size="small" /> : <Text style={styles.deleteButtonText}>Delete Team</Text>}
          </AnimatedPressable>
        ) : null}
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
    teamAvatar: { width: 72, height: 72, borderRadius: 36 },
    description: { fontSize: 14, color: colors.text, textAlign: 'center', lineHeight: 20 },
    recordRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 20,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
    },
    recordItem: { alignItems: 'center', gap: 2 },
    recordValue: { fontSize: 20, fontWeight: WEIGHT.bold, color: colors.text },
    recordLabel: { fontSize: 11, color: colors.textSecondary },
    section: { marginTop: 26, gap: 4 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text, marginBottom: 8 },
    emptyText: { fontSize: 13, fontStyle: 'italic', color: colors.textSecondary },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    avatarImage: { width: 36, height: 36, borderRadius: 18 },
    memberName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: WEIGHT.medium },
    deleteButton: { alignItems: 'center', paddingVertical: 14, marginTop: 30 },
    deleteButtonText: { color: colors.danger, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
