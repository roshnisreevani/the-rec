import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, StyleSheet, Text, View } from 'react-native';
// RNGH's ScrollView (a drop-in for RN's) so FeedCarousel's swipe-up pan can
// coordinate with page scrolling via blocksExternalGesture — with the plain
// RN ScrollView the two recognizers can't negotiate and scroll wins.
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsModal } from '@/components/feed/comments-modal';
import { FeedCarousel } from '@/components/feed/feed-carousel';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { useReactionStreak } from '@/lib/feed-streak';
import { errorMessage } from '@/lib/error-message';
import { blockUser, reportContent, type ReportReason } from '@/lib/moderation';
import {
  archivePost,
  computePostOfWeekId,
  fetchFeed,
  resharePost,
  setReaction,
  totalReactions,
  type FeedScope,
  type Post,
} from '@/lib/posts';
import { HOT_THRESHOLD, type ReactionType } from '@/lib/reactions';

export default function FeedScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scrollRef = useRef<ScrollView>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [scope, setScope] = useState<FeedScope>('following');

  const { streak, onLeavePost } = useReactionStreak();

  const load = useCallback(
    async (isRefresh = false, scopeOverride?: FeedScope) => {
      if (isRefresh) setRefreshing(true);
      try {
        const fetched = await fetchFeed(userId, scopeOverride ?? scope);
        setPosts(fetched);
      } catch (e) {
        Alert.alert('Could not load Feed', errorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, scope]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Passes the new scope explicitly rather than waiting on the setScope
  // state update to land, so the very next fetch is guaranteed correct.
  const handleScopeChange = (next: FeedScope) => {
    if (next === scope) return;
    setScope(next);
    setLoading(true);
    load(false, next);
  };

  const postOfWeekId = useMemo(() => computePostOfWeekId(posts), [posts]);
  const commentsPost = posts.find((p) => p.id === commentsPostId) ?? null;

  const isHot = useCallback((post: Post) => totalReactions(post) >= HOT_THRESHOLD, []);
  const isPostOfWeek = useCallback((post: Post) => post.id === postOfWeekId, [postOfWeekId]);

  const handleToggleReaction = async (postId: string, type: ReactionType) => {
    if (!userId) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const isActive = post.myReactions.includes(type);
    const next = !isActive;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const myReactions = next ? [...p.myReactions, type] : p.myReactions.filter((t) => t !== type);
        const reactionCounts = {
          ...p.reactionCounts,
          [type]: Math.max(0, p.reactionCounts[type] + (next ? 1 : -1)),
        };
        return { ...p, myReactions, reactionCounts };
      })
    );

    try {
      await setReaction(postId, userId, type, next);
    } catch (e) {
      // Revert on failure.
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const myReactions = isActive ? [...p.myReactions, type] : p.myReactions.filter((t) => t !== type);
          const reactionCounts = {
            ...p.reactionCounts,
            [type]: Math.max(0, p.reactionCounts[type] + (isActive ? 1 : -1)),
          };
          return { ...p, myReactions, reactionCounts };
        })
      );
      Alert.alert('Could not react', errorMessage(e));
    }
  };

  // "Delete" from Feed is a soft-delete: the post moves to the author's
  // private Archive rather than being destroyed. It can still be reshared,
  // promoted to Profile, or permanently deleted from there.
  const handleDeletePost = (post: Post) => {
    Alert.alert('Move this post to your Archive?', "You can reshare it, add it to your Profile, or delete it for good from there.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          const prev = posts;
          setPosts((p) => p.filter((x) => x.id !== post.id));
          try {
            await archivePost(post);
          } catch (e) {
            setPosts(prev);
            Alert.alert('Could not archive post', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handleReportPost = async (post: Post, reason: ReportReason) => {
    if (!userId) return;
    try {
      await reportContent(userId, 'post', post.id, reason);
      Alert.alert('Reported', "Thanks for flagging this — we'll take a look.");
    } catch (e) {
      Alert.alert('Could not send report', errorMessage(e));
    }
  };

  const handleReshare = async (post: Post) => {
    if (!userId) return;
    try {
      await resharePost(post, userId);
      Alert.alert('Reshared', 'A fresh copy is now at the top of your Feed.');
      load();
    } catch (e) {
      Alert.alert('Could not reshare', errorMessage(e));
    }
  };

  const handleBlockUser = (post: Post) => {
    if (!userId) return;
    Alert.alert(`Block ${post.authorName}?`, "You won't see their posts or comments anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId, post.authorId);
            load();
          } catch (e) {
            Alert.alert('Could not block user', errorMessage(e));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scoreboard</Text>
        <AnimatedPressable hitSlop={8} onPress={() => router.push('/find-people')}>
          <Search size={22} color={colors.text} strokeWidth={1.75} />
        </AnimatedPressable>
      </View>

      <View style={styles.scopeRow}>
        <ScopeTab label="Following" active={scope === 'following'} onPress={() => handleScopeChange('following')} styles={styles} />
        <ScopeTab label="Discover" active={scope === 'discover'} onPress={() => handleScopeChange('discover')} styles={styles} />
      </View>

      {userId ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.text} />
          }
          showsVerticalScrollIndicator={false}>
          {posts.length === 0 ? (
            <Text style={styles.empty}>
              {scope === 'following'
                ? 'Nothing from people you follow yet. Check Discover, or follow more people from the search icon above.'
                : 'Nothing on Feed yet. Tap the + tab to post the first play of the week.'}
            </Text>
          ) : (
            <>
              <FeedCarousel
                posts={posts}
                currentUserId={userId}
                scrollRef={scrollRef}
                isHot={isHot}
                isPostOfWeek={isPostOfWeek}
                streak={streak}
                onLeavePost={onLeavePost}
                onToggleReaction={handleToggleReaction}
                onOpenComments={(postId) => setCommentsPostId(postId)}
                onDelete={handleDeletePost}
                onReport={handleReportPost}
                onBlock={handleBlockUser}
                onReshare={handleReshare}
              />
            </>
          )}
        </ScrollView>
      ) : null}

      {userId ? (
        <CommentsModal
          visible={!!commentsPostId}
          postId={commentsPostId}
          postAuthorId={commentsPost?.authorId ?? null}
          userId={userId}
          onClose={() => setCommentsPostId(null)}
          onCommentAdded={() => load()}
          onUserBlocked={() => load()}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ScopeTab({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <AnimatedPressable style={[styles.scopeTab, active && styles.scopeTabActive]} onPress={onPress} hitSlop={4}>
      <Text style={[styles.scopeTabText, active && styles.scopeTabTextActive]}>{label}</Text>
    </AnimatedPressable>
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
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerTitle: { fontSize: 20, fontWeight: WEIGHT.bold, color: colors.text },
    scopeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    scopeTab: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: RADII.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    scopeTabActive: { backgroundColor: colors.text, borderColor: colors.text },
    scopeTabText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    scopeTabTextActive: { color: colors.background },
    list: { paddingBottom: 40 },
    empty: {
      marginTop: 60,
      textAlign: 'center',
      fontStyle: 'italic',
      color: colors.textSecondary,
      paddingHorizontal: 30,
    },
  });
}
