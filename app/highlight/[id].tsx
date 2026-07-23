import { useEvent } from 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Archive, ChevronLeft, Flame, MessageCircleReply, Mic, MoreHorizontal, Send, Sparkles, Target, X, Zap } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { ContentMenu, DEFAULT_REPORT_REASONS } from '@/components/moderation/content-menu';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { GOLD, ON_ACCENT, RADII, SPACING, TYPE, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  addHighlightComment,
  archiveHighlightClip,
  fetchHighlightClip,
  fetchHighlightComments,
  fetchHighlightMessages,
  fetchHighlightNotes,
  fetchHighlightReactions,
  retryHighlightAnalysis,
  sendHighlightMessage,
  setHighlightVisibility,
  shareHighlightToFeed,
  toggleHighlightReaction,
  type HighlightClip,
  type HighlightComment,
  type HighlightMessage,
  type HighlightMode,
  type HighlightNote,
  type HighlightReaction,
  type HighlightVisibility,
} from '@/lib/highlights';
import { blockUser, reportContent, type ReportReason } from '@/lib/moderation';
import { fetchProfile } from '@/lib/profile';

const STUCK_PENDING_MS = 25000;
// How far right an AI bubble needs to be dragged before it counts as
// "reply to this" and quotes it into the composer — mirrors the swipe-reply
// gesture already used in Banter's chat/[id].tsx for a consistent feel.
const SWIPE_REPLY_TRIGGER = 56;

const MODE_LABEL: Record<HighlightMode, string> = {
  roast: 'Roast',
  hype: 'Hype man',
  commentator: 'Commentator',
  critique: 'Critique',
};

const MODE_ICON: Record<HighlightMode, typeof Flame> = {
  roast: Flame,
  hype: Zap,
  commentator: Mic,
  critique: Target,
};

const MODE_COLOR_KEY: Record<HighlightMode, 'coral' | 'blue' | 'gold'> = {
  roast: 'coral',
  hype: 'gold',
  commentator: 'blue',
  critique: 'blue',
};

const ROAST_REACTIONS = ['🔥', '😂', '💀', '👏'];

// A few varied framing lines per persona so the default share caption reads
// like a fun intro to the verdict instead of the raw quote sitting there
// plain — still fully editable before posting. One is picked at random each
// time the review sheet opens.
const CAPTION_FRAMES: Record<HighlightMode, string[]> = {
  roast: ['AI roasted me and I have no comeback:', 'The AI did not hold back:', 'Sent this in for a roast, regret it:'],
  hype: ['AI hyped me up and honestly I believe it now:', 'The AI is my new biggest fan:', "AI said I'm him:"],
  commentator: ['AI called the play like it mattered:', 'The AI commentary I did not ask for but needed:', 'Live from the AI booth:'],
  critique: ['AI broke down my game:', 'Got a real coaching note from the AI:', 'The AI film review came in:'],
};

function randomCaptionFrame(mode: HighlightMode): string {
  const frames = CAPTION_FRAMES[mode];
  return frames[Math.floor(Math.random() * frames.length)];
}

