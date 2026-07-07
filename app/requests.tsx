import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import {
  acceptConnection,
  fetchReceivedRequests,
  fetchSentRequests,
  removeConnection,
  type ConnectionRequest,
} from '@/lib/connections';

export default function RequestsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [received, setReceived] = useState<ConnectionRequest[]>([]);
  const [sent, setSent] = useState<ConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [r, s] = await Promise.all([fetchReceivedRequests(userId), fetchSentRequests(userId)]);
      setReceived(r);
      setSent(s);
    } catch (e) {
      Alert.alert('Could not load requests', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAccept = async (request: ConnectionRequest) => {
    setBusyId(request.connectionId);
    try {
      await acceptConnection(request.connectionId);
      await load();
    } catch (e) {
      Alert.alert('Could not accept request', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (request: ConnectionRequest) => {
    setBusyId(request.connectionId);
    try {
      await removeConnection(request.connectionId);
      await load();
    } catch (e) {
      Alert.alert('Could not decline request', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (request: ConnectionRequest) => {
    setBusyId(request.connectionId);
    try {
      await removeConnection(request.connectionId);
      await load();
    } catch (e) {
      Alert.alert('Could not cancel request', e instanceof Error ? e.message : 'Unknown error.');
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
        <Text style={styles.headerTitle}>Requests</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Section title="Received" styles={styles}>
            {received.length === 0 ? (
              <Text style={styles.empty}>No pending requests.</Text>
            ) : (
              received.map((r) => (
                <RequestRow key={r.connectionId} request={r} styles={styles} router={router}>
                  <AnimatedPressable
                    style={styles.secondaryButton}
                    onPress={() => handleDecline(r)}
                    disabled={busyId === r.connectionId}>
                    <Text style={styles.secondaryButtonText}>Decline</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.primaryButton}
                    onPress={() => handleAccept(r)}
                    disabled={busyId === r.connectionId}>
                    {busyId === r.connectionId ? (
                      <ActivityIndicator color={ON_ACCENT} size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Accept</Text>
                    )}
                  </AnimatedPressable>
                </RequestRow>
              ))
            )}
          </Section>

          <Section title="Sent by you" styles={styles}>
            {sent.length === 0 ? (
              <Text style={styles.empty}>No outgoing requests.</Text>
            ) : (
              sent.map((r) => (
                <RequestRow key={r.connectionId} request={r} styles={styles} router={router}>
                  <AnimatedPressable
                    style={styles.secondaryButton}
                    onPress={() => handleCancel(r)}
                    disabled={busyId === r.connectionId}>
                    {busyId === r.connectionId ? (
                      <ActivityIndicator color={colors.text} size="small" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    )}
                  </AnimatedPressable>
                </RequestRow>
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

function RequestRow({
  request,
  children,
  styles,
  router,
}: {
  request: ConnectionRequest;
  children: ReactNode;
  styles: ReturnType<typeof makeStyles>;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={styles.row}>
      <AnimatedPressable
        style={styles.rowIdentity}
        onPress={() => router.push(`/user/${request.otherUserId}`)}>
        {request.otherUserAvatarUrl ? (
          <Image source={{ uri: request.otherUserAvatarUrl }} style={styles.avatarImage} />
        ) : (
          <InitialsAvatar name={request.otherUserName} size={40} />
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {request.otherUserName}
          </Text>
          <Text style={styles.rowLocation} numberOfLines={1}>
            {request.otherUserLocation || 'Location unknown'}
          </Text>
        </View>
      </AnimatedPressable>
      <View style={styles.rowActions}>{children}</View>
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
    section: { marginTop: 10, gap: 10 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text, marginBottom: 4 },
    empty: { fontStyle: 'italic', color: colors.textSecondary, fontSize: 13, paddingVertical: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    rowIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatarImage: { width: 40, height: 40, borderRadius: 20 },
    rowText: { flex: 1, gap: 2 },
    rowName: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    rowLocation: { fontSize: 12, color: colors.textSecondary },
    rowActions: { flexDirection: 'row', gap: 8 },
    primaryButton: {
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADII.md,
      backgroundColor: colors.coral,
      minWidth: 66,
    },
    primaryButtonText: { fontWeight: WEIGHT.semibold, fontSize: 12, color: ON_ACCENT },
    secondaryButton: {
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      minWidth: 66,
    },
    secondaryButtonText: { fontWeight: WEIGHT.semibold, fontSize: 12, color: colors.text },
  });
}
