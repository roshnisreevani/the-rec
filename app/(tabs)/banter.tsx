import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { MessageSquarePlus, MessagesSquare } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { fetchInbox, messageTimeLabel, type InboxItem } from '@/lib/banter';

export default function BanterScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!userId) return;
      if (isRefresh) setRefreshing(true);
      try {
        setItems(await fetchInbox());
      } catch (e) {
        Alert.alert('Could not load Banter', e instanceof Error ? e.message : 'Unknown error.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
        <Text style={styles.headerTitle}>Banter</Text>
        <AnimatedPressable style={styles.newButton} onPress={() => router.push('/new-chat')}>
          <MessageSquarePlus size={16} color={ON_ACCENT} strokeWidth={2.25} />
          <Text style={styles.newButtonText}>New</Text>
        </AnimatedPressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.conversationId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.text} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MessagesSquare size={40} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No banter yet</Text>
            <Text style={styles.emptyText}>
              Message a connection or a group-mate — every group you join also gets its own thread here.
            </Text>
            <AnimatedPressable style={styles.emptyButton} onPress={() => router.push('/new-chat')}>
              <Text style={styles.emptyButtonText}>Start a Chat</Text>
            </AnimatedPressable>
          </View>
        }
        renderItem={({ item }) => {
          const preview = item.lastMessageText
            ? item.type === 'dm'
              ? item.lastMessageText
              : `${item.lastMessageSender ?? 'Someone'}: ${item.lastMessageText}`
            : 'No messages yet — say hi!';
          return (
            <AnimatedPressable style={styles.row} onPress={() => router.push(`/chat/${item.conversationId}`)}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <InitialsAvatar name={item.title} size={46} />
              )}
              <View style={styles.rowText}>
                <View style={styles.rowTopLine}>
                  <Text style={[styles.rowTitle, item.unreadCount > 0 && styles.rowTitleUnread]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.lastMessageAt ? (
                    <Text style={styles.rowTime}>{messageTimeLabel(item.lastMessageAt)}</Text>
                  ) : null}
                </View>
                <View style={styles.rowBottomLine}>
                  <Text
                    style={[styles.rowPreview, item.unreadCount > 0 && styles.rowPreviewUnread]}
                    numberOfLines={1}>
                    {preview}
                  </Text>
                  {item.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {item.unreadCount > 99 ? '99+' : item.unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </AnimatedPressable>
          );
        }}
      />
    </SafeAreaView>
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
      paddingTop: 12,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 24, fontWeight: WEIGHT.bold, color: colors.text },
    newButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    newButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 13 },
    list: { paddingHorizontal: 20, paddingBottom: 48, flexGrow: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    avatar: { width: 46, height: 46, borderRadius: 23 },
    rowText: { flex: 1, gap: 2 },
    rowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rowTitle: { flex: 1, fontSize: 15, fontWeight: WEIGHT.semibold, color: colors.text },
    rowTitleUnread: { fontWeight: WEIGHT.bold },
    rowTime: { fontSize: 12, color: colors.textSecondary },
    rowBottomLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowPreview: { flex: 1, fontSize: 13, color: colors.textSecondary },
    rowPreviewUnread: { color: colors.text, fontWeight: WEIGHT.medium },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.coral,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    unreadBadgeText: { fontSize: 11, fontWeight: WEIGHT.bold, color: ON_ACCENT },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 20 },
    emptyTitle: { fontSize: 17, fontWeight: WEIGHT.bold, color: colors.text, marginTop: 4 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    emptyButton: {
      marginTop: 8,
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    emptyButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