export default function HighlightDetailScreen() {
  const { id, readonly } = useLocalSearchParams<{ id: string; readonly?: string }>();
  // Set when this screen was opened from a Feed card (a shared highlight
  // post) rather than from Profile. In this mode the private AI chat is
  // never shown or fetched at all — not even to the owner — and reactions
  // happen through Feed's own scoreboard ReactionBar on the post instead of
  // this screen's separate roast-reactions row, so there's only one
  // reaction surface per shared clip, not two.
  const isReadonly = readonly === '1';
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [clip, setClip] = useState<HighlightClip | null>(null);
  const [notes, setNotes] = useState<HighlightNote[]>([]);
  const [messages, setMessages] = useState<HighlightMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  // Text being quoted into the next reply — either a note's text (tap the
  // reply icon) or an AI chat bubble's text (swipe it right). Unified since
  // both just need the quoted string, not the full note/message object.
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [stuckPending, setStuckPending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [reactions, setReactions] = useState<HighlightReaction[]>([]);
  const [comments, setComments] = useState<HighlightComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authorName, setAuthorName] = useState('this user');
  // Which comment's "..." menu is open, and the display name to show in its
  // "Block {name}" option — resolved lazily on long-press since comments
  // don't carry a joined profile name, mirroring authorName's lazy fetch above.
  const [commentMenu, setCommentMenu] = useState<HighlightComment | null>(null);
  const [commentMenuAuthorName, setCommentMenuAuthorName] = useState('this user');

  const player = useVideoPlayer(clip?.videoUrl ?? null);
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // Trimmed clips upload the raw, untouched file — the 15s window the user
  // picked in trim-highlight.tsx only exists as trimStartSeconds. Playback
  // has to reproduce that trim itself: jump straight to the window's start
  // once the player loads, and loop back to the start (rather than playing
  // into the rest of the raw file) once playback crosses the 15s mark. AI
  // note/best-moment timestamps are relative to this same window (the edge
  // function trims before analyzing), so seeking there is trim start + N,
  // not just N.
  useEffect(() => {
    if (clip?.trimStartSeconds == null) return;
    if (status !== 'readyToPlay') return;
    player.currentTime = clip.trimStartSeconds;
  }, [status, clip?.trimStartSeconds, player]);

  useEffect(() => {
    if (clip?.trimStartSeconds == null) return;
    const trimStart = clip.trimStartSeconds;
    const trimEnd = trimStart + 15;
    const sub = player.addListener('timeUpdate', (payload) => {
      if (payload.currentTime >= trimEnd) {
        player.currentTime = trimStart;
      }
    });
    return () => sub.remove();
  }, [clip?.trimStartSeconds, player]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const fetchedClip = await fetchHighlightClip(id);
      setClip(fetchedClip);
      if (fetchedClip?.status === 'ready') {
        const fetchedNotes = await fetchHighlightNotes(id);
        setNotes(fetchedNotes);

        // Readonly (opened from a Feed card): never touch the private chat
        // or the roast-reactions row at all — not even for the owner. Feed's
        // own ReactionBar is the only reaction surface for a shared post.
        if (!isReadonly) {
          const fetchedMessages = await fetchHighlightMessages(id);
          setMessages(fetchedMessages);
          // Group roast layer only applies once the clip isn't private —
          // RLS would reject these reads anyway, but skipping them for a
          // private clip avoids a pointless round trip.
          if (fetchedClip.visibility !== 'private') {
            const [fetchedReactions, fetchedComments] = await Promise.all([
              fetchHighlightReactions(id),
              fetchHighlightComments(id),
            ]);
            setReactions(fetchedReactions);
            setComments(fetchedComments);
          } else {
            setReactions([]);
            setComments([]);
          }
        }
      }
    } catch (e) {
      Alert.alert('Could not load highlight', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, isReadonly]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Only needed for the report/block menu's "Block {authorName}" label, so
  // only fetch once we know this isn't the viewer's own clip.
  useEffect(() => {
    if (!clip || !userId || clip.userId === userId) return;
    fetchProfile(clip.userId)
      .then((p) => setAuthorName(p.name || 'this user'))
      .catch(() => {});
  }, [clip, userId]);

  // If it's still pending after a while, stop pretending it's about to
  // finish any second and offer a manual retry instead of an infinite
  // spinner — this is exactly the "stuck forever" failure mode this screen
  // hit before the base64-encoding fix.
  useEffect(() => {
    if (clip?.status === 'pending' && !stuckTimerRef.current) {
      stuckTimerRef.current = setTimeout(() => setStuckPending(true), STUCK_PENDING_MS);
    } else if (clip?.status !== 'pending') {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
      setStuckPending(false);
    }
    return () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    };
  }, [clip?.status]);

  const handleRetry = async () => {
    if (!id) return;
    setRetrying(true);
    setStuckPending(false);
    try {
      const { error } = await retryHighlightAnalysis(id);
      if (error) throw error;
      setClip((prev) => (prev ? { ...prev, status: 'pending', errorMessage: null } : prev));
    } catch (e) {
      Alert.alert('Could not retry', errorMessage(e));
    } finally {
      setRetrying(false);
    }
  };

  // Poll while the analysis is still running — stops itself once ready/failed.
  useEffect(() => {
    if (clip?.status === 'pending' && !pollRef.current) {
      pollRef.current = setInterval(load, 3000);
    } else if (clip?.status !== 'pending' && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [clip?.status, load]);

  // AI note/best-moment timestamps are relative to the trimmed 15s window
  // (that's what Gemini/Groq actually saw), not the raw uploaded file — so
  // seeking has to add trimStartSeconds back on top for a trimmed clip.
  const handleSeek = (seconds: number) => {
    const offset = clip?.trimStartSeconds ?? 0;
    player.currentTime = offset + seconds;
    player.play();
  };

  const handleSend = async () => {
    const trimmed = messageText.trim();
    if (!trimmed || !id) return;
    const quoted = quotedText ?? undefined;
    const displayBody = quoted ? `↳ "${quoted}"\n${trimmed}` : trimmed;
    setSending(true);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, sender: 'user', body: displayBody, createdAt: new Date().toISOString() }]);
    setMessageText('');
    setQuotedText(null);
    try {
      const reply = await sendHighlightMessage(id, trimmed, quoted);
      setMessages((prev) => [...prev, { id: `local-ai-${Date.now()}`, sender: 'ai', body: reply, createdAt: new Date().toISOString() }]);
    } catch (e) {
      Alert.alert('Could not send message', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const handleVisibility = async (visibility: Exclude<HighlightVisibility, 'feed'>) => {
    if (!clip || !userId) return;
    setVisibilityBusy(true);
    try {
      await setHighlightVisibility(clip, visibility, userId);
      setClip({ ...clip, visibility });
      if (visibility === 'profile') Alert.alert('Posted', 'Friends can now react and comment on it.');
      if (visibility !== 'private' && id) {
        const [fetchedReactions, fetchedComments] = await Promise.all([
          fetchHighlightReactions(id),
          fetchHighlightComments(id),
        ]);
        setReactions(fetchedReactions);
        setComments(fetchedComments);
      }
    } catch (e) {
      Alert.alert('Could not update', errorMessage(e));
    } finally {
      setVisibilityBusy(false);
    }
  };

  // "Share to feed" opens a review sheet instead of posting instantly — the
  // caption starts as the AI verdict but the user can rewrite it entirely
  // before anything actually goes out.
  const [shareReviewOpen, setShareReviewOpen] = useState(false);
  const [shareCaption, setShareCaption] = useState('');
  const [sharePosting, setSharePosting] = useState(false);

  const openShareReview = () => {
    if (!clip) return;
    const verdict = clip.verdictText ?? clip.overallText ?? '';
    setShareCaption(verdict ? `${randomCaptionFrame(clip.mode)} "${verdict}"` : '');
    setShareReviewOpen(true);
  };

  const handleConfirmShare = async () => {
    if (!clip || !userId) return;
    setSharePosting(true);
    try {
      await shareHighlightToFeed(clip, userId, shareCaption);
      setClip({ ...clip, visibility: 'feed' });
      setShareReviewOpen(false);
      Alert.alert('Posted', 'Your highlight is live on Feed.');
      if (id) {
        const [fetchedReactions, fetchedComments] = await Promise.all([
          fetchHighlightReactions(id),
          fetchHighlightComments(id),
        ]);
        setReactions(fetchedReactions);
        setComments(fetchedComments);
      }
    } catch (e) {
      Alert.alert('Could not post', errorMessage(e));
    } finally {
      setSharePosting(false);
    }
  };

  const handleToggleReaction = async (emoji: string) => {
    if (!id || !userId) return;
    const mine = reactions.some((r) => r.userId === userId && r.emoji === emoji);
    setReactions((prev) =>
      mine
        ? prev.filter((r) => !(r.userId === userId && r.emoji === emoji))
        : [...prev, { id: `local-${Date.now()}`, userId, emoji }]
    );
    try {
      await toggleHighlightReaction(id, userId, emoji, !mine);
    } catch (e) {
      Alert.alert('Could not react', errorMessage(e));
      load();
    }
  };

  const handleSendComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !id || !userId) return;
    setCommentSending(true);
    try {
      await addHighlightComment(id, userId, trimmed);
      setCommentText('');
      setComments((prev) => [...prev, { id: `local-${Date.now()}`, userId, body: trimmed, createdAt: new Date().toISOString() }]);
    } catch (e) {
      Alert.alert('Could not comment', errorMessage(e));
    } finally {
      setCommentSending(false);
    }
  };

  const handleArchive = () => {
    if (!id) return;
    Alert.alert('Archive this clip?', 'Moves it to your Archive — you can find it there later, or delete it for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveHighlightClip(id);
            router.back();
          } catch (e) {
            Alert.alert('Could not archive', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handleReport = async (reason: ReportReason) => {
    if (!clip || !userId) return;
    try {
      await reportContent(userId, 'highlight', clip.id, reason);
      Alert.alert('Reported', "Thanks — we'll take a look.");
    } catch (e) {
      Alert.alert('Could not report', errorMessage(e));
    }
  };

  const handleBlock = () => {
    if (!clip || !userId) return;
    Alert.alert(`Block ${authorName}?`, "You won't see each other's content anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId, clip.userId);
            router.back();
          } catch (e) {
            Alert.alert('Could not block', errorMessage(e));
          }
        },
      },
    ]);
  };

  // AI chat replies aren't authored by another user (no one to block), so
  // this skips the ContentMenu bottom-sheet entirely and just asks the
  // report reason directly — same reasons Feed/comments use.
  const handleReportMessage = (message: HighlightMessage) => {
    if (!userId) return;
    Alert.alert(
      'Report this AI reply?',
      'What\'s wrong with it?',
      [
        ...DEFAULT_REPORT_REASONS.map((r) => ({
          text: r.label,
          onPress: async () => {
            try {
              await reportContent(userId, 'highlight_message', message.id, r.value);
              Alert.alert('Reported', "Thanks — we'll take a look.");
            } catch (e) {
              Alert.alert('Could not report', errorMessage(e));
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openCommentMenu = (comment: HighlightComment) => {
    setCommentMenu(comment);
    setCommentMenuAuthorName('this user');
    fetchProfile(comment.userId)
      .then((p) => setCommentMenuAuthorName(p.name || 'this user'))
      .catch(() => {});
  };

  const handleReportComment = async (reason: ReportReason) => {
    if (!commentMenu || !userId) return;
    try {
      await reportContent(userId, 'highlight_comment', commentMenu.id, reason);
      Alert.alert('Reported', "Thanks — we'll take a look.");
    } catch (e) {
      Alert.alert('Could not report', errorMessage(e));
    }
  };

  const handleBlockCommenter = () => {
    if (!commentMenu || !userId) return;
    const targetId = commentMenu.userId;
    Alert.alert(`Block ${commentMenuAuthorName}?`, "You won't see each other's content anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId, targetId);
            setComments((prev) => prev.filter((c) => c.userId !== targetId));
          } catch (e) {
            Alert.alert('Could not block', errorMessage(e));
          }
        },
      },
    ]);
  };

  if (loading || !clip) {
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
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>{MODE_LABEL[clip.mode]}</Text>
        {clip.userId === userId ? (
          <AnimatedPressable onPress={handleArchive} hitSlop={8}>
            <Archive size={19} color={colors.textSecondary} strokeWidth={2} />
          </AnimatedPressable>
        ) : (
          <AnimatedPressable onPress={() => setMenuOpen(true)} hitSlop={8}>
            <MoreHorizontal size={19} color={colors.textSecondary} strokeWidth={2} />
          </AnimatedPressable>
        )}
      </View>

      <ContentMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        canDelete={false}
        showReportAndBlock
        authorName={authorName}
        onDelete={() => {}}
        onReport={handleReport}
        onBlock={handleBlock}
      />

      <ContentMenu
        visible={commentMenu !== null}
        onClose={() => setCommentMenu(null)}
        canDelete={false}
        showReportAndBlock={commentMenu?.userId !== userId}
        authorName={commentMenuAuthorName}
        onDelete={() => {}}
        onReport={handleReportComment}
        onBlock={handleBlockCommenter}
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.videoWrap}>
          <VideoView player={player} style={styles.video} contentFit="cover" nativeControls />
          {status === 'loading' ? (
            <View style={styles.videoLoading} pointerEvents="none">
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : null}
        </View>

        {clip.status === 'pending' ? (
          <View style={styles.pendingRow}>
            {!stuckPending ? (
              <>
                <ActivityIndicator color={colors.textSecondary} size="small" />
                <Text style={styles.pendingText}>Analyzing your clip...</Text>
              </>
            ) : (
              <View style={styles.stuckWrap}>
                <Text style={styles.failedText}>Taking longer than usual.</Text>
                <AnimatedPressable style={styles.retryButton} onPress={handleRetry} disabled={retrying}>
                  {retrying ? (
                    <ActivityIndicator color={ON_ACCENT} size="small" />
                  ) : (
                    <Text style={styles.retryButtonText}>Retry</Text>
                  )}
                </AnimatedPressable>
              </View>
            )}
          </View>
        ) : clip.status === 'failed' ? (
          <View style={styles.stuckWrap}>
            <Text style={styles.failedText}>{clip.errorMessage ?? 'Could not analyze this clip.'}</Text>
            <AnimatedPressable style={styles.retryButton} onPress={handleRetry} disabled={retrying}>
              {retrying ? (
                <ActivityIndicator color={ON_ACCENT} size="small" />
              ) : (
                <Text style={styles.retryButtonText}>Retry</Text>
              )}
            </AnimatedPressable>
          </View>
        ) : (
          <>
            {clip.verdictText ? (
              <View style={[styles.verdictCard, { backgroundColor: modeTint(clip.mode, colors) }]}>
                {clip.verdictScore !== null ? (
                  <Text style={[styles.verdictScore, { color: modeColor(MODE_COLOR_KEY[clip.mode], colors) }]}>
                    {clip.verdictScore}/10
                  </Text>
                ) : null}
                <Text style={styles.verdictText}>{clip.verdictText}</Text>
              </View>
            ) : null}

            <Text style={styles.overall}>{clip.overallText}</Text>

            {clip.bestMomentSeconds !== null ? (
              <AnimatedPressable style={styles.bestMomentChip} onPress={() => handleSeek(clip.bestMomentSeconds as number)}>
                <Sparkles size={13} color={colors.textSecondary} strokeWidth={2} />
                <Text style={styles.bestMomentText}>Jump to the best moment ({formatSeconds(clip.bestMomentSeconds)})</Text>
              </AnimatedPressable>
            ) : null}

            <View style={styles.notesWrap}>
              {notes.map((note) => (
                <View key={note.id} style={styles.noteRow}>
                  <AnimatedPressable style={styles.noteMain} onPress={() => handleSeek(note.timestampSeconds)}>
                    <Text style={styles.noteTime}>{formatSeconds(note.timestampSeconds)}</Text>
                    <Text style={styles.noteText}>{note.noteText}</Text>
                  </AnimatedPressable>
                  {!isReadonly ? (
                    <AnimatedPressable hitSlop={8} onPress={() => setQuotedText(note.noteText)}>
                      <MessageCircleReply size={16} color={colors.textSecondary} strokeWidth={2} />
                    </AnimatedPressable>
                  ) : null}
                </View>
              ))}
            </View>

            {!isReadonly ? (
              <>
                <View style={styles.visibilityBadgeRow}>
                  {clip.visibility === 'private' ? (
                    <View style={styles.visibilityBadgePrivate}>
                      <Text style={styles.visibilityBadgeTextPrivate}>🔒 Private</Text>
                    </View>
                  ) : (
                    <View style={styles.visibilityBadgePosted}>
                      <Text style={styles.visibilityBadgeTextPosted}>
                        ● Posted{clip.visibility === 'feed' ? ' to Feed' : ' to Profile'}
                      </Text>
                    </View>
                  )}
                </View>

                {clip.visibility === 'private' ? (
                  <>
                    <Text style={styles.chatLabel}>Private chat — only you see this, full history. Swipe an AI reply right to respond to it, long-press to report it.</Text>
                    <View style={styles.chatWrap}>
                      {messages.map((m) =>
                        m.sender === 'ai' ? (
                          <SwipeableAiBubble key={m.id} onSwipeReply={() => setQuotedText(m.body)}>
                            <AnimatedPressable
                              style={styles.bubbleAiRow}
                              onLongPress={() => handleReportMessage(m)}
                              delayLongPress={350}>
                              <View style={[styles.aiAvatar, { backgroundColor: modeTint(clip.mode, colors) }]}>
                                {(() => {
                                  const ModeIcon = MODE_ICON[clip.mode];
                                  return <ModeIcon size={12} color={modeColor(MODE_COLOR_KEY[clip.mode], colors)} strokeWidth={2} />;
                                })()}
                              </View>
                              <View style={[styles.bubble, styles.bubbleAi, { backgroundColor: modeTint(clip.mode, colors) }]}>
                                <Text style={styles.bubbleText}>{m.body}</Text>
                              </View>
                            </AnimatedPressable>
                          </SwipeableAiBubble>
                        ) : (
                          <View key={m.id} style={[styles.bubble, styles.bubbleUser]}>
                            <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{m.body}</Text>
                          </View>
                        )
                      )}
                    </View>
                    {quotedText ? (
                      <View style={styles.quoteChip}>
                        <Text style={styles.quoteChipText} numberOfLines={1}>
                          Replying to: {quotedText}
                        </Text>
                        <AnimatedPressable hitSlop={8} onPress={() => setQuotedText(null)}>
                          <X size={14} color={colors.textSecondary} strokeWidth={2} />
                        </AnimatedPressable>
                      </View>
                    ) : null}
                    <View style={styles.composer}>
                      <TextInput
                        style={styles.composerInput}
                        placeholder={quotedText ? 'Reply to this...' : 'Ask a follow-up...'}
                        placeholderTextColor={colors.textSecondary}
                        value={messageText}
                        onChangeText={setMessageText}
                        maxLength={500}
                      />
                      <AnimatedPressable style={styles.sendButton} onPress={handleSend} disabled={sending || !messageText.trim()}>
                        {sending ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Send size={16} color={ON_ACCENT} />}
                      </AnimatedPressable>
                    </View>
                  </>
                ) : (
                  <Text style={styles.chatLabel}>
                    This clip is posted — the AI chat stays private and isn't shown here anymore, just the reviews above.
                  </Text>
                )}

                <View style={styles.shareRow}>
                  <AnimatedPressable
                    style={[styles.shareButton, clip.visibility === 'private' && styles.shareButtonActive]}
                    onPress={() => handleVisibility('private')}
                    disabled={visibilityBusy}>
                    <Text style={[styles.shareButtonText, clip.visibility === 'private' && styles.shareButtonTextActive]}>
                      Keep private
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[styles.shareButton, clip.visibility === 'profile' && styles.shareButtonActivePosted]}
                    onPress={() => handleVisibility('profile')}
                    disabled={visibilityBusy}>
                    <Text style={[styles.shareButtonText, clip.visibility === 'profile' && styles.shareButtonTextActive]}>
                      Post to profile
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[styles.shareButton, clip.visibility === 'feed' && styles.shareButtonActivePosted]}
                    onPress={openShareReview}
                    disabled={visibilityBusy}>
                    <Text style={[styles.shareButtonText, clip.visibility === 'feed' && styles.shareButtonTextActive]}>
                      Share to feed
                    </Text>
                  </AnimatedPressable>
                </View>
              </>
            ) : null}

            {clip.visibility !== 'private' && !isReadonly ? (
              <View style={styles.roastWrap}>
                <Text style={styles.chatLabel}>Friends can react and roast this too</Text>
                <View style={styles.roastReactionRow}>
                  {ROAST_REACTIONS.map((emoji) => {
                    const count = reactions.filter((r) => r.emoji === emoji).length;
                    const mine = userId ? reactions.some((r) => r.userId === userId && r.emoji === emoji) : false;
                    return (
                      <AnimatedPressable
                        key={emoji}
                        style={[styles.roastReactionPill, mine && styles.roastReactionPillActive]}
                        onPress={() => handleToggleReaction(emoji)}>
                        <Text style={styles.roastReactionEmoji}>{emoji}</Text>
                        {count > 0 ? <Text style={styles.roastReactionCount}>{count}</Text> : null}
                      </AnimatedPressable>
                    );
                  })}
                </View>

                {comments.length > 0 ? (
                  <View style={styles.roastCommentsWrap}>
                    {comments.map((c) => (
                      <AnimatedPressable
                        key={c.id}
                        style={styles.roastCommentBubble}
                        onLongPress={() => openCommentMenu(c)}
                        delayLongPress={300}>
                        <Text style={styles.bubbleText}>{c.body}</Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                ) : null}

                <View style={styles.composer}>
                  <TextInput
                    style={styles.composerInput}
                    placeholder="Add a comment..."
                    placeholderTextColor={colors.textSecondary}
                    value={commentText}
                    onChangeText={setCommentText}
                    maxLength={500}
                  />
                  <AnimatedPressable
                    style={styles.sendButton}
                    onPress={handleSendComment}
                    disabled={commentSending || !commentText.trim()}>
                    {commentSending ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Send size={16} color={ON_ACCENT} />}
                  </AnimatedPressable>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={shareReviewOpen} animationType="slide" transparent onRequestClose={() => setShareReviewOpen(false)}>
        <View style={styles.reviewBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.reviewSheet}>
              <View style={styles.reviewHeaderRow}>
                <Text style={styles.reviewTitle}>Review before posting</Text>
                <AnimatedPressable hitSlop={8} onPress={() => setShareReviewOpen(false)}>
                  <X size={18} color={colors.textSecondary} strokeWidth={2} />
                </AnimatedPressable>
              </View>

              {clip.status === 'ready' ? (
                <View style={[styles.reviewCard, { borderColor: modeColor(MODE_COLOR_KEY[clip.mode], colors) }]}>
                  <View style={styles.reviewCardHeader}>
                    <View style={[styles.reviewBadge, { backgroundColor: modeTint(clip.mode, colors) }]}>
                      <Text style={[styles.reviewBadgeText, { color: modeColor(MODE_COLOR_KEY[clip.mode], colors) }]}>
                        AI {MODE_LABEL[clip.mode].toUpperCase()}
                      </Text>
                    </View>
                    {clip.verdictScore !== null ? (
                      <View style={[styles.reviewScoreRing, { borderColor: modeColor(MODE_COLOR_KEY[clip.mode], colors) }]}>
                        <Text style={[styles.reviewScoreText, { color: modeColor(MODE_COLOR_KEY[clip.mode], colors) }]}>
                          {clip.verdictScore}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <TextInput
                    style={styles.reviewCaptionInput}
                    value={shareCaption}
                    onChangeText={setShareCaption}
                    placeholder="Write a caption..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    maxLength={200}
                  />
                </View>
              ) : null}

              <Text style={styles.reviewHint}>This is exactly what your friends will see on Feed — edit it however you want.</Text>

              <AnimatedPressable style={styles.reviewPostButton} onPress={handleConfirmShare} disabled={sharePosting}>
                {sharePosting ? (
                  <ActivityIndicator color={ON_ACCENT} size="small" />
                ) : (
                  <Text style={styles.reviewPostButtonText}>Post to Feed</Text>
                )}
              </AnimatedPressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Wraps an AI chat bubble so swiping it right past SWIPE_REPLY_TRIGGER quotes
 * it into the composer and springs back — same flick-to-reply gesture as
 * Banter's chat/[id].tsx, just without that screen's extra left-side detail
 * panel since there's nothing analogous to reveal here.
 */
function SwipeableAiBubble({ children, onSwipeReply }: { children: ReactNode; onSwipeReply: () => void }) {
  const translateX = useSharedValue(0);
  const replyTriggered = useSharedValue(false);

  const pan = Gesture.Pan()
    .activeOffsetX([12, 999])
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      const next = Math.max(0, Math.min(SWIPE_REPLY_TRIGGER, e.translationX));
      translateX.value = next;
      if (next >= SWIPE_REPLY_TRIGGER && !replyTriggered.value) {
        replyTriggered.value = true;
        runOnJS(onSwipeReply)();
      }
    })
    .onEnd(() => {
      translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
      replyTriggered.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

function modeColor(key: 'coral' | 'blue' | 'gold', colors: ThemeColors): string {
  return key === 'gold' ? GOLD : colors[key];
}

function modeTint(mode: HighlightMode, colors: ThemeColors): string {
  return modeColor(MODE_COLOR_KEY[mode], colors) + '18';
}

function formatSeconds(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
    headerTitle: { fontSize: TYPE.subtitle, fontWeight: WEIGHT.bold, color: colors.text },
    content: { padding: SPACING.xl, paddingBottom: 48, gap: 4 },
    videoWrap: { width: '100%', height: 300, borderRadius: RADII.lg, overflow: 'hidden', backgroundColor: '#000' },
    video: { width: '100%', height: '100%' },
    videoLoading: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.lg, justifyContent: 'center' },
    pendingText: { fontSize: TYPE.label, color: colors.textSecondary },
    failedText: { fontSize: TYPE.label, color: colors.textSecondary, marginTop: SPACING.lg, textAlign: 'center' },
    stuckWrap: { alignItems: 'center', gap: 10, width: '100%' },
    retryButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 20,
      paddingVertical: 9,
      minWidth: 90,
      alignItems: 'center',
    },
    retryButtonText: { fontSize: TYPE.label, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
    overall: { fontSize: TYPE.body, fontWeight: WEIGHT.semibold, color: colors.text, marginTop: SPACING.lg, lineHeight: 21 },
    notesWrap: { marginTop: SPACING.md, gap: 6 },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      padding: 10,
    },
    noteMain: { flex: 1, flexDirection: 'row', gap: 10 },
    noteTime: { fontSize: TYPE.caption, fontWeight: WEIGHT.bold, color: colors.coral, minWidth: 34 },
    noteText: { fontSize: TYPE.label, color: colors.text, flex: 1 },
    chatLabel: { fontSize: TYPE.caption, color: colors.textSecondary, marginTop: SPACING.xl, marginBottom: 8 },
    quoteChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      backgroundColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginTop: 8,
    },
    quoteChipText: { flex: 1, fontSize: TYPE.caption, color: colors.textSecondary },
    chatWrap: { gap: 6 },
    // Bumped from RADII.md to RADII.lg — Banter's chat bubbles use lg, and
    // this screen's bubbles looked visibly flatter/more generic sitting next
    // to that "gold standard" pattern at the smaller radius.
    bubble: { maxWidth: '80%', borderRadius: RADII.lg, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.coral },
    // AI bubble gets a small persona avatar + a tail-like corner pinch toward
    // it, plus a mode tint (coral-ish for Roast, blue-ish for Critique) so
    // the two personas read as distinct "someones" instead of one generic
    // system voice — mirrors the flame/target icon language already used on
    // the mode-select cards in create-highlight.tsx.
    bubbleAiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, alignSelf: 'flex-start', maxWidth: '85%' },
    aiAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    aiAvatarRoast: { backgroundColor: colors.coral + '18' },
    aiAvatarCritique: { backgroundColor: colors.blue + '18' },
    bubbleAi: { borderTopLeftRadius: 2 },
    bubbleAiRoast: { backgroundColor: colors.coral + '18' },
    bubbleAiCritique: { backgroundColor: colors.blue + '18' },
    bubbleText: { fontSize: TYPE.label, color: colors.text },
    bubbleTextUser: { color: ON_ACCENT },
    composer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    composerInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
      fontSize: TYPE.label,
      color: colors.text,
    },
    sendButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareRow: { flexDirection: 'row', gap: 8, marginTop: SPACING.xl },
    shareButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingVertical: 9,
      alignItems: 'center',
    },
    shareButtonActive: { backgroundColor: colors.coral, borderColor: colors.coral },
    // Distinct from "Keep private"'s coral active state — once a clip is
    // actually posted (profile or feed) its active pill goes red so the two
    // states read as visibly different, not just "which button is selected."
    shareButtonActivePosted: { backgroundColor: colors.danger, borderColor: colors.danger },
    shareButtonText: { fontSize: TYPE.caption, fontWeight: WEIGHT.semibold, color: colors.text },
    shareButtonTextActive: { color: ON_ACCENT },
    visibilityBadgeRow: { flexDirection: 'row', marginTop: SPACING.lg },
    visibilityBadgePrivate: {
      borderRadius: RADII.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.border,
    },
    visibilityBadgeTextPrivate: { fontSize: TYPE.caption, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    visibilityBadgePosted: {
      borderRadius: RADII.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.danger + '18',
    },
    visibilityBadgeTextPosted: { fontSize: TYPE.caption, fontWeight: WEIGHT.bold, color: colors.danger },
    verdictCard: { borderRadius: RADII.lg, padding: 14, marginTop: SPACING.lg, gap: 4 },
    verdictScore: { fontSize: TYPE.title, fontWeight: WEIGHT.bold },
    verdictText: { fontSize: TYPE.body, fontWeight: WEIGHT.semibold, color: colors.text, lineHeight: 21 },
    bestMomentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    bestMomentText: { fontSize: TYPE.caption, color: colors.textSecondary, fontWeight: WEIGHT.semibold },
    roastWrap: { marginTop: SPACING.xl, gap: 8 },
    roastReactionRow: { flexDirection: 'row', gap: 8 },
    roastReactionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    roastReactionPillActive: { backgroundColor: colors.coral + '18', borderColor: colors.coral },
    roastReactionEmoji: { fontSize: TYPE.body },
    roastReactionCount: { fontSize: TYPE.caption, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    roastCommentsWrap: { gap: 6 },
    roastCommentBubble: {
      alignSelf: 'flex-start',
      maxWidth: '85%',
      backgroundColor: colors.border,
      borderRadius: RADII.lg,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    reviewBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    reviewSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: RADII.lg,
      borderTopRightRadius: RADII.lg,
      padding: SPACING.xl,
      paddingBottom: 32,
      gap: 12,
    },
    reviewHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reviewTitle: { fontSize: TYPE.subtitle, fontWeight: WEIGHT.bold, color: colors.text },
    reviewCard: { borderWidth: 1.5, borderRadius: RADII.lg, padding: 14, gap: 10 },
    reviewCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reviewBadge: { borderRadius: RADII.pill, paddingHorizontal: 10, paddingVertical: 4 },
    reviewBadgeText: { fontSize: TYPE.caption, fontWeight: WEIGHT.bold, letterSpacing: 0.3 },
    reviewScoreRing: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewScoreText: { fontSize: TYPE.label, fontWeight: WEIGHT.bold },
    reviewCaptionInput: {
      fontSize: TYPE.body,
      color: colors.text,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    reviewHint: { fontSize: TYPE.caption, color: colors.textSecondary },
    reviewPostButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    reviewPostButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: TYPE.body },
  });
}
