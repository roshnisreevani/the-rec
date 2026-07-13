import { MoreHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentMenu } from '@/components/moderation/content-menu';
import { CrestAvatar } from '@/components/profile/crest-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, ON_ACCENT, RADII, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { blockUser, reportContent, type ReportReason } from '@/lib/moderation';
import { addComment, deleteComment, fetchComments, type Comment } from '@/lib/posts';

type Props = {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
  // Author of the post these comments belong to — lets the post owner
  // delete any comment on their own post, not just ones they wrote.
  postAuthorId: string | null;
  userId: string;
  onCommentAdded: () => void;
  // Fired after a comment author gets blocked, so the parent feed can
  // refresh too (blocking hides that person's posts as well as comments).
  onUserBlocked?: () => void;
};

// Deliberately basic — real trash-talk energy belongs in Banter, not here.
export function CommentsModal({
  visible,
  onClose,
  postId,
  postAuthorId,
  userId,
  onCommentAdded,
  onUserBlocked,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [menuComment, setMenuComment] = useState<Comment | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // KeyboardAvoidingView doesn't work reliably here: this UI lives inside a
  // native <Modal presentationStyle="pageSheet">, and on iOS that combo has a
  // well-known bug where KeyboardAvoidingView's internal keyboard-frame math
  // (measured against the pageSheet's own offset screen position, not the
  // full screen) comes out ~0, so its "padding" behavior does nothing. Track
  // the keyboard height directly instead and push the composer up manually —
  // this works the same regardless of the modal's presentation style.
  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(Math.max(0, e.endCoordinates.height - insets.bottom));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const fetched = await fetchComments(postId, userId);
      setComments(fetched);
    } catch (e) {
      Alert.alert('Could not load comments', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [postId, userId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleSend = async () => {
    if (!postId || !body.trim()) return;
    setSending(true);
    try {
      await addComment(postId, userId, body);
      setBody('');
      await load();
      onCommentAdded();
    } catch (e) {
      Alert.alert('Could not post comment', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (comment: Comment) => {
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(comment.id);
            await load();
            onCommentAdded();
          } catch (e) {
            Alert.alert('Could not delete comment', e instanceof Error ? e.message : 'Unknown error.');
          }
        },
      },
    ]);
  };

  const handleReportComment = async (comment: Comment, reason: ReportReason) => {
    try {
      await reportContent(userId, 'comment', comment.id, reason);
      Alert.alert('Reported', "Thanks for flagging this — we'll take a look.");
    } catch (e) {
      Alert.alert('Could not send report', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleBlockUser = (comment: Comment) => {
    Alert.alert(`Block ${comment.authorName}?`, "You won't see their posts or comments anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId, comment.authorId);
            await load();
            onCommentAdded();
            onUserBlocked?.();
          } catch (e) {
            Alert.alert('Could not block user', e instanceof Error ? e.message : 'Unknown error.');
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.flex, Platform.OS === 'ios' && { paddingBottom: keyboardHeight }]}>
        {/* Drag handle */}
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <View style={{ width: 48 }} />
          <Text style={styles.headerTitle}>Comments</Text>
          <AnimatedPressable onPress={onClose} hitSlop={8} style={styles.doneWrap}>
            <Text style={styles.closeText}>Done</Text>
          </AnimatedPressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={styles.list}>
            {comments.length === 0 ? (
              <Text style={styles.empty}>No comments yet — say something.</Text>
            ) : (
              comments.map((c) => (
                  <View key={c.id} style={styles.commentRow}>
                    <CrestAvatar name={c.authorName} photoUri={c.authorAvatarUrl} size={44} />
                    <View style={styles.commentTextWrap}>
                      <Text style={styles.commentInline}>
                        <Text style={styles.commentAuthor}>{c.authorName} </Text>
                        <Text style={styles.commentBody}>{c.body}</Text>
                      </Text>
                    </View>
                    <Pressable hitSlop={12} onPress={() => setMenuComment(c)} style={styles.moreBtn}>
                      <MoreHorizontal size={18} color={colors.textSecondary} strokeWidth={1.75} />
                    </Pressable>
                  </View>
              ))
            )}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textSecondary}
            value={body}
            onChangeText={setBody}
            multiline
          />
          <AnimatedPressable
            style={[styles.sendButton, !body.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!body.trim() || sending}>
            {sending ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.sendButtonText}>Post</Text>}
          </AnimatedPressable>
        </View>
      </View>

      {menuComment ? (
        <ContentMenu
          visible={!!menuComment}
          onClose={() => setMenuComment(null)}
          canDelete={menuComment.authorId === userId || postAuthorId === userId}
          showReportAndBlock={menuComment.authorId !== userId}
          authorName={menuComment.authorName}
          onDelete={() => handleDeleteComment(menuComment)}
          onReport={(reason) => handleReportComment(menuComment, reason)}
          onBlock={() => handleBlockUser(menuComment)}
        />
      ) : null}
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 17, fontFamily: FONTS.displaySemibold, color: colors.text },
    doneWrap: { width: 48, alignItems: 'flex-end' },
    closeText: { fontSize: 16, fontFamily: FONTS.displaySemibold, color: colors.coral },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 16, gap: 18 },
    empty: { fontStyle: 'italic', color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 32 },
    commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    commentTextWrap: { flex: 1, paddingTop: 2 },
    commentInline: { fontSize: 15, lineHeight: 21, color: colors.text },
    commentAuthor: { fontFamily: FONTS.displaySemibold, fontSize: 15, color: colors.text },
    commentBody: { fontFamily: FONTS.displayRegular, fontSize: 15, color: colors.text },
    moreBtn: { paddingTop: 8, paddingLeft: 4 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 11,
      fontSize: 15,
      fontFamily: FONTS.displayRegular,
      color: colors.text,
      maxHeight: 100,
      backgroundColor: colors.background,
    },
    sendButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 18,
      paddingVertical: 11,
      minWidth: 62,
      alignItems: 'center',
    },
    sendButtonDisabled: { opacity: 0.4 },
    sendButtonText: { color: ON_ACCENT, fontFamily: FONTS.displaySemibold, fontSize: 15 },
  });
}
