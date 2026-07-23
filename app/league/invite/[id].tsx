import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft, Copy, RotateCw, Share2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  fetchLeagueDetail,
  fetchOrCreateLeagueInviteCode,
  getLeagueInviteUrl,
  regenerateLeagueInviteCode,
} from '@/lib/leagues';

export default function LeagueInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [leagueName, setLeagueName] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id || !userId) return;
    let cancelled = false;

    (async () => {
      try {
        const [detail, code] = await Promise.all([fetchLeagueDetail(id, userId), fetchOrCreateLeagueInviteCode(id, userId)]);
        if (cancelled) return;
        setLeagueName(detail?.league.name ?? '');
        setInviteCode(code);
      } catch (e) {
        if (!cancelled) Alert.alert('Could not load invite link', errorMessage(e));
      } finally {
        if (!cancelled) setLoadingLink(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  const inviteUrl = inviteCode ? getLeagueInviteUrl(inviteCode) : '';

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await Clipboard.setStringAsync(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      Alert.alert('Could not copy link', errorMessage(e));
    }
  };

  const handleShare = async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({ message: `Join ${leagueName || 'my league'} on The Rec: ${inviteUrl}` });
    } catch (e) {
      Alert.alert('Could not share link', errorMessage(e));
    }
  };

  const handleRegenerate = () => {
    if (!id) return;
    Alert.alert('Regenerate invite link?', 'The old link will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: async () => {
          setRegenerating(true);
          try {
            setInviteCode(await regenerateLeagueInviteCode(id));
          } catch (e) {
            Alert.alert('Could not regenerate link', errorMessage(e));
          } finally {
            setRegenerating(false);
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
        <Text style={styles.headerTitle}>Invite</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Share a link</Text>
        {loadingLink ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <View style={styles.linkRow}>
              <Text style={styles.linkText} numberOfLines={1}>
                {inviteUrl}
              </Text>
            </View>
            <View style={styles.linkActions}>
              <AnimatedPressable style={styles.linkButton} onPress={handleCopy}>
                {copied ? (
                  <Check size={16} color={colors.text} strokeWidth={2.25} />
                ) : (
                  <Copy size={16} color={colors.text} strokeWidth={2} />
                )}
                <Text style={styles.linkButtonText}>{copied ? 'Copied' : 'Copy'}</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.linkButtonPrimary} onPress={handleShare}>
                <Share2 size={16} color={ON_ACCENT} strokeWidth={2} />
                <Text style={styles.linkButtonPrimaryText}>Share</Text>
              </AnimatedPressable>
            </View>
            <AnimatedPressable style={styles.regenerateRow} onPress={handleRegenerate} disabled={regenerating}>
              {regenerating ? (
                <ActivityIndicator color={colors.textSecondary} size="small" />
              ) : (
                <>
                  <RotateCw size={13} color={colors.textSecondary} strokeWidth={2} />
                  <Text style={styles.regenerateText}>Regenerate link</Text>
                </>
              )}
            </AnimatedPressable>
          </>
        )}
      </View>
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    content: { padding: 20, gap: 10 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    linkRow: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
    },
    linkText: { fontSize: 13, color: colors.textSecondary },
    linkActions: { flexDirection: 'row', gap: 10 },
    linkButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingVertical: 11,
    },
    linkButtonText: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    linkButtonPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
      paddingVertical: 11,
    },
    linkButtonPrimaryText: { fontSize: 14, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
    regenerateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 2 },
    regenerateText: { fontSize: 12, color: colors.textSecondary },
  });
}
