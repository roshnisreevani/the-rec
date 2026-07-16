import { useFocusEffect } from '@react-navigation/native';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ImagePlus, Mic, MoreHorizontal, Pause, Pin, Play, Send, Square } from 'lucide-react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { EMOJI_BANK } from '@/components/feed/reaction-bar';
import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  deleteMessageForEveryone,
  deleteMessageForMe,
  fetchConversationInfo,
  fetchConversationMembers,
  fetchMessageReactions,
  fetchMessages,
  fullMessageTimeLabel,
  markConversationRead,
  MAX_VOICE_NOTE_SECONDS,
  messageTimeLabel,
  MESSAGE_QUICK_REACTIONS,
  sendMessage,
  sendVoiceMessage,
  setConversationCustomization,
  setConversationMuted,
  setPinnedMessage,
  toggleMessageReaction,
  type ChatMessage,
  type ConversationInfo,
  type ConversationMember,
  type ReactionSummary,
} from '@/lib/banter';
import { leaveGroup } from '@/lib/groups';
import { blockUser, fetchBlockedUserIds, reportContent, type ReportReason } from '@/lib/moderation';
import { pickPhoto } from '@/lib/pick-photo';
import { uploadVoiceNote } from '@/lib/upload-audio';
import { uploadMessagePhoto } from '@/lib/upload-photo';

const SWIPE_REVEAL = 78;
const REPLY_SWIPE_TRIGGER = 56;

const POLL_MS = 4000;

const MAX_MESSAGE_LENGTH = 4000;
const CHAR_WARNING_THRESHOLD = 3800;

