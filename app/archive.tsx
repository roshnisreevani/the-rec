import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PostThumbnailGrid } from '@/components/feed/post-thumbnail-grid';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { ARCHIVE_WINDOW_DAYS } from '@/lib/archive';
import { errorMessage } from '@/lib/error-message';
import {
  deletePost,
  featurePost,
  fetchArchivedPosts,
  fetchFeaturedPostIds,
  resharePost,
  unfeaturePost,
  type Post,
} from '@/lib/posts';

/**
 * Browse + manage your own aged-out or manually-deleted posts. Nothing here
 * is public — this is deliberately a quiet personal scrapbook, not a
 * curated space with a decision attached. From here you can reshare a post
 * (posts a fresh copy to Feed), add/remove it from your Profile's Featured
 * section, or delete it for good.
 */
export default function ArchiveScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [posts, setPosts] = useState<Post[]>([]);
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [fetchedPosts, fetchedFeaturedIds] = await Promise.all([
        fetchArchivedPosts(userId),
        fetchFeaturedPostIds(userId),
      ]);
      setPosts(fetchedPosts);
      setFeaturedIds(fetchedFeaturedIds);
    } catch (e) {
      Alert.alert('Could not load Archive', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggleFeatured = async (post: Post) => {
    if (!userId) return;
    const isFeatured = featuredIds.has(post.id);
    const prev = featuredIds;
    const next = new Set(featuredIds);
    isFeatured ? next.delete(post.id) : next.add(post.id);
    setFeaturedIds(next);
    try {
      if (isFeatured) {
        await unfeaturePost(userId, post.id);
      } else {
        await featurePost(userId, post.id);
      }
    } catch (e) {
      setFeaturedIds(prev);
      Alert.alert('Could not update Profile', errorMessage(e));
    }
  };

  const handleReshare = (post: Post) => {
    Alert.alert('Reshare this post?', 'Posts a fresh copy to Feed. The original stays right here in Archive.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reshare',
        onPress: async () => {
          try {
            await resharePost(post);
            Alert.alert('Reshared', 'Check your Feed — the fresh copy is live.');
          } catch (e) {
            Alert.alert('Could not reshare post', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handleDeleteForever = (post: Post) => {
    Alert.alert('Delete this post forever?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete forever',
        style: 'destructive',
        onPress: async () => {
          const prev = posts;
          setPosts((p) => p.filter((x) => x.id !== post.id));
          try {
            await deletePost(post);
          } catch (e) {
            setPosts(prev);
            Alert.alert('Could not delete post', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handlePressPost = (post: Post) => {
    const isFeatured = featuredIds.has(post.id);
    Alert.alert('Post options', undefined, [
      {
        text: isFeatured ? 'Remove from Profile' : 'Add to Profile',
        onPress: () => handleToggleFeatured(post),
      },
      { text: 'Reshare', onPress: () => handleReshare(post) },
      { text: 'Delete forever', style: 'destructive', onPress: () => handleDeleteForever(post) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Archive</Text>
        <View style={{ width: 26 }} />
      </View>

      <Text style={styles.subtitle}>
        Posts quietly move here after {ARCHIVE_WINDOW_DAYS} days, or whenever you delete one from Feed. Private to
        you — never public. Tap a post for options.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : posts.length === 0 ? (
        <Text style={styles.empty}>Nothing archived yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          <PostThumbnailGrid posts={posts} colors={colors} onPressItem={handlePressPost} />
        </ScrollView>
      )}
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
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    spinner: { marginTop: 30 },
    grid: { padding: 16, flexGrow: 1 },
    empty: { marginTop: 40, textAlign: 'center', fontSize: 14, color: colors.textSecondary, paddingHorizontal: 24 },
  });
}
