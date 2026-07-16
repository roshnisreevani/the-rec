import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsSection } from '@/components/feed/comments-section';
import { PostCard } from '@/components/feed/post-card';
import { PennyRatingDisplay } from '@/components/feed/penny-rating';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { blockUser, reportContent, type ReportReason } from '@/lib/moderation';
import { archivePost, fetchPostById, resharePost, setReaction, totalReactions, type Post } from '@/lib/posts';
import { HOT_THRESHOLD, type ReactionType } from '@/lib/reactions';

/**
 * Full-screen view of a single post: media large up top (video keeps its
 * player controls), comments + replies scrolling below, composer pinned at
 * the bottom. Reached by tapping a post's media in any feed; dismissed with
 * the back chevron or the platform back gesture — the feed underneath stays
 * mounted, so scroll/carousel position is preserved automatically.
 */
export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const fetched = await fetchPostById(id, userId);
      if (!fetched) {
        Alert.alert('Post not found', "This post doesn't exist or isn't visible to you.");
        router.back();
        return;
      }
      setPost(fetched);
    } catch (e) {
      Alert.alert('Could not load post', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Same optimistic reaction toggle the feeds use, scoped to this one post.
  const handleToggleReaction = async (type: ReactionType) => {
    if (!post || !userId) return;
    const isActive = post.myReactions.includes(type);
    const next = !isActive;

    const apply = (p: Post, adding: boolean): Post => ({
      ...p,
      myReactions: adding ? [...p.myReactions, type] : p.myReactions.filter((t) => t !== type),
      reactionCounts: {
        ...p.reactionCounts,
        [type]: Math.max(0, p.reactionCounts[type] + (adding ? 1 : -1)),
      },
    });

    setPost((p) => (p ? apply(p, next) : p));
    try {
      await setReaction(post.id, userId, type, next);
    } catch (e) {
      setPost((p) => (p ? apply(p, isActive) : p)); // revert
      Alert.alert('Could not react', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleDelete = () => {
    if (!post) return;
    Alert.alert('Remove this post?', 'It will be moved to your Archive.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await archivePost(post);
            router.back();
          } catch (e) {
            Alert.alert('Could not remove post', e instanceof Error ? e.message : 'Unknown error.');
          }
        },
      },
    ]);
  };

  const handleReport = async (reason: ReportReason) => {
    if (!post || !userId) return;
    try {
      await reportContent(userId, 'post', post.id, reason);
      Alert.alert('Reported', "Thanks for flagging this — we'll take a look.");
    } catch (e) {
      Alert.alert('Could not send report', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleReshare = async () => {
    if (!post || !userId) return;
    try {
      await resharePost(post, userId);
      Alert.alert('Reshared', 'A fresh copy is now at the top of your Feed.');
    } catch (e) {
      Alert.alert('Could not reshare', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleBlock = () => {
    if (!post || !userId) return;
    Alert.alert(`Block ${post.authorName}?`, "You won't see their posts or comments anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId, post.authorId);
            router.back();
          } catch (e) {
            Alert.alert('Could not block user', e instanceof Error ? e.message : 'Unknown error.');
          }
        },
      },
    ]);
  };

  // Refresh the card's comment count when comments change below it.
  const handleCommentsChanged = () => {
    if (!id || !userId) return;
    fetchPostById(id, userId)
      .then((fetched) => {
        if (fetched) setPost(fetched);
      })
      .catch(() => {});
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading || !post || !userId ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}>
          <CommentsSection
            postId={post.id}
            postAuthorId={post.authorId}
            userId={userId}
            onCommentAdded={handleCommentsChanged}
            onUserBlocked={() => router.back()}
            onNavigateToProfile={(profileUserId) => router.push(`/user/${profileUserId}`)}
            header={
              <View style={styles.cardWrap}>
                <PostCard
                  post={post}
                  currentUserId={userId}
                  isHot={totalReactions(post) >= HOT_THRESHOLD}
                  isPostOfWeek={false}
                  onToggleReaction={handleToggleReaction}
                  onOpenComments={() => {}} // comments are right below
                  onDelete={handleDelete}
                  onReport={handleReport}
                  onBlock={handleBlock}
                  onReshare={handleReshare}
                  showShare
                />
                {post.selfRating ? (
                  <View style={styles.ratingWrap}>
                    <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>
                      Post-game rating
                    </Text>
                    <PennyRatingDisplay rating={post.selfRating} />
                  </View>
                ) : null}
              </View>
            }
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 16, fontFamily: FONTS.displaySemibold, color: colors.text },
    cardWrap: { marginBottom: 6 },
    ratingWrap: {
      marginTop: 4,
      marginBottom: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: 8,
    },
    ratingLabel: { fontSize: 12, fontFamily: FONTS.displaySemibold },
  });
}
