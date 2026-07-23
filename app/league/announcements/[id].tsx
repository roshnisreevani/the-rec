import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, ChevronLeft, ImagePlus, Megaphone, Pin, PinOff, Trash2, Trophy, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { GOLD, ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  archiveAnnouncement,
  deleteAnnouncement,
  describeActivityItem,
  fetchActivityFeed,
  fetchLeagueDetail,
  pinAnnouncement,
  postAnnouncement,
  unpinAnnouncement,
  type ActivityFeedItem,
  type LeagueRole,
} from '@/lib/leagues';
import { pickImage, type PickedImage } from '@/lib/pick-photo';
import { uploadBulletinImage } from '@/lib/upload-photo';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function LeagueAnnouncementsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [leagueName, setLeagueName] = useState('');
  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [feed, setFeed] = useState<ActivityFeedItem[]>([]);
  const [body, setBody] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const [detail, fetched] = await Promise.all([fetchLeagueDetail(id, userId), fetchActivityFeed(id, 60)]);
      setLeagueName(detail?.league.name ?? '');
      setMyRole(detail?.league.myRole ?? null);
      setFeed(fetched);
    } catch (e) {
      Alert.alert('Could not load announcements', errorMessage(e));
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

  const handlePickImage = async () => {
    const picked = await pickImage();
    if (picked) setImage(picked);
  };

  const handlePost = async () => {
    if (!id || !userId) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      const imageUrl = image ? await uploadBulletinImage(id, image.uri, image.width, image.height) : null;
      await postAnnouncement(id, userId, trimmed, imageUrl);
      setBody('');
      setImage(null);
      load();
    } catch (e) {
      // Keep the typed text and selected image so a failed upload can just be retried.
      Alert.alert('Could not post to the Bulletin', errorMessage(e));
    } finally {
      setPosting(false);
    }
  };

  const handleTogglePin = async (item: ActivityFeedItem) => {
    setBusyId(item.id);
    try {
      if (item.pinned) await unpinAnnouncement(item.id);
      else await pinAnnouncement(item.id);
      load();
    } catch (e) {
      Alert.alert('Could not update pin', errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = (item: ActivityFeedItem) => {
    Alert.alert('Archive this post?', "It'll be removed from the Bulletin but not deleted.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        onPress: async () => {
          setBusyId(item.id);
          try {
            await archiveAnnouncement(item.id);
            load();
          } catch (e) {
            Alert.alert('Could not archive post', errorMessage(e));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const handleDelete = (item: ActivityFeedItem) => {
    Alert.alert('Delete this post?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const prev = feed;
          setFeed((list) => list.filter((f) => f.id !== item.id));
          try {
            await deleteAnnouncement(item.id);
          } catch (e) {
            setFeed(prev);
            Alert.alert('Could not delete post', errorMessage(e));
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
          {leagueName ? `${leagueName} · Announcements` : 'Announcements'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <ActivityIndicator color={colors.text} style={styles.spinner} />
        ) : (
          <FlatList
            data={feed}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Megaphone size={32} color={colors.textSecondary} strokeWidth={1.5} />
                <Text style={styles.emptyText}>Nothing here yet.</Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.kind !== 'bulletin') {
                return (
                  <View style={styles.eventRow}>
                    <View style={styles.systemIconCircle}>
                      <Trophy size={13} color={colors.textSecondary} strokeWidth={2} />
                    </View>
                    <View style={styles.eventText}>
                      <Text style={styles.eventBody}>{describeActivityItem(item)}</Text>
                      <Text style={styles.announcementTime}>{timeAgo(item.createdAt)}</Text>
                    </View>
                  </View>
                );
              }

              return (
                <View style={item.pinned ? styles.pinnedCard : styles.announcementRow}>
                  {item.pinned ? (
                    <View style={styles.pinnedTopRow}>
                      <Pin size={13} color={colors.text} strokeWidth={2} />
                      <Text style={styles.pinnedLabel}>Pinned</Text>
                    </View>
                  ) : null}
                  {item.pinned && item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.pinnedImage} /> : null}
                  <View style={styles.announcementMain}>
                    {!item.pinned ? (
                      item.authorAvatarUrl ? (
                        <Image source={{ uri: item.authorAvatarUrl }} style={styles.avatarImage} />
                      ) : (
                        <InitialsAvatar name={item.authorName ?? '?'} size={36} />
                      )
                    ) : null}
                    <View style={styles.announcementText}>
                      <View style={styles.announcementTop}>
                        <Text style={styles.announcementAuthor} numberOfLines={1}>
                          {item.authorName}
                        </Text>
                        <Text style={styles.announcementTime}>{timeAgo(item.createdAt)}</Text>
                      </View>
                      <Text style={item.pinned ? styles.pinnedBody : styles.announcementBody}>{item.body}</Text>
                      {!item.pinned && item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.announcementImage} />
                      ) : null}
                    </View>
                  </View>

                  {isCommissioner ? (
                    busyId === item.id ? (
                      <ActivityIndicator color={colors.text} size="small" style={styles.itemActions} />
                    ) : (
                      <View style={styles.itemActions}>
                        <AnimatedPressable onPress={() => handleTogglePin(item)} hitSlop={8}>
                          {item.pinned ? (
                            <PinOff size={15} color={colors.textSecondary} strokeWidth={2} />
                          ) : (
                            <Pin size={15} color={colors.textSecondary} strokeWidth={2} />
                          )}
                        </AnimatedPressable>
                        <AnimatedPressable onPress={() => handleArchive(item)} hitSlop={8}>
                          <Archive size={15} color={colors.textSecondary} strokeWidth={2} />
                        </AnimatedPressable>
                        <AnimatedPressable onPress={() => handleDelete(item)} hitSlop={8}>
                          <Trash2 size={15} color={colors.textSecondary} strokeWidth={2} />
                        </AnimatedPressable>
                      </View>
                    )
                  ) : null}
                </View>
              );
            }}
          />
        )}

        {isCommissioner ? (
          <View style={styles.composerWrap}>
            {image ? (
              <View style={styles.composerImageRow}>
                <Image source={{ uri: image.uri }} style={styles.composerImagePreview} />
                <AnimatedPressable style={styles.composerImageRemove} onPress={() => setImage(null)} hitSlop={8}>
                  <X size={13} color={ON_ACCENT} strokeWidth={2.5} />
                </AnimatedPressable>
              </View>
            ) : null}
            <View style={styles.composer}>
              <AnimatedPressable onPress={handlePickImage} hitSlop={8} disabled={posting}>
                <ImagePlus size={22} color={colors.textSecondary} strokeWidth={1.75} />
              </AnimatedPressable>
              <TextInput
                style={styles.composerInput}
                placeholder="Post to the Bulletin…"
                placeholderTextColor={colors.textSecondary}
                value={body}
                onChangeText={setBody}
                multiline
              />
              <AnimatedPressable style={styles.postButton} onPress={handlePost} disabled={posting || !body.trim()}>
                {posting ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.postButtonText}>Post</Text>}
              </AnimatedPressable>
            </View>
          </View>
        ) : null}
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
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    spinner: { marginTop: 30 },
    list: { padding: 20, flexGrow: 1 },
    empty: { alignItems: 'center', gap: 10, paddingTop: 60 },
    emptyText: { fontSize: 14, color: colors.textSecondary },
    pinnedCard: {
      backgroundColor: colors.borderSoft,
      borderLeftWidth: 4,
      borderLeftColor: GOLD,
      padding: 14,
      marginBottom: 14,
      gap: 6,
    },
    pinnedTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pinnedLabel: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.text },
    pinnedImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: RADII.sm, marginBottom: 4 },
    pinnedBody: { fontSize: 15, fontWeight: WEIGHT.medium, color: colors.text, lineHeight: 21 },
    announcementRow: {
      flexDirection: 'column',
      gap: 8,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    announcementMain: { flexDirection: 'row', gap: 10 },
    avatarImage: { width: 36, height: 36, borderRadius: 18 },
    announcementText: { flex: 1, gap: 3 },
    announcementTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    announcementAuthor: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text, flexShrink: 1 },
    announcementTime: { fontSize: 11, color: colors.textSecondary },
    announcementBody: { fontSize: 14, color: colors.text, lineHeight: 19 },
    announcementImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: RADII.sm, marginTop: 6 },
    itemActions: { flexDirection: 'row', gap: 16, alignSelf: 'flex-end' },
    eventRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, alignItems: 'center' },
    systemIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventText: { flex: 1, gap: 2 },
    eventBody: { fontSize: 13, color: colors.textSecondary },
    composerWrap: { borderTopWidth: 1, borderTopColor: colors.border },
    composerImageRow: { paddingHorizontal: 16, paddingTop: 12 },
    composerImagePreview: { width: 90, height: 90, borderRadius: RADII.md },
    composerImageRemove: {
      position: 'absolute',
      top: 6,
      left: 76,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      padding: 16,
    },
    composerInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.background,
      maxHeight: 100,
    },
    postButton: {
      backgroundColor: colors.blue,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    postButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
