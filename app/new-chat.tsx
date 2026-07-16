import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { fetchMessageablePeople, getOrCreateDm, type MessageablePerson } from '@/lib/banter';
import { errorMessage } from '@/lib/error-message';
import { fetchBlockedEitherDirection } from '@/lib/moderation';

export default function NewChatScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [people, setPeople] = useState<MessageablePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        const blocked = await fetchBlockedEitherDirection(userId);
        const result = await fetchMessageablePeople(userId, blocked);
        if (!cancelled) setPeople(result);
      } catch (e) {
        if (!cancelled) Alert.alert('Could not load people', errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return people;
    return people.filter((p) => p.name.toLowerCase().includes(trimmed));
  }, [people, query]);

  const handleOpenDm = async (person: MessageablePerson) => {
    setOpeningId(person.id);
    try {
      const conversationId = await getOrCreateDm(person.id);
      router.replace(`/chat/${conversationId}`);
    } catch (e) {
      Alert.alert('Could not start chat', errorMessage(e));
      setOpeningId(null);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
        <Text style={styles.headerTitle}>New Chat</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search people…"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {people.length === 0
                  ? 'No one to message yet. Connect with people or join a group first — you can only message people you know from a connection or a shared group.'
                  : 'No one matches that search.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <AnimatedPressable
              style={styles.row}
              onPress={() => handleOpenDm(item)}
              disabled={openingId !== null}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <InitialsAvatar name={item.name} size={40} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowSource}>{item.source === 'follow' ? 'Follows' : 'Group-mate'}</Text>
              </View>
              {openingId === item.id ? <ActivityIndicator color={colors.text} size="small" /> : null}
            </AnimatedPressable>
          )}
        />
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
    cancelText: { fontSize: 15, color: colors.textSecondary },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    searchWrap: { paddingHorizontal: 20, paddingTop: 14 },
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      color: colors.text,
    },
    spinner: { marginTop: 30 },
    list: { padding: 20, paddingTop: 10, flexGrow: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    rowText: { flex: 1, gap: 1 },
    rowName: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    rowSource: { fontSize: 12, color: colors.textSecondary },
    empty: { paddingTop: 40, paddingHorizontal: 12 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
}
