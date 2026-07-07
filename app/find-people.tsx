import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { searchPeople, type PersonSearchResult } from '@/lib/connections';

export default function FindPeopleScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!userId || !query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const people = await searchPeople(userId, query);
        if (requestId.current === currentRequest) setResults(people);
      } catch (e) {
        if (requestId.current === currentRequest) {
          Alert.alert('Search failed', e instanceof Error ? e.message : 'Unknown error.');
        }
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, userId]);

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Find People</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.input}
          placeholder="Search by name"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        {loading ? <ActivityIndicator color={colors.textSecondary} style={styles.spinner} /> : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.trim() && !loading ? (
            <Text style={styles.empty}>No one found by that name.</Text>
          ) : !query.trim() ? (
            <Text style={styles.empty}>Search for someone by name to find their profile.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <AnimatedPressable style={styles.row} onPress={() => router.push(`/user/${item.id}`)}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <InitialsAvatar name={item.name} size={44} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name || 'Nameless legend'}
              </Text>
              <Text style={styles.rowLocation} numberOfLines={1}>
                {item.location || 'Location unknown'}
              </Text>
            </View>
          </AnimatedPressable>
        )}
      />
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
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingRight: 10,
      backgroundColor: colors.background,
    },
    input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
    spinner: { marginRight: 4 },
    list: { paddingHorizontal: 16, paddingBottom: 40 },
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
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    avatarImage: { width: 44, height: 44, borderRadius: 22 },
    rowText: { flex: 1, gap: 2 },
    rowName: { fontSize: 15, fontWeight: WEIGHT.semibold, color: colors.text },
    rowLocation: { fontSize: 13, color: colors.textSecondary },
  });
}
