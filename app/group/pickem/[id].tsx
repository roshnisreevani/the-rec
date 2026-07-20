import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsModal } from '@/components/feed/comments-modal';
import { PickEmCard } from '@/components/groups/pickem-card';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchGroupDetail } from '@/lib/groups';
import { blockUser } from '@/lib/moderation';
import { deletePickEm, fetchGroupPickEms, PICK_EM_COMMENT_API, type PickEm } from '@/lib/pickem';

export default function PickEmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); // group id
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [pickEms, setPickEms] = useState<PickEm[]>([]);
  const [isGroupOwner, setIsGroupOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentsForId, setCommentsForId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const [detail, fetchedPickEms] = await Promise.all([
        fetchGroupDetail(id, userId),
        fetchGroupPickEms(id, userId),
      ]);
      if (!detail) {
        Alert.alert('Group not found', "This group doesn't exist or you're no longer a member.");
        router.back();
        return;
      }
      setIsGroupOwner(detail.group.myRole === 'owner');
      setPickEms(fetchedPickEms);
    } catch (e) {
      Alert.alert('Could not load Pick’Em', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const commentsTarget = pickEms.find((p) => p.id === commentsForId) ?? null;

  // Confirm, then remove locally before the request completes; restore the
  // list if the delete fails — same pattern as deleting a group post.
  const handleDelete = (pickEm: PickEm) => {
    Alert.alert('Delete this Pick’Em?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const prev = pickEms;
          setPickEms((list) => list.filter((p) => p.id !== pickEm.id));
          try {
            await deletePickEm(pickEm.id);
          } catch (e) {
            setPickEms(prev);
            Alert.alert('Could not delete Pick’Em', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handleBlockCreator = (pickEm: PickEm) => {
    if (!userId) return;
    Alert.alert(`Block ${pickEm.createdByName}?`, "You won't see their posts or comments anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId, pickEm.createdBy);
            load();
          } catch (e) {
            Alert.alert('Could not block user', errorMessage(e));
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
        <Text style={styles.headerTitle}>Pick&rsquo;Em</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <AnimatedPressable
            style={styles.createButton}
            onPress={() => router.push(`/group/pickem/create/${id}`)}>
            <Plus size={16} color={ON_ACCENT} strokeWidth={2.5} />
            <Text style={styles.createButtonText}>Create Pick&rsquo;Em</Text>
          </AnimatedPressable>

          {pickEms.length === 0 ? (
            <Text style={styles.empty}>No matchups yet — start one and let the group weigh in.</Text>
          ) : (
            pickEms.map((pickEm) => (
              <PickEmCard
                key={pickEm.id}
                pickEm={pickEm}
                currentUserId={userId ?? ''}
                isGroupOwner={isGroupOwner}
                onChanged={load}
                onOpenComments={() => setCommentsForId(pickEm.id)}
                onDelete={handleDelete}
                onBlockCreator={handleBlockCreator}
              />
            ))
          )}
        </ScrollView>
      )}

      {userId ? (
        <CommentsModal
          visible={!!commentsForId}
          postId={commentsForId}
          commentApi={PICK_EM_COMMENT_API}
          title="Pick’Em"
          postAuthorId={commentsTarget?.createdBy ?? null}
          userId={userId}
          onClose={() => setCommentsForId(null)}
          onCommentAdded={() => {}}
        />
      ) : null}
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
    spinner: { marginTop: 30 },
    list: { padding: 20, paddingTop: 14, paddingBottom: 48 },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 12,
      marginBottom: 16,
    },
    createButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
    empty: { marginTop: 24, textAlign: 'center', fontStyle: 'italic', color: colors.textSecondary, fontSize: 14 },
  });
}
