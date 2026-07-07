import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MoreHorizontal, Send } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import {
  fetchConversationInfo,
  fetchMessages,
  markConversationRead,
  messageTimeLabel,
  sendMessage,
  type ChatMessage,
  type ConversationInfo,
} from '@/lib/banter';
import { blockUser, fetchBlockedUserIds, reportContent, type ReportReason } from '@/lib/moderation';

const POLL_MS = 4000;

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

  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const infoLoaded = useRef(false);

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
        infoLoaded.current = true;
      }
      setMessages(await fetchMessages(id));
      markConversationRead(id, userId).catch(() => {});
    } catch (e) {
      Alert.alert('Could not load messages', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

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
      await sendMessage(id, userId, content);
      setDraft('');
      await load();
    } catch (e) {
      Alert.alert('Could not send message', e instanceof Error ? e.message : 'Unknown error.');
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
              Alert.alert('Could not send report', e instanceof Error ? e.message : 'Unknown error.');
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
              Alert.alert('Could not block user', e instanceof Error ? e.message : 'Unknown error.');
            }
          },
        },
      ]
    );
  };

  const handleLongPressMessage = (message: ChatMessage) => {
    if (message.senderId === userId) return;
    Alert.alert(message.senderName, message.content, [
      { text: 'Report Message', onPress: () => reportMessage(message) },
      {
        text: `Block ${message.senderName}`,
        style: 'destructive',
        onPress: () => blockSender(message.senderId, message.senderName),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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
                  Alert.alert('Could not send report', e instanceof Error ? e.message : 'Unknown error.');
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

  const visibleMessages = useMemo(
    () => messages.filter((m) => !blockedIds.has(m.senderId)),
    [messages, blockedIds]
  );
  const invertedMessages = useMemo(() => visibleMessages.slice().reverse(), [visibleMessages]);

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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {info.title}
        </Text>
        {info.type === 'dm' ? (
          <AnimatedPressable onPress={handleHeaderMenu} hitSlop={8}>
            <MoreHorizontal size={22} color={colors.text} strokeWidth={2} />
          </AnimatedPressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

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
            return (
              <AnimatedPressable
                style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}
                onLongPress={() => handleLongPressMessage(item)}
                delayLongPress={350}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {isGroupChat && !mine ? <Text style={styles.senderName}>{item.senderName}</Text> : null}
                  <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.content}</Text>
                  <Text style={mine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs}>
                    {messageTimeLabel(item.createdAt)}
                  </Text>
                </View>
              </AnimatedPressable>
            );
          }}
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={4000}
          />
          <AnimatedPressable
            style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}>
            {sending ? (
              <ActivityIndicator color={ON_ACCENT} size="small" />
            ) : (
              <Send size={17} color={ON_ACCENT} strokeWidth={2.25} />
            )}
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
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
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    messageList: { paddingHorizontal: 16, paddingVertical: 14, gap: 8, flexGrow: 1 },
    emptyThread: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: -1 }] },
    emptyThreadText: { fontSize: 13, color: colors.textSecondary },
    bubbleRow: { flexDirection: 'row' },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubbleRowTheirs: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '78%', borderRadius: RADII.lg, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
    bubbleMine: { backgroundColor: colors.coral },
    bubbleTheirs: { borderWidth: 1, borderColor: colors.border },
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
  });
}
