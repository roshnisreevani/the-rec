import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Flame, MessageCircle } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/lib/notifications';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function messageFor(item: NotificationItem): string {
  return item.type === 'reaction' ? 'reacted to your post' : 'commented on your post';
}

export default function NotificationsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const fetched = await fetchNotifications(userId);
      setItems(fetched);
    } catch (e) {
      Alert.alert('Could not load notifications', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleMarkAllRead = async () => {
    if (!userId) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead(userId);
    } catch (e) {
      Alert.alert('Could not mark all as read', e instanceof Error ? e.message : 'Unknown error.');
      load();
    }
  };

  const handlePressItem = async (item: NotificationItem) => {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      try {
        await markNotificationRead(item.id);
      } catch {
        // Non-critical — worst case it just shows unread again next load.
      }
    }
    if (item.actorId) {
      router.push(`/user/${item.actorId}`);
    }
  };

  const hasUnread = items.some((n) => !n.read);

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        {hasUnread ? (
          <AnimatedPressable onPress={handleMarkAllRead} hitSlop={8}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </AnimatedPressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? (
            <Text style={styles.empty}>Nothing yet — reactions and comments on your posts show up here.</Text>
          ) : (
            items.map((item) => (
              <AnimatedPressable
                key={item.id}
                style={[styles.row, !item.read && styles.rowUnread]}
                onPress={() => handlePressItem(item)}>
                {item.actorAvatarUrl ? (
                  <Image source={{ uri: item.actorAvatarUrl }} style={styles.avatarImage} />
                ) : (
                  <InitialsAvatar name={item.actorName} size={40} />
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowLine} numberOfLines={2}>
                    <Text style={styles.rowName}>{item.actorName}</Text> {messageFor(item)}
                  </Text>
                  <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
                </View>
                <View style={[styles.typeIcon, item.type === 'reaction' ? styles.typeIconReaction : styles.typeIconComment]}>
                  {item.type === 'reaction' ? (
                    <Flame size={14} color={colors.coral} strokeWidth={2} fill={colors.coral} />
                  ) : (
                    <MessageCircle size={14} color={colors.blue} strokeWidth={2} />
                  )}
                </View>
                {!item.read ? <View style={styles.unreadDot} /> : null}
              </AnimatedPressable>
            ))
          )}
        </ScrollView>
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
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    markAllText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.coral },
    content: { padding: 20, paddingBottom: 60, gap: 2 },
    empty: {
      marginTop: 40,
      textAlign: 'center',
      fontStyle: 'italic',
      color: colors.textSecondary,
      paddingHorizontal: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: RADII.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    rowUnread: { backgroundColor: colors.borderSoft },
    avatarImage: { width: 40, height: 40, borderRadius: 20 },
    rowText: { flex: 1, gap: 2 },
    rowLine: { fontSize: 13, color: colors.text, lineHeight: 18 },
    rowName: { fontWeight: WEIGHT.semibold },
    rowTime: { fontSize: 11, color: colors.textSecondary },
    typeIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    typeIconReaction: { borderColor: colors.coral, backgroundColor: colors.background },
    typeIconComment: { borderColor: colors.blue, backgroundColor: colors.background },
    unreadDot: {
      position: 'absolute',
      top: 10,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.coral,
    },
  });
}
