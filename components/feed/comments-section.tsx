import { MoreHorizontal, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ContentMenu } from '@/components/moderation/content-menu';
import { CrestAvatar } from '@/components/profile/crest-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, ON_ACCENT, RADII, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { blockUser, reportContent, type ReportReason } from '@/lib/moderation';
import { addComment, deleteComment, fetchComments, type Comment } from '@/lib/posts';

type ReplyTarget = { parentId: string; name: string };

type Props = {
  postId: string;
  // Author of the post these comments belong to — lets the post owner
  // delete any comment on their own post, not just ones they wrote.
  postAuthorId: string | null;
  userId: string;
  onCommentAdded: () => void;
  // Fired after a comment author gets blocked, so the parent view can
  // refresh too (blocking hides that person's posts as well as comments).
  onUserBlocked?: () => void;
  // Tap on a commenter's avatar/name. The comments modal closes itself
  // before navigating; the full-screen post view navigates directly.
  onNavigateToProfile: (userId: string) => void;
  // Optional content rendered at the top of the scroll — the full-screen
  // post view passes the post card here so media + comments scroll together.
  header?: ReactNode;
};

/**
 * The comments list + composer, shared by CommentsModal (feed/group sheets)
 * and the full-screen post view. One level of Instagram-style threading:
 * replying to a reply attaches to the original parent comment's thread, and
 * replies are collapsed under "View N replies" until expanded.
 */
export function CommentsSection({
  postId,
  postAuthorId,
  userId,
  onCommentAdded,
  onUserBlocked,
  onNavigateToProfile,
  header,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [menuComment, setMenuComment] = useState<Comment | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setComments(await fetchComments(postId, userId));
    } catch (e) {
      Alert.alert('Could not load comments', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [postId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      if (!c.parentCommentId) continue;
      map.set(c.parentCommentId, [...(map.get(c.parentCommentId) ?? []), c]);
    }
    return map;
  }, [comments]);

  const startReply = (comment: Comment) => {
    // Replying to a reply still attaches to the root parent (one level max).
    setReplyTo({ parentId: comment.parentCommentId ?? comment.id, name: comment.authorName });
  };

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await addComment(postId, userId, body, replyTo?.parentId ?? null);
      if (replyTo) {
        setExpandedIds((prev) => new Set(prev).add(replyTo.parentId)); // show the new reply
      }
      setBody('');
      setReplyTo(null);
      await load();
      onCommentAdded();
    } catch (e) {
      // Supabase result errors are plain objects, not Error instances — the
      // old `e instanceof Error` check swallowed the real message into
      // "Unknown error". errorMessage() reads `.message` off either shape.
      console.warn('[comments] addComment failed:', e);
      Alert.alert('Could not post comment', errorMessage(e));
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

  const toggleReplies = (parentId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const renderRow = (c: Comment, isReply: boolean) => (
    <View key={c.id} style={[styles.commentRow, isReply && styles.replyRow]}>
      <Pressable onPress={() => onNavigateToProfile(c.authorId)} hitSlop={4}>
        <CrestAvatar name={c.authorName} photoUri={c.authorAvatarUrl} size={isReply ? 32 : 44} />
      </Pressable>
      <View style={styles.commentTextWrap}>
        <Text style={styles.commentInline}>
          <Text style={styles.commentAuthor} onPress={() => onNavigateToProfile(c.authorId)}>
            {c.authorName}{' '}
          </Text>
          <Text style={styles.commentBody}>{c.body}</Text>
        </Text>
        <Pressable onPress={() => startReply(c)} hitSlop={6} style={styles.replyAction}>
          <Text style={styles.replyActionText}>Reply</Text>
        </Pressable>
      </View>
      <Pressable hitSlop={12} onPress={() => setMenuComment(c)} style={styles.moreBtn}>
        <MoreHorizontal size={18} color={colors.textSecondary} strokeWidth={1.75} />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {header}
        {loading ? (
          <ActivityIndicator color={colors.text} style={styles.spinner} />
        ) : topLevel.length === 0 ? (
          <Text style={styles.empty}>No comments yet — say something.</Text>
        ) : (
          topLevel.map((c) => {
            const replies = repliesByParent.get(c.id) ?? [];
            const expanded = expandedIds.has(c.id);
            return (
              <View key={c.id} style={styles.thread}>
                {renderRow(c, false)}
                {replies.length > 0 ? (
                  <Pressable onPress={() => toggleReplies(c.id)} hitSlop={6} style={styles.repliesToggle}>
                    <View style={styles.repliesToggleLine} />
                    <Text style={styles.repliesToggleText}>
                      {expanded ? 'Hide replies' : `View ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`}
                    </Text>
                  </Pressable>
                ) : null}
                {expanded ? replies.map((r) => renderRow(r, true)) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {replyTo ? (
        <View style={styles.replyingChip}>
          <Text style={styles.replyingChipText} numberOfLines={1}>
            Replying to {replyTo.name}
          </Text>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
            <X size={15} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Add a comment…'}
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
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    spinner: { marginTop: 32 },
    list: { padding: 16, gap: 18 },
    empty: { fontStyle: 'italic', color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 32 },
    thread: { gap: 12 },
    commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    replyRow: { marginLeft: 44 },
    commentTextWrap: { flex: 1, paddingTop: 2 },
    commentInline: { fontSize: 15, lineHeight: 21, color: colors.text },
    commentAuthor: { fontFamily: FONTS.displaySemibold, fontSize: 15, color: colors.text },
    commentBody: { fontFamily: FONTS.displayRegular, fontSize: 15, color: colors.text },
    replyAction: { alignSelf: 'flex-start', marginTop: 4 },
    replyActionText: { fontSize: 12, fontFamily: FONTS.displaySemibold, color: colors.textSecondary },
    repliesToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 56 },
    repliesToggleLine: { width: 24, height: 1, backgroundColor: colors.border },
    repliesToggleText: { fontSize: 12, fontFamily: FONTS.displaySemibold, color: colors.textSecondary },
    moreBtn: { paddingTop: 8, paddingLeft: 4 },
    replyingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.borderSoft,
    },
    replyingChipText: { flex: 1, fontSize: 12, fontFamily: FONTS.displaySemibold, color: colors.textSecondary },
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
