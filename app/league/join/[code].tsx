import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock, Users2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  fetchLeagueInvitePreview,
  joinLeagueViaInvite,
  LEAGUE_FORMAT_LABELS,
  type LeagueInvitePreview,
} from '@/lib/leagues';

export default function JoinLeagueScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [preview, setPreview] = useState<LeagueInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await fetchLeagueInvitePreview(code);
        if (!cancelled) setPreview(result);
      } catch (e) {
        if (!cancelled) Alert.alert('Could not load invite', errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleJoin = async () => {
    if (!code || !preview) return;
    setJoining(true);
    try {
      await joinLeagueViaInvite(code);
      router.replace(`/league/${preview.leagueId}`);
    } catch (e) {
      Alert.alert('Could not join league', errorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  if (!preview) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <Text style={styles.errorTitle}>Invite not found</Text>
        <Text style={styles.errorText}>This invite link is invalid or has expired.</Text>
        <AnimatedPressable style={styles.doneButton} onPress={() => router.replace('/(tabs)/leagues')}>
          <Text style={styles.doneButtonText}>Back to Leagues</Text>
        </AnimatedPressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.avatarRow}>
          <InitialsAvatar name={preview.name} size={80} />
        </View>

        <Text style={styles.name}>{preview.name}</Text>

        <View style={styles.metaRow}>
          <View style={styles.typePill}>
            <Text style={styles.typePillText}>{LEAGUE_FORMAT_LABELS[preview.format]}</Text>
          </View>
          <View style={styles.metaItem}>
            {preview.privacy === 'private' ? <Lock size={13} color={colors.textSecondary} strokeWidth={2} /> : null}
            <Text style={styles.metaText}>{preview.privacy === 'private' ? 'Private' : 'Public'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Users2 size={13} color={colors.textSecondary} strokeWidth={2} />
            <Text style={styles.metaText}>
              {preview.memberCount} member{preview.memberCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {preview.description ? <Text style={styles.description}>{preview.description}</Text> : null}

        <AnimatedPressable style={styles.joinButton} onPress={handleJoin} disabled={joining}>
          {joining ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.joinButtonText}>Join League</Text>}
        </AnimatedPressable>

        <AnimatedPressable onPress={() => router.replace('/(tabs)/leagues')} hitSlop={8}>
          <Text style={styles.cancelText}>Not now</Text>
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      gap: 10,
      paddingHorizontal: 32,
    },
    content: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
    avatarRow: { alignItems: 'center', marginBottom: 4 },
    name: { fontSize: 24, fontWeight: WEIGHT.bold, color: colors.text, textAlign: 'center' },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 12 },
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
    description: { fontSize: 14, color: colors.text, textAlign: 'center', lineHeight: 20, marginTop: 4 },
    joinButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
      paddingVertical: 14,
      marginTop: 20,
    },
    joinButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 15 },
    cancelText: { textAlign: 'center', color: colors.textSecondary, fontSize: 13, marginTop: 8 },
    errorTitle: { fontSize: 18, fontWeight: WEIGHT.bold, color: colors.text },
    errorText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    doneButton: {
      marginTop: 12,
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    doneButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
