import { MoreHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ContentMenu } from '@/components/moderation/content-menu';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
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

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [menuComment, setMenuComment] = useState<Comment | null>(null);

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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
          <AnimatedPressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>Done</Text>
          </AnimatedPressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {comments.length === 0 ? (
              <Text style={styles.empty}>No comments yet — say something.</Text>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <View style={styles.commentTextWrap}>
                    <Text style={styles.commentAuthor}>{c.authorName}</Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => setMenuComment(c)}>
                    <MoreHorizontal size={16} color={colors.textSecondary} strokeWidth={1.75} />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment"
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
      </KeyboardAvoidingView>

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
    closeText: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.coral },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 16, gap: 14 },
    empty: { fontStyle: 'italic', color: colors.textSecondary, fontSize: 13 },
    commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    commentTextWrap: { flex: 1, gap: 2 },
    commentAuthor: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    commentBody: { fontSize: 14, color: colors.text },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
      maxHeight: 90,
      backgroundColor: colors.background,
    },
    sendButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 10,
      minWidth: 58,
      alignItems: 'center',
    },
    sendButtonDisabled: { opacity: 0.4 },
    sendButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.bold, fontSize: 13 },
  });
}
