import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft, Copy, RotateCw, Share2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  fetchGroupDetail,
  fetchOrCreateInviteCode,
  fetchPendingInviteUserIds,
  getGroupInviteUrl,
  inviteUserToGroup,
  regenerateInviteCode,
  searchUsersToInvite,
  type InvitablePerson,
} from '@/lib/groups';

type InviteStatus = 'idle' | 'sending' | 'sent' | 'error';

export default function GroupInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InvitablePerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<Record<string, InviteStatus>>({});

  useEffect(() => {
    if (!id || !userId) return;
    let cancelled = false;

    (async () => {
      try {
        const [detail, code, pendingInviteIds] = await Promise.all([
          fetchGroupDetail(id, userId),
          fetchOrCreateInviteCode(id, userId),
          fetchPendingInviteUserIds(id),
        ]);
        if (cancelled) return;
        setGroupName(detail?.group.name ?? '');
        setInviteCode(code);
        const memberIds = (detail?.members ?? []).map((m) => m.userId);
        setExcludedIds([...memberIds, ...pendingInviteIds, userId]);
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

  const inviteUrl = inviteCode ? getGroupInviteUrl(inviteCode) : '';

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
      await Share.share({ message: `Join ${groupName || 'my group'} on The Rec: ${inviteUrl}` });
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
            const code = await regenerateInviteCode(id);
            setInviteCode(code);
          } catch (e) {
            Alert.alert('Could not regenerate link', errorMessage(e));
          } finally {
            setRegenerating(false);
          }
        },
      },
    ]);
  };

  const runSearch = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const people = await searchUsersToInvite(text, excludedIds);
        setResults(people);
      } catch (e) {
        Alert.alert('Search failed', errorMessage(e));
      } finally {
        setSearching(false);
      }
    },
    [excludedIds]
  );

  const handleQueryChange = (text: string) => {
    setQuery(text);
    runSearch(text);
  };

  const handleInvite = async (person: InvitablePerson) => {
    if (!id || !userId) return;
    setInviteStatus((prev) => ({ ...prev, [person.id]: 'sending' }));
    try {
      await inviteUserToGroup(id, person.id, userId);
      setInviteStatus((prev) => ({ ...prev, [person.id]: 'sent' }));
    } catch (e) {
      setInviteStatus((prev) => ({ ...prev, [person.id]: 'error' }));
      Alert.alert('Could not send invite', errorMessage(e));
    }
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite people</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name…"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={handleQueryChange}
          />

          {searching ? (
            <ActivityIndicator color={colors.text} style={styles.searchSpinner} />
          ) : (
            results.map((person) => {
              const status = inviteStatus[person.id] ?? 'idle';
              return (
                <View key={person.id} style={styles.resultRow}>
                  {person.avatarUrl ? (
                    <Image source={{ uri: person.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <InitialsAvatar name={person.name} size={36} />
                  )}
                  <Text style={styles.resultName} numberOfLines={1}>
                    {person.name}
                  </Text>
                  {status === 'sending' ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : status === 'sent' ? (
                    <View style={styles.sentBadge}>
                      <Check size={13} color={colors.text} strokeWidth={2.5} />
                      <Text style={styles.sentBadgeText}>Invited</Text>
                    </View>
                  ) : (
                    <AnimatedPressable style={styles.inviteButton} onPress={() => handleInvite(person)}>
                      <Text style={styles.inviteButtonText}>Invite</Text>
                    </AnimatedPressable>
                  )}
                </View>
              );
            })
          )}

          {!searching && query.trim() && results.length === 0 ? (
            <Text style={styles.emptyResults}>No matching users found.</Text>
          ) : null}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    section: { marginTop: 10, gap: 10 },
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
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 11,
    },
    linkButtonPrimaryText: { fontSize: 14, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
    regenerateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 2 },
    regenerateText: { fontSize: 12, color: colors.textSecondary },
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.background,
    },
    searchSpinner: { marginTop: 12 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    avatarImage: { width: 36, height: 36, borderRadius: 18 },
    resultName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: WEIGHT.medium },
    inviteButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    inviteButtonText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
    sentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sentBadgeText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    emptyResults: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 8 },
  });
}
