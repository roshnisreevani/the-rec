import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Plus, Users2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  assignMemberToTeam,
  fetchLeagueDetail,
  fetchTeams,
  fetchUnassignedLeagueMembers,
  type LeagueMember,
  type LeagueRole,
  type Team,
} from '@/lib/leagues';

export default function LeagueTeamsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [leagueName, setLeagueName] = useState('');
  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassigned, setUnassigned] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const [detail, fetchedTeams, fetchedUnassigned] = await Promise.all([
        fetchLeagueDetail(id, userId),
        fetchTeams(id),
        fetchUnassignedLeagueMembers(id),
      ]);
      setLeagueName(detail?.league.name ?? '');
      setMyRole(detail?.league.myRole ?? null);
      setTeams(fetchedTeams);
      setUnassigned(fetchedUnassigned);
    } catch (e) {
      Alert.alert('Could not load teams', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCommissioner = myRole === 'commissioner' || myRole === 'co_commissioner';

  const handleAssign = async (member: LeagueMember, team: Team) => {
    if (!id) return;
    setAssigningUserId(member.userId);
    try {
      await assignMemberToTeam(team.id, id, member.userId);
      setExpandedUserId(null);
      load();
    } catch (e) {
      Alert.alert('Could not assign member', errorMessage(e));
    } finally {
      setAssigningUserId(null);
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
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {leagueName ? `${leagueName} · Teams` : 'Teams'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isCommissioner ? (
          <AnimatedPressable style={styles.createButton} onPress={() => router.push(`/league/team/create/${id}`)}>
            <Plus size={16} color={ON_ACCENT} strokeWidth={2.5} />
            <Text style={styles.createButtonText}>Create Team</Text>
          </AnimatedPressable>
        ) : null}

        {teams.length === 0 ? (
          <View style={styles.empty}>
            <Users2 size={32} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyText}>
              {isCommissioner ? 'Create a team to start assigning members.' : 'No teams have been created yet.'}
            </Text>
          </View>
        ) : (
          teams.map((team) => (
            <AnimatedPressable key={team.id} style={styles.teamCard} onPress={() => router.push(`/league/team/${team.id}`)}>
              {team.avatarUrl ? (
                <Image source={{ uri: team.avatarUrl }} style={styles.teamAvatar} />
              ) : (
                <InitialsAvatar name={team.name} size={40} />
              )}
              <View style={styles.teamText}>
                <Text style={styles.teamName} numberOfLines={1}>
                  {team.name}
                </Text>
                <Text style={styles.teamMeta}>
                  {team.memberCount} member{team.memberCount === 1 ? '' : 's'}
                </Text>
              </View>
            </AnimatedPressable>
          ))
        )}

        {isCommissioner && unassigned.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unassigned Members</Text>
            {unassigned.map((member) => (
              <View key={member.id} style={styles.memberBlock}>
                <AnimatedPressable
                  style={styles.memberRow}
                  onPress={() => setExpandedUserId(expandedUserId === member.userId ? null : member.userId)}
                  disabled={teams.length === 0}>
                  {member.avatarUrl ? (
                    <Image source={{ uri: member.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <InitialsAvatar name={member.name} size={32} />
                  )}
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.name}
                  </Text>
                  {assigningUserId === member.userId ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <Text style={styles.assignHint}>{teams.length === 0 ? 'No teams yet' : 'Assign ▾'}</Text>
                  )}
                </AnimatedPressable>

                {expandedUserId === member.userId ? (
                  <View style={styles.teamPillRow}>
                    {teams.map((team) => (
                      <AnimatedPressable
                        key={team.id}
                        style={styles.teamPill}
                        onPress={() => handleAssign(member, team)}>
                        <Text style={styles.teamPillText}>{team.name}</Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
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
    content: { padding: 20, paddingBottom: 60, gap: 12 },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.blue,
      borderRadius: RADII.pill,
      paddingVertical: 10,
      marginBottom: 8,
    },
    createButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 13 },
    empty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    teamCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      padding: 12,
    },
    teamAvatar: { width: 40, height: 40, borderRadius: 20 },
    teamText: { flex: 1, gap: 2 },
    teamName: { fontSize: 15, fontWeight: WEIGHT.bold, color: colors.text },
    teamMeta: { fontSize: 12, color: colors.textSecondary },
    section: { marginTop: 14, gap: 4 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text, marginBottom: 6 },
    memberBlock: { gap: 6 },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    avatarImage: { width: 32, height: 32, borderRadius: 16 },
    memberName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: WEIGHT.medium },
    assignHint: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.blue },
    teamPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 42, paddingBottom: 8 },
    teamPill: {
      borderWidth: 1,
      borderColor: colors.blue,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    teamPillText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.blue },
  });
}
