import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { fetchMyBlockedUsers, fetchMyReports, unblockUser, type BlockedUser, type MyReport } from '@/lib/moderation';

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate content',
  fake_profile: 'Fake profile',
  other: 'Other',
};

const CONTENT_TYPE_LABEL: Record<string, string> = {
  post: 'Post',
  comment: 'Comment',
  profile: 'Profile',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  resolved: 'Resolved',
};

export default function PrivacySafetyScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [b, r] = await Promise.all([fetchMyBlockedUsers(userId), fetchMyReports(userId)]);
      setBlocked(b);
      setReports(r);
    } catch (e) {
      Alert.alert('Could not load Privacy & Safety', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleUnblock = async (target: BlockedUser) => {
    if (!userId) return;
    setBusyId(target.blockedId);
    try {
      await unblockUser(userId, target.blockedId);
      setBlocked((prev) => prev.filter((b) => b.blockedId !== target.blockedId));
    } catch (e) {
      Alert.alert('Could not unblock', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Privacy & Safety</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Section title="Blocked users" styles={styles}>
            {blocked.length === 0 ? (
              <Text style={styles.empty}>You haven't blocked anyone.</Text>
            ) : (
              blocked.map((b) => (
                <View key={b.blockedId} style={styles.row}>
                  {b.avatarUrl ? (
                    <Image source={{ uri: b.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <InitialsAvatar name={b.name} size={36} />
                  )}
                  <Text style={styles.rowName} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <AnimatedPressable
                    style={styles.unblockButton}
                    onPress={() => handleUnblock(b)}
                    disabled={busyId === b.blockedId}>
                    {busyId === b.blockedId ? (
                      <ActivityIndicator color={colors.text} size="small" />
                    ) : (
                      <Text style={styles.unblockButtonText}>Unblock</Text>
                    )}
                  </AnimatedPressable>
                </View>
              ))
            )}
          </Section>

          <Section title="Reported content" styles={styles}>
            {reports.length === 0 ? (
              <Text style={styles.empty}>You haven't reported anything.</Text>
            ) : (
              reports.map((r) => (
                <View key={r.id} style={styles.reportRow}>
                  <View style={styles.reportText}>
                    <Text style={styles.reportTitle}>
                      {CONTENT_TYPE_LABEL[r.contentType] ?? r.contentType} · {REASON_LABEL[r.reason] ?? r.reason}
                    </Text>
                    <Text style={styles.reportDate}>{new Date(r.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{STATUS_LABEL[r.status] ?? r.status}</Text>
                  </View>
                </View>
              ))
            )}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ title, children, styles }: { title: string; children: ReactNode; styles: ReturnType<typeof makeStyles> }) {
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
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    section: { marginTop: 22, gap: 8 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: WEIGHT.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    empty: { fontStyle: 'italic', color: colors.textSecondary, fontSize: 13, paddingVertical: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    avatarImage: { width: 36, height: 36, borderRadius: 18 },
    rowName: { flex: 1, fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    unblockButton: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    unblockButtonText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    reportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    reportText: { flex: 1, gap: 2 },
    reportTitle: { fontSize: 14, fontWeight: WEIGHT.medium, color: colors.text },
    reportDate: { fontSize: 12, color: colors.textSecondary },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: RADII.pill,
      backgroundColor: colors.borderSoft,
    },
    statusBadgeText: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
  });
}
