import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { PickThreeField } from '@/components/profile/pick-three-field';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { SportTagsField } from '@/components/profile/sport-tags-field';
import { TrophyCase } from '@/components/profile/trophy-case';
import { ContentMenu, type ReportReasonOption } from '@/components/moderation/content-menu';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import {
  acceptConnection,
  fetchAllowsConnectionRequests,
  fetchConnectionNote,
  fetchConnectionState,
  fetchIsPrivate,
  fetchMutualConnectionsCount,
  removeConnection,
  saveConnectionNote,
  sendConnectionRequest,
  type ConnectionState,
} from '@/lib/connections';
import { blockUser, fetchBlockedEitherDirection, reportContent, type ReportReason } from '@/lib/moderation';
import { fetchProfile, type Profile } from '@/lib/profile';

const PROFILE_REPORT_REASONS: ReportReasonOption[] = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'fake_profile', label: 'Fake profile' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

export default function UserProfileScreen() {
  const { id, src } = useLocalSearchParams<{ id: string; src?: string }>();
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>({
    connectionId: null,
    status: null,
    requestedByMe: false,
  });
  const [allowsRequests, setAllowsRequests] = useState(true);
  const [isPrivate, setIsPrivate] = useState(true);
  const [mutualCount, setMutualCount] = useState(0);
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!currentUserId || !id) return;

    if (id === currentUserId) {
      router.replace('/(tabs)/profile');
      return;
    }

    setLoading(true);
    try {
      const blockedIds = await fetchBlockedEitherDirection(currentUserId);
      if (blockedIds.includes(id)) {
        setBlocked(true);
        setLoading(false);
        return;
      }
      setBlocked(false);

      const [fetchedProfile, state, allows, priv] = await Promise.all([
        fetchProfile(id),
        fetchConnectionState(currentUserId, id),
        fetchAllowsConnectionRequests(id),
        fetchIsPrivate(id),
      ]);

      setProfile(fetchedProfile);
      setConnection(state);
      setAllowsRequests(allows);
      setIsPrivate(priv);

      // Mutual connections only matter as a pre-connection signal; skip once
      // already connected (or self-requested), and fail soft either way.
      if (state.status !== 'accepted') {
        fetchMutualConnectionsCount(id).then(setMutualCount);
      } else {
        setMutualCount(0);
      }

      if (state.status === 'accepted') {
        try {
          const existingNote = await fetchConnectionNote(currentUserId, id);
          setNote(existingNote.note);
        } catch {
          // Non-critical — the note field just stays blank if this fails.
        }
      }
    } catch (e) {
      Alert.alert('Could not load this profile', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSaveNote = async () => {
    if (!currentUserId || !id) return;
    setNoteSaving(true);
    try {
      await saveConnectionNote(currentUserId, id, note);
    } catch (e) {
      Alert.alert('Could not save note', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!currentUserId || !id) return;
    if (!allowsRequests) {
      Alert.alert('Requests off', `${profile?.name || 'This person'} isn't accepting connection requests right now.`);
      return;
    }
    setBusy(true);
    try {
      await sendConnectionRequest(currentUserId, id);
      setConnection({ connectionId: null, status: 'pending', requestedByMe: true });
      await load();
    } catch (e) {
      Alert.alert('Could not send request', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!connection.connectionId) return;
    setBusy(true);
    try {
      await removeConnection(connection.connectionId);
      setConnection({ connectionId: null, status: null, requestedByMe: false });
    } catch (e) {
      Alert.alert('Could not cancel request', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!connection.connectionId) return;
    setBusy(true);
    try {
      await acceptConnection(connection.connectionId);
      await load();
    } catch (e) {
      Alert.alert('Could not accept request', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineIncoming = async () => {
    if (!connection.connectionId) return;
    setBusy(true);
    try {
      await removeConnection(connection.connectionId);
      setConnection({ connectionId: null, status: null, requestedByMe: false });
    } catch (e) {
      Alert.alert('Could not decline request', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = () => {
    if (!connection.connectionId) return;
    Alert.alert('Disconnect?', `You'll need to send a new request to reconnect with ${profile?.name || 'them'}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeConnection(connection.connectionId as string);
            setConnection({ connectionId: null, status: null, requestedByMe: false });
          } catch (e) {
            Alert.alert('Could not disconnect', e instanceof Error ? e.message : 'Unknown error.');
          }
        },
      },
    ]);
  };

  const handleReport = async (reason: ReportReason) => {
    if (!currentUserId || !id) return;
    try {
      await reportContent(currentUserId, 'profile', id, reason);
      Alert.alert('Reported', "Thanks for flagging this — we'll take a look.");
    } catch (e) {
      Alert.alert('Could not send report', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleBlock = () => {
    if (!currentUserId || !id) return;
    Alert.alert(`Block ${profile?.name || 'this person'}?`, "You won't see each other's content or profiles anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(currentUserId, id);
            router.back();
          } catch (e) {
            Alert.alert('Could not block user', e instanceof Error ? e.message : 'Unknown error.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  if (blocked) {
    return (
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.unavailable}>
          <Text style={styles.unavailableText}>This profile isn't available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) return null;

  const canSeeFullProfile = !isPrivate || connection.status === 'accepted';
  const notYetConnected = connection.status !== 'accepted';
  const cameFromQr = src === 'qr' && notYetConnected;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile.name || 'Nameless legend'}
        </Text>
        <AnimatedPressable onPress={() => setMenuOpen(true)} hitSlop={8}>
          <MoreHorizontal size={22} color={colors.text} strokeWidth={1.75} />
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <ProfileAvatar name={profile.name} photoUri={profile.avatarUrl} size={84} />
        </View>

        {cameFromQr ? (
          <View style={styles.qrBanner}>
            <Text style={styles.qrBannerText}>
              You scanned {profile.name || "this person's"} code — connect with them?
            </Text>
          </View>
        ) : null}

        {notYetConnected && mutualCount > 0 ? (
          <Text style={styles.mutualText}>
            {mutualCount} mutual connection{mutualCount === 1 ? '' : 's'}
          </Text>
        ) : null}

        {canSeeFullProfile ? (
          <>
            <Text style={styles.location}>{profile.location || 'Location unknown (probably local)'}</Text>

            <Text style={[styles.bio, !profile.legend && styles.placeholderText]}>
              {profile.legend || "hasn't written a legend yet"}
            </Text>

            <SportTagsField editing={false} selected={profile.sportTags} />
          </>
        ) : (
          <Text style={styles.privateText}>Connect to see more</Text>
        )}

        <View style={styles.actionRow}>
          {connection.status === 'accepted' ? (
            <AnimatedPressable style={styles.connectedButton} onPress={handleDisconnect} disabled={busy}>
              <Text style={styles.connectedButtonText}>Connected ✓</Text>
            </AnimatedPressable>
          ) : connection.status === 'pending' && connection.requestedByMe ? (
            <AnimatedPressable style={styles.secondaryButton} onPress={handleCancelRequest} disabled={busy}>
              <Text style={styles.secondaryButtonText}>Cancel request</Text>
            </AnimatedPressable>
          ) : connection.status === 'pending' && !connection.requestedByMe ? (
            <View style={styles.incomingRow}>
              <AnimatedPressable style={styles.secondaryButton} onPress={handleDeclineIncoming} disabled={busy}>
                <Text style={styles.secondaryButtonText}>Decline</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.primaryButton} onPress={handleAccept} disabled={busy}>
                <Text style={styles.primaryButtonText}>Accept</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <AnimatedPressable style={styles.primaryButton} onPress={handleConnect} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={ON_ACCENT} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Connect</Text>
              )}
            </AnimatedPressable>
          )}
        </View>

        {canSeeFullProfile ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Trophy Case</Text>
              <TrophyCase editing={false} trophies={profile.trophies} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pick Your 3</Text>
              <PickThreeField editing={false} items={profile.pickThree} />
            </View>
          </>
        ) : null}

        {connection.status === 'accepted' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Private note (only visible to you)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. guards me every game"
              placeholderTextColor={colors.textSecondary}
              value={note}
              onChangeText={setNote}
              onBlur={handleSaveNote}
              multiline
            />
            {noteSaving ? <ActivityIndicator color={colors.textSecondary} size="small" /> : null}
          </View>
        ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ContentMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        canDelete={false}
        showReportAndBlock
        authorName={profile.name || 'this person'}
        onDelete={() => {}}
        onReport={handleReport}
        onBlock={handleBlock}
        reportReasons={PROFILE_REPORT_REASONS}
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text, flex: 1, textAlign: 'center' },
    unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    unavailableText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
    content: { padding: 20, paddingBottom: 48, gap: 4 },
    avatarSection: { alignItems: 'center' },
    qrBanner: {
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: RADII.md,
      backgroundColor: colors.borderSoft,
    },
    qrBannerText: { fontSize: 13, fontWeight: WEIGHT.medium, color: colors.text, textAlign: 'center' },
    mutualText: { marginTop: 10, fontSize: 13, color: colors.blue, textAlign: 'center', fontWeight: WEIGHT.medium },
    privateText: {
      marginTop: 14,
      fontSize: 14,
      fontStyle: 'italic',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    location: { marginTop: 14, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    bio: { marginTop: 8, fontSize: 15, fontStyle: 'italic', color: colors.text, textAlign: 'center' },
    placeholderText: { color: colors.textSecondary },
    noteInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      padding: 12,
      fontSize: 14,
      color: colors.text,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    actionRow: { marginTop: 18, alignItems: 'center' },
    incomingRow: { flexDirection: 'row', gap: 10, width: '100%' },
    primaryButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: RADII.md,
      backgroundColor: colors.coral,
    },
    primaryButtonText: { fontWeight: WEIGHT.semibold, fontSize: 14, color: ON_ACCENT },
    secondaryButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    secondaryButtonText: { fontWeight: WEIGHT.semibold, fontSize: 14, color: colors.text },
    connectedButton: {
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.blue,
      backgroundColor: colors.background,
    },
    connectedButtonText: { fontWeight: WEIGHT.semibold, fontSize: 14, color: colors.blue },
    section: { marginTop: 26, gap: 10 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
  });
}
