<<<<<<< HEAD
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
=======
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Modal, Platform, StyleSheet, Text, View } from 'react-native';
>>>>>>> 0901838564f875f484ad55f9aca7213ff419d895

import { CommentsSection } from '@/components/feed/comments-section';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';

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

/**
 * Bottom-sheet presentation of the shared CommentsSection (the full-screen
 * post view embeds the same section directly). Deliberately basic — real
 * trash-talk energy belongs in Banter, not here.
 */
export function CommentsModal({
  visible,
  onClose,
  postId,
  postAuthorId,
  userId,
  onCommentAdded,
  onUserBlocked,
}: Props) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
<<<<<<< HEAD
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [menuComment, setMenuComment] = useState<Comment | null>(null);
=======
>>>>>>> 0901838564f875f484ad55f9aca7213ff419d895
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

<<<<<<< HEAD
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
=======
        {visible && postId ? (
          <CommentsSection
            postId={postId}
            postAuthorId={postAuthorId}
            userId={userId}
            onCommentAdded={onCommentAdded}
            onUserBlocked={onUserBlocked}
            onNavigateToProfile={(profileUserId) => {
              // The pageSheet would cover a pushed screen — close it first.
              onClose();
              router.push(`/user/${profileUserId}`);
            }}
>>>>>>> 0901838564f875f484ad55f9aca7213ff419d895
          />
        ) : null}
      </View>
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
  });
}