const REPORT_REASONS: { label: string; reason: ReportReason }[] = [
  { label: 'Spam', reason: 'spam' },
  { label: 'Harassment', reason: 'harassment' },
  { label: 'Inappropriate', reason: 'inappropriate' },
  { label: 'Other', reason: 'other' },
];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [reactions, setReactions] = useState<Record<string, ReactionSummary[]>>({});
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reactionSheetFor, setReactionSheetFor] = useState<ChatMessage | null>(null);
  const [pickerMessage, setPickerMessage] = useState<ChatMessage | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState<ChatMessage | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recordStartRef = useRef(0);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const infoLoaded = useRef(false);
  // load() is memoized with a stable dep array, so it can't read blockedIds
  // straight from state without going stale — this ref always has the
  // latest set, kept in sync by the effect below.
  const blockedIdsRef = useRef<string[]>([]);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      if (!infoLoaded.current) {
        const [detail, blocked] = await Promise.all([
          fetchConversationInfo(id, userId),
          fetchBlockedUserIds(userId),
        ]);
        if (!detail) {
          Alert.alert('Conversation not found', "This conversation doesn't exist or you're not in it.");
          router.back();
          return;
        }
        setInfo(detail);
        setBlockedIds(new Set(blocked));
        blockedIdsRef.current = blocked;
        infoLoaded.current = true;
      }
      const [fetchedMessages, fetchedMembers, fetchedReactions] = await Promise.all([
        fetchMessages(id, userId, blockedIdsRef.current),
        fetchConversationMembers(id),
        fetchMessageReactions(id, userId),
      ]);
      setMessages(fetchedMessages);
      setMembers(fetchedMembers);
      setReactions(fetchedReactions);
      markConversationRead(id, userId).catch(() => {});
    } catch (e) {
      Alert.alert('Could not load messages', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

  useEffect(() => {
    blockedIdsRef.current = Array.from(blockedIds);
  }, [blockedIds]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, POLL_MS);
      return () => clearInterval(timer);
    }, [load])
  );

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !userId || !id || sending) return;
    setSending(true);
    try {
      await sendMessage(id, userId, content, undefined, replyDraft?.id ?? null);
      setDraft('');
      setReplyDraft(null);
      await load();
    } catch (e) {
      Alert.alert('Could not send message', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = async () => {
    if (!userId || !id || sending) return;
    const localUri = await pickPhoto();
    if (!localUri) return;
    setSending(true);
    try {
      const uploadedUrl = await uploadMessagePhoto(userId, localUri);
      // content can't be empty (DB check), so an image-only send gets a
      // small placeholder caption rather than failing the insert.
      await sendMessage(id, userId, draft.trim() || '📷 Photo', uploadedUrl, replyDraft?.id ?? null);
      setDraft('');
      setReplyDraft(null);
      await load();
    } catch (e) {
      Alert.alert('Could not send photo', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const handleMicPressIn = async () => {
    if (sending || isRecording) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('No access', 'Need microphone access to record a voice note.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartRef.current = Date.now();
      setIsRecording(true);
      autoStopTimer.current = setTimeout(handleMicPressOut, MAX_VOICE_NOTE_SECONDS * 1000);
    } catch (e) {
      Alert.alert('Could not start recording', errorMessage(e));
    }
  };

  const handleMicPressOut = async () => {
    if (!isRecording) return;
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    setIsRecording(false);
    const elapsedSec = (Date.now() - recordStartRef.current) / 1000;
    try {
      await recorder.stop();
      const localUri = recorder.uri;
      // Treat anything under half a second as an accidental tap, not a note.
      if (!localUri || elapsedSec < 0.5 || !userId || !id) return;
      setSending(true);
      const uploadedUrl = await uploadVoiceNote(userId, localUri);
      await sendVoiceMessage(id, userId, uploadedUrl, Math.min(elapsedSec, MAX_VOICE_NOTE_SECONDS), replyDraft?.id ?? null);
      setReplyDraft(null);
      await load();
    } catch (e) {
      Alert.alert('Could not send voice note', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const reportMessage = (message: ChatMessage) => {
    Alert.alert(
      'Report message',
      'Why are you reporting this message?',
      [
        ...REPORT_REASONS.map(({ label, reason }) => ({
          text: label,
          onPress: async () => {
            if (!userId) return;
            try {
              await reportContent(userId, 'message', message.id, reason);
              Alert.alert('Report sent', 'Thanks — our team will take a look.');
            } catch (e) {
              Alert.alert('Could not send report', errorMessage(e));
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const blockSender = (targetId: string, targetName: string) => {
    Alert.alert(
      `Block ${targetName}?`,
      "They won't be able to message you, and you'll stop seeing each other's content.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            try {
              await blockUser(userId, targetId);
              if (info?.type === 'dm') {
                router.back();
              } else {
                setBlockedIds((prev) => new Set(prev).add(targetId));
              }
            } catch (e) {
              Alert.alert('Could not block user', errorMessage(e));
            }
          },
        },
      ]
    );
  };

  const handleDeleteForEveryone = (message: ChatMessage) => {
    Alert.alert('Delete for everyone?', "This message will be removed for everyone in the chat.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete for Everyone',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessageForEveryone(message.id);
            await load();
          } catch (e) {
            Alert.alert('Could not delete message', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handleDeleteForMe = (message: ChatMessage) => {
    if (!userId) return;
    Alert.alert('Delete for you?', "This only removes it from your view — others will still see it.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete for Me',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessageForMe(message.id, userId);
            await load();
          } catch (e) {
            Alert.alert('Could not delete message', errorMessage(e));
          }
        },
      },
    ]);
  };

  // Long-press opens the reaction sheet first (quick emoji row + "+" full
  // picker); its own moderation/delete actions live below the reactions.
  const handleLongPressMessage = (message: ChatMessage) => {
    if (message.deletedForEveryone) return;
    setReactionSheetFor(message);
  };

  const handleToggleReaction = async (message: ChatMessage, emoji: string) => {
    if (!userId) return;
    setReactionSheetFor(null);
    setPickerMessage(null);
    try {
      await toggleMessageReaction(message.id, userId, emoji);
      await load();
    } catch (e) {
      Alert.alert('Could not react', errorMessage(e));
    }
  };

  const handlePinMessage = async (message: ChatMessage) => {
    if (!id) return;
    setReactionSheetFor(null);
    try {
      await setPinnedMessage(id, message.id);
      await load();
    } catch (e) {
      Alert.alert('Could not pin message', errorMessage(e));
    }
  };

  const handleTogglePinFromSheet = (message: ChatMessage) => {
    if (info?.pinnedMessage?.id === message.id) {
      setReactionSheetFor(null);
      handleUnpinMessage();
    } else {
      handlePinMessage(message);
    }
  };

  const handleUnpinMessage = async () => {
    if (!id) return;
    try {
      await setPinnedMessage(id, null);
      await load();
    } catch (e) {
      Alert.alert('Could not unpin message', errorMessage(e));
    }
  };

  /** Other members (not the sender) whose last_read_at is at/after this
   * message's created_at — i.e. who has seen it. */
  const seenByFor = useCallback(
    (message: ChatMessage): string[] =>
      members
        .filter((m) => m.userId !== message.senderId && new Date(m.lastReadAt) >= new Date(message.createdAt))
        .map((m) => m.name),
    [members]
  );

  const handleHeaderMenu = () => {
    if (!info || info.type !== 'dm' || !info.otherUserId) return;
    Alert.alert(info.title, undefined, [
      {
        text: 'Report User',
        onPress: () => {
          Alert.alert('Report user', 'Why are you reporting this user?', [
            ...REPORT_REASONS.map(({ label, reason }) => ({
              text: label,
              onPress: async () => {
                if (!userId || !info.otherUserId) return;
                try {
                  await reportContent(userId, 'profile', info.otherUserId, reason);
                  Alert.alert('Report sent', 'Thanks — our team will take a look.');
                } catch (e) {
                  Alert.alert('Could not send report', errorMessage(e));
                }
              },
            })),
            { text: 'Cancel', style: 'cancel' as const },
          ]);
        },
      },
      {
        text: 'Block User',
        style: 'destructive',
        onPress: () => blockSender(info.otherUserId!, info.title),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const myMembership = members.find((m) => m.userId === userId);

  const handleToggleMute = async () => {
    if (!userId || !id) return;
    const nextMuted = !myMembership?.muted;
    try {
      await setConversationMuted(id, userId, nextMuted);
      await load();
    } catch (e) {
      Alert.alert('Could not update', errorMessage(e));
    }
  };

  const handleLeaveGroup = () => {
    if (!info?.groupId || !userId) return;
    Alert.alert('Leave group?', "You'll be removed from the group and this chat.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(info.groupId!, userId);
            router.back();
          } catch (e) {
            Alert.alert('Could not leave group', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handleOpenRename = () => {
    setRenameText(info?.customTitle ?? '');
    setRenameOpen(true);
  };

  const handleSaveRename = async () => {
    if (!id || !info) return;
    const trimmed = renameText.trim();
    try {
      await setConversationCustomization(id, trimmed || null, info.customAvatarUrl);
      setRenameOpen(false);
      await load();
    } catch (e) {
      Alert.alert('Could not rename chat', errorMessage(e));
    }
  };

  const handleChangeIcon = async () => {
    if (!id || !userId || !info) return;
    const localUri = await pickPhoto();
    if (!localUri) return;
    try {
      const uploadedUrl = await uploadMessagePhoto(userId, localUri);
      await setConversationCustomization(id, info.customTitle, uploadedUrl);
      await load();
    } catch (e) {
      Alert.alert('Could not change icon', errorMessage(e));
    }
  };

  const handleGroupHeaderMenu = () => {
    if (!info || info.type === 'dm') return;
    Alert.alert(info.title, undefined, [
      { text: 'View Members', onPress: () => setMembersOpen(true) },
      { text: 'Rename Chat', onPress: handleOpenRename },
      { text: 'Change Icon', onPress: handleChangeIcon },
      { text: myMembership?.muted ? 'Unmute Notifications' : 'Mute Notifications', onPress: handleToggleMute },
      { text: 'Leave Group', style: 'destructive', onPress: handleLeaveGroup },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const visibleMessages = useMemo(
    () => messages.filter((m) => !blockedIds.has(m.senderId)),
    [messages, blockedIds]
  );
  const invertedMessages = useMemo(() => visibleMessages.slice().reverse(), [visibleMessages]);

  // Ids of the last message in each run of consecutive same-sender messages
  // (chronological order). Only these get the avatar + name, iMessage-style —
  // earlier bubbles in a burst stay bare. Computed once, not per render.
  const burstTailIds = useMemo(() => {
    const tails = new Set<string>();
    for (let i = 0; i < visibleMessages.length; i++) {
      const next = visibleMessages[i + 1];
      if (!next || next.senderId !== visibleMessages[i].senderId) {
        tails.add(visibleMessages[i].id);
      }
    }
    return tails;
  }, [visibleMessages]);

  if (loading || !info) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  const isGroupChat = info.type !== 'dm';

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <View style={styles.headerTitleWrap}>
          {isGroupChat ? (
            info.avatarUrl ? (
              <ExpoImage source={{ uri: info.avatarUrl }} style={styles.headerAvatar} cachePolicy="memory-disk" />
            ) : (
              <InitialsAvatar name={info.title} size={24} />
            )
          ) : null}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {info.title}
          </Text>
        </View>
        <AnimatedPressable
          onPress={info.type === 'dm' ? handleHeaderMenu : handleGroupHeaderMenu}
          hitSlop={8}>
          <MoreHorizontal size={22} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
      </View>

      {info.pinnedMessage ? (
        <View style={styles.pinnedBanner}>
          <Pin size={13} color={colors.coral} strokeWidth={2} fill={colors.coral} />
          <View style={styles.pinnedTextWrap}>
            <Text style={styles.pinnedByText}>Pinned by {info.pinnedMessage.pinnedByName}</Text>
            <Text style={styles.pinnedContentText} numberOfLines={1}>
              {info.pinnedMessage.content}
            </Text>
          </View>
          <Pressable onPress={handleUnpinMessage} hitSlop={8}>
            <Text style={styles.pinnedUnpinText}>Unpin</Text>
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <FlatList
          data={invertedMessages}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Text style={styles.emptyThreadText}>No messages yet — kick off the banter.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.senderId === userId;
            // Avatar rides the last bubble of a same-sender burst (the visual
            // bottom, where the tail sits) — on the left for others, on the
            // right for me. The name label is only for others in group chats.
            const showMeta = burstTailIds.has(item.id);
            const avatar = showMeta ? (
              item.senderAvatarUrl ? (
                <ExpoImage
                  source={{ uri: item.senderAvatarUrl }}
                  style={styles.messageAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <InitialsAvatar name={item.senderName} size={26} />
              )
            ) : (
              // Keep bubbles in a burst aligned under the avatared one.
              <View style={styles.avatarSpacer} />
            );
            const seenBy = mine ? seenByFor(item) : [];
            const messageReactions = reactions[item.id] ?? [];
            return (
              <SwipeableBubble
                mine={mine}
                detailLabel={
                  mine && seenBy.length > 0
                    ? `Seen by ${seenBy.join(', ')} · ${fullMessageTimeLabel(item.createdAt)}`
                    : fullMessageTimeLabel(item.createdAt)
                }
                colors={colors}
                onLongPress={() => handleLongPressMessage(item)}
                onSwipeReply={() => !item.deletedForEveryone && setReplyDraft(item)}>
                <View
                  style={[
                    styles.bubbleRow,
                    mine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
                    messageReactions.length > 0 && styles.bubbleRowWithReactions,
                  ]}>
                  {!mine ? avatar : null}
                  <View style={styles.bubbleWrap}>
                    <View
                      style={[
                        styles.bubble,
                        mine ? styles.bubbleMine : styles.bubbleTheirs,
                        item.deletedForEveryone && styles.bubbleDeleted,
                      ]}>
                      {isGroupChat && !mine && showMeta ? (
                        <Text style={styles.senderName}>{item.senderName}</Text>
                      ) : null}
                      {item.deletedForEveryone ? (
                        <Text style={styles.deletedText}>Message deleted</Text>
                      ) : (
                        <>
                          {item.replyTo ? (
                            <View style={[styles.replyQuote, mine && styles.replyQuoteMine]}>
                              <Text
                                style={[styles.replyQuoteSender, mine && styles.replyQuoteSenderMine]}
                                numberOfLines={1}>
                                {item.replyTo.senderName}
                              </Text>
                              <Text
                                style={[styles.replyQuoteText, mine && styles.replyQuoteTextMine]}
                                numberOfLines={1}>
                                {item.replyTo.content}
                              </Text>
                            </View>
                          ) : null}
                          {item.voiceUrl ? (
                            <VoiceBubble
                              uri={item.voiceUrl}
                              durationSec={item.voiceDurationSec ?? 0}
                              mine={mine}
                              colors={colors}
                            />
                          ) : (
                            <>
                              {item.imageUrl ? (
                                <ExpoImage
                                  source={{ uri: item.imageUrl }}
                                  style={styles.bubbleImage}
                                  contentFit="cover"
                                  cachePolicy="memory-disk"
                                />
                              ) : null}
                              <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
                                {item.content}
                              </Text>
                            </>
                          )}
                        </>
                      )}
                      <Text style={mine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs}>
                        {messageTimeLabel(item.createdAt)}
                      </Text>
                    </View>
                    {messageReactions.length > 0 ? (
                      <View style={[styles.reactionRow, mine ? styles.reactionRowMine : styles.reactionRowTheirs]}>
                        {messageReactions.map((r) => (
                          <Pressable
                            key={r.emoji}
                            style={[styles.reactionBadge, r.mine && styles.reactionBadgeMine]}
                            onPress={() => handleToggleReaction(item, r.emoji)}
                            hitSlop={4}>
                            <Text style={styles.reactionBadgeEmoji}>{r.emoji}</Text>
                            {r.count > 1 ? <Text style={styles.reactionBadgeCount}>{r.count}</Text> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  {mine ? avatar : null}
                </View>
              </SwipeableBubble>
            );
          }}
        />

        {replyDraft ? (
          <View style={styles.replyBar}>
            <View style={styles.replyBarTextWrap}>
              <Text style={styles.replyBarSender}>Replying to {replyDraft.senderName}</Text>
              <Text style={styles.replyBarContent} numberOfLines={1}>
                {replyDraft.voiceUrl ? '🎤 Voice note' : replyDraft.content}
              </Text>
            </View>
            <Pressable onPress={() => setReplyDraft(null)} hitSlop={8}>
              <Text style={styles.replyBarCancel}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {isRecording ? (
          <View style={styles.recordingBar}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>
              Recording… {Math.min(Math.round(recorderState.durationMillis / 1000), MAX_VOICE_NOTE_SECONDS)}s /{' '}
              {MAX_VOICE_NOTE_SECONDS}s
            </Text>
          </View>
        ) : draft.length > CHAR_WARNING_THRESHOLD ? (
          <Text
            style={[
              styles.charCounter,
              draft.length >= MAX_MESSAGE_LENGTH && styles.charCounterAtLimit,
            ]}>
            {draft.length} / {MAX_MESSAGE_LENGTH}
          </Text>
        ) : null}
        <View style={styles.inputBar}>
          <AnimatedPressable style={styles.attachButton} onPress={handlePickImage} disabled={sending}>
            <ImagePlus size={18} color={colors.textSecondary} strokeWidth={1.75} />
          </AnimatedPressable>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
          />
          {draft.trim() ? (
            <AnimatedPressable
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={sending}>
              {sending ? (
                <ActivityIndicator color={ON_ACCENT} size="small" />
              ) : (
                <Send size={17} color={ON_ACCENT} strokeWidth={2.25} />
              )}
            </AnimatedPressable>
          ) : (
            <AnimatedPressable
              style={[styles.sendButton, isRecording && styles.micButtonRecording]}
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              disabled={sending}
              haptic={false}>
              <Mic size={17} color={ON_ACCENT} strokeWidth={2.25} />
            </AnimatedPressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Reaction sheet — long-press on any message. Quick emoji row up top,
          a "+" to the full picker, then the same moderation/delete actions
          that used to live in a plain Alert. */}
      <Modal
        visible={reactionSheetFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionSheetFor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setReactionSheetFor(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.quickReactionRow}>
              {MESSAGE_QUICK_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={styles.quickReactionCell}
                  onPress={() => reactionSheetFor && handleToggleReaction(reactionSheetFor, emoji)}>
                  <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.quickReactionCell}
                onPress={() => {
                  setPickerMessage(reactionSheetFor);
                  setReactionSheetFor(null);
                }}>
                <Text style={styles.quickReactionMore}>+</Text>
              </Pressable>
            </View>

            <View style={styles.sheetDivider} />

            <AnimatedPressable
              style={styles.sheetAction}
              onPress={() => {
                if (!reactionSheetFor) return;
                setReplyDraft(reactionSheetFor);
                setReactionSheetFor(null);
              }}>
              <Text style={styles.sheetActionText}>Reply</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.sheetAction}
              onPress={() => reactionSheetFor && handleTogglePinFromSheet(reactionSheetFor)}>
              <Text style={styles.sheetActionText}>
                {info?.pinnedMessage?.id === reactionSheetFor?.id ? 'Unpin Message' : 'Pin Message'}
              </Text>
            </AnimatedPressable>

            {reactionSheetFor?.senderId === userId ? (
              <>
                <AnimatedPressable
                  style={styles.sheetAction}
                  onPress={() => reactionSheetFor && handleDeleteForEveryone(reactionSheetFor)}>
                  <Text style={styles.sheetActionDestructive}>Delete for Everyone</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.sheetAction}
                  onPress={() => reactionSheetFor && handleDeleteForMe(reactionSheetFor)}>
                  <Text style={styles.sheetActionDestructive}>Delete for Me</Text>
                </AnimatedPressable>
              </>
            ) : (
              <>
                <AnimatedPressable
                  style={styles.sheetAction}
                  onPress={() => reactionSheetFor && reportMessage(reactionSheetFor)}>
                  <Text style={styles.sheetActionText}>Report Message</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.sheetAction}
                  onPress={() =>
                    reactionSheetFor && blockSender(reactionSheetFor.senderId, reactionSheetFor.senderName)
                  }>
                  <Text style={styles.sheetActionDestructive}>Block {reactionSheetFor?.senderName}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.sheetAction}
                  onPress={() => reactionSheetFor && handleDeleteForMe(reactionSheetFor)}>
                  <Text style={styles.sheetActionDestructive}>Delete for Me</Text>
                </AnimatedPressable>
              </>
            )}
            <AnimatedPressable style={styles.sheetAction} onPress={() => setReactionSheetFor(null)}>
              <Text style={styles.sheetActionText}>Cancel</Text>
            </AnimatedPressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Full emoji picker — same bank Feed's ReactionBar uses. */}
      <Modal
        visible={pickerMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerMessage(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPickerMessage(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>React with an emoji</Text>
            <View style={styles.emojiGrid}>
              {EMOJI_BANK.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={styles.emojiCell}
                  onPress={() => pickerMessage && handleToggleReaction(pickerMessage, emoji)}>
                  <Text style={styles.emojiCellText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Group members list — from the group header's "View Members". */}
      <Modal
        visible={membersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMembersOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMembersOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Members ({members.length})</Text>
            {members.map((m) => (
              <View key={m.userId} style={styles.memberRow}>
                {m.avatarUrl ? (
                  <ExpoImage source={{ uri: m.avatarUrl }} style={styles.memberAvatar} cachePolicy="memory-disk" />
                ) : (
                  <InitialsAvatar name={m.name} size={32} />
                )}
                <Text style={styles.memberName} numberOfLines={1}>
                  {m.name}
                  {m.userId === userId ? ' (you)' : ''}
                </Text>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename chat — group header's "Rename Chat". Alert.prompt is iOS-only,
          so this is a small custom text-input modal instead. */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setRenameOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Rename chat</Text>
            <TextInput
              style={styles.renameInput}
              placeholder={info.title}
              placeholderTextColor={colors.textSecondary}
              value={renameText}
              onChangeText={setRenameText}
              maxLength={60}
              autoFocus
            />
            <AnimatedPressable style={styles.sheetAction} onPress={handleSaveRename}>
              <Text style={styles.sheetActionText}>Save</Text>
            </AnimatedPressable>
            <AnimatedPressable style={styles.sheetAction} onPress={() => setRenameOpen(false)}>
              <Text style={styles.sheetActionText}>Cancel</Text>
            </AnimatedPressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/** Wraps a bubble row so it can be swiped left to reveal a small detail panel
 * (exact send time, and — for the sender's own messages — who's seen it). */
function SwipeableBubble({
  children,
  mine,
  detailLabel,
  colors,
  onLongPress,
  onSwipeReply,
}: {
  children: ReactNode;
  mine: boolean;
  detailLabel: string;
  colors: ThemeColors;
  onLongPress: () => void;
  onSwipeReply: () => void;
}) {
  const translateX = useSharedValue(0);
  const replyTriggered = useSharedValue(false);

  // Left reveals the time/seen-by detail panel (clamped at -SWIPE_REVEAL);
  // right past REPLY_SWIPE_TRIGGER fires a reply and snaps back — a flick
  // gesture rather than a persistent reveal, mirroring WhatsApp/iMessage.
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      const next = Math.min(REPLY_SWIPE_TRIGGER, Math.max(-SWIPE_REVEAL, e.translationX));
      translateX.value = next;
      if (next >= REPLY_SWIPE_TRIGGER && !replyTriggered.value) {
        replyTriggered.value = true;
        runOnJS(onSwipeReply)();
      }
    })
    .onEnd(() => {
      const shouldReveal = translateX.value < -SWIPE_REVEAL / 2;
      translateX.value = withSpring(shouldReveal ? -SWIPE_REVEAL : 0, { damping: 20, stiffness: 220 });
      replyTriggered.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  // Hidden until the user actually swipes — opacity tracks how far revealed
  // the panel is, so it never sits there as a permanent overlay.
  const detailAnimatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, -translateX.value / SWIPE_REVEAL),
  }));

  return (
    <View style={detailStyles.wrap}>
      <Animated.View
        style={[detailStyles.detailPanel, { width: SWIPE_REVEAL }, detailAnimatedStyle]}
        pointerEvents="none">
        <Text
          numberOfLines={2}
          style={[detailStyles.detailText, { color: colors.textSecondary }]}>
          {detailLabel}
        </Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle}>
          <AnimatedPressable onLongPress={onLongPress} delayLongPress={350}>
            {children}
          </AnimatedPressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function formatVoiceDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Playback bubble for a voice note — tap to play/pause, shows a static
 * (decorative, not sampled-live) bar pattern plus elapsed/total time. */
function VoiceBubble({
  uri,
  durationSec,
  mine,
  colors,
}: {
  uri: string;
  durationSec: number;
  mine: boolean;
  colors: ThemeColors;
}) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const totalSec = status.duration || durationSec;
  const displaySec = status.playing ? status.currentTime : totalSec;

  return (
    <Pressable
      style={voiceStyles.row}
      onPress={() => (status.playing ? player.pause() : player.play())}>
      <View style={[voiceStyles.playButton, { backgroundColor: mine ? 'rgba(255,255,255,0.25)' : colors.borderSoft }]}>
        {status.playing ? (
          <Pause size={13} color={mine ? ON_ACCENT : colors.text} fill={mine ? ON_ACCENT : colors.text} />
        ) : (
          <Play size={13} color={mine ? ON_ACCENT : colors.text} fill={mine ? ON_ACCENT : colors.text} />
        )}
      </View>
      <View style={voiceStyles.bars}>
        {VOICE_BAR_HEIGHTS.map((h, i) => (
          <View
            key={i}
            style={[
              voiceStyles.bar,
              { height: h, backgroundColor: mine ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
            ]}
          />
        ))}
      </View>
      <Text style={[voiceStyles.time, { color: mine ? ON_ACCENT : colors.textSecondary }]}>
        {formatVoiceDuration(displaySec)}
      </Text>
    </Pressable>
  );
}

// Fixed decorative bar heights — a real waveform would need sampling the
// audio file up front, which isn't worth the extra work for a chat bubble.
const VOICE_BAR_HEIGHTS = [6, 12, 8, 16, 10, 14, 7, 12, 9];

const voiceStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  playButton: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 18 },
  bar: { width: 2, borderRadius: 1 },
  time: { fontSize: 11 },
});

const detailStyles = StyleSheet.create({
  wrap: { position: 'relative' },
  detailPanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
  },
  detailText: { fontSize: 10, textAlign: 'right' },
});

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
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
    headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    headerAvatar: { width: 24, height: 24, borderRadius: 12 },
    headerTitle: { flexShrink: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    pinnedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.borderSoft,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pinnedTextWrap: { flex: 1, gap: 1 },
    pinnedByText: { fontSize: 10, color: colors.textSecondary },
    pinnedContentText: { fontSize: 12, color: colors.text, fontWeight: WEIGHT.medium },
    pinnedUnpinText: { fontSize: 12, color: colors.coral, fontWeight: WEIGHT.semibold },
    messageList: { paddingHorizontal: 16, paddingVertical: 14, gap: 8, flexGrow: 1 },
    emptyThread: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: -1 }] },
    emptyThreadText: { fontSize: 13, color: colors.textSecondary },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubbleRowTheirs: { justifyContent: 'flex-start' },
    bubbleRowWithReactions: { marginBottom: 8 },
    messageAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.borderSoft },
    avatarSpacer: { width: 26 },
    bubbleWrap: { position: 'relative', maxWidth: '78%' },
    bubble: { borderRadius: RADII.lg, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
    reactionRow: {
      position: 'absolute',
      bottom: -12,
      flexDirection: 'row',
      gap: 4,
    },
    reactionRowMine: { right: 8 },
    reactionRowTheirs: { left: 8 },
    reactionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    reactionBadgeMine: { borderColor: colors.coral },
    reactionBadgeEmoji: { fontSize: 12 },
    reactionBadgeCount: { fontSize: 10, color: colors.textSecondary, fontWeight: WEIGHT.medium },
    bubbleImage: { width: 200, height: 200, borderRadius: RADII.md, backgroundColor: colors.borderSoft },
    bubbleMine: { backgroundColor: colors.coral },
    bubbleTheirs: { borderWidth: 1, borderColor: colors.border },
    bubbleDeleted: { opacity: 0.6 },
    deletedText: { fontSize: 13, fontStyle: 'italic', color: colors.textSecondary },
    senderName: { fontSize: 11, fontWeight: WEIGHT.bold, color: colors.coral },
    bubbleTextMine: { fontSize: 14, color: ON_ACCENT, lineHeight: 19 },
    bubbleTextTheirs: { fontSize: 14, color: colors.text, lineHeight: 19 },
    bubbleTimeMine: { fontSize: 10, color: ON_ACCENT, opacity: 0.75, alignSelf: 'flex-end' },
    bubbleTimeTheirs: { fontSize: 10, color: colors.textSecondary, alignSelf: 'flex-end' },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      paddingHorizontal: 14,
      paddingVertical: 9,
      fontSize: 14,
      color: colors.text,
      maxHeight: 110,
    },
    sendButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: { opacity: 0.5 },
    attachButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    charCounter: {
      fontSize: 10,
      color: colors.textSecondary,
      textAlign: 'right',
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    charCounterAtLimit: { color: colors.coral, fontWeight: WEIGHT.semibold },
    micButtonRecording: { backgroundColor: colors.text },

    replyQuote: {
      borderLeftWidth: 2,
      borderLeftColor: colors.textSecondary,
      paddingLeft: 8,
      marginBottom: 2,
    },
    replyQuoteMine: { borderLeftColor: 'rgba(255,255,255,0.6)' },
    replyQuoteSender: { fontSize: 10, fontWeight: WEIGHT.bold, color: colors.textSecondary },
    replyQuoteSenderMine: { color: 'rgba(255,255,255,0.85)' },
    replyQuoteText: { fontSize: 11, color: colors.textSecondary },
    replyQuoteTextMine: { color: 'rgba(255,255,255,0.75)' },

    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.borderSoft,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    replyBarTextWrap: { flex: 1, gap: 1 },
    replyBarSender: { fontSize: 11, fontWeight: WEIGHT.bold, color: colors.coral },
    replyBarContent: { fontSize: 12, color: colors.textSecondary },
    replyBarCancel: { fontSize: 15, color: colors.textSecondary, paddingHorizontal: 4 },

    recordingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 6,
    },
    recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral },
    recordingText: { fontSize: 12, color: colors.textSecondary, fontWeight: WEIGHT.medium },

    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: RADII.lg,
      borderTopRightRadius: RADII.lg,
      padding: 20,
      paddingBottom: 36,
      gap: 4,
    },
    sheetTitle: { fontSize: 14, fontWeight: WEIGHT.bold, color: colors.text, textAlign: 'center', marginBottom: 12 },
    sheetDivider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    sheetAction: { paddingVertical: 12, alignItems: 'center' },
    sheetActionText: { fontSize: 15, fontWeight: WEIGHT.medium, color: colors.text },
    sheetActionDestructive: { fontSize: 15, fontWeight: WEIGHT.medium, color: colors.coral },

    quickReactionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
    quickReactionCell: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickReactionEmoji: { fontSize: 26 },
    quickReactionMore: { fontSize: 22, fontWeight: WEIGHT.semibold, color: colors.textSecondary },

    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
    emojiCell: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.md },
    emojiCellText: { fontSize: 26 },

    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    memberAvatar: { width: 32, height: 32, borderRadius: 16 },
    memberName: { fontSize: 14, fontWeight: WEIGHT.medium, color: colors.text, flex: 1 },

    renameInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      marginBottom: 12,
    },
  });
}
