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
import { errorMessage } from '@/lib/error-message';
import { fetchSavedPosts, unsavePost, type Post } from '@/lib/posts';

/**
 * Posts you've bookmarked via the share sheet's "Save" option (see
 * lib/posts.ts savePost/unsavePost and the saved_posts table). Purely a
 * private personal list — anyone's post can end up here (not just your
 * own, unlike Archive), and saving never reposts or notifies the author.
 */
export default function SavedPostsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setPosts(await fetchSavedPosts(userId));
    } catch (e) {
      Alert.alert('Could not load Saved', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleUnsave = (post: Post) => {
    if (!userId) return;
    Alert.alert('Remove from Saved?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const prev = posts;
          setPosts((p) => p.filter((x) => x.id !== post.id));
          try {
            await unsavePost(userId, post.id);
          } catch (e) {
            setPosts(prev);
            Alert.alert('Could not remove', errorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Saved</Text>
        <View style={{ width: 26 }} />
      </View>

      <Text style={styles.subtitle}>
        Posts you've saved from anywhere in Feed — private to you. Tap a post to remove it.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : posts.length === 0 ? (
        <Text style={styles.empty}>Nothing saved yet. Tap the share icon on a post and pick "Save".</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          <PostThumbnailGrid posts={posts} colors={colors} onPressItem={handleUnsave} />
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
