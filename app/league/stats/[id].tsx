import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BarChart3, ChevronLeft, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  createStatCategory,
  deleteStatCategory,
  fetchLeagueDetail,
  fetchStatCategories,
  fetchStatTotals,
  recordPlayerStat,
  type LeagueMember,
  type LeagueRole,
  type StatCategory,
  type StatTotal,
} from '@/lib/leagues';

export default function LeagueStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [leagueName, setLeagueName] = useState('');
  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [categories, setCategories] = useState<StatCategory[]>([]);
  const [totals, setTotals] = useState<StatTotal[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryUnit, setNewCategoryUnit] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const [entryCategoryId, setEntryCategoryId] = useState<string | null>(null);
  const [entryUserId, setEntryUserId] = useState<string | null>(null);
  const [entryValue, setEntryValue] = useState('');
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const [detail, fetchedCategories, fetchedTotals] = await Promise.all([
        fetchLeagueDetail(id, userId),
        fetchStatCategories(id),
        fetchStatTotals(id),
      ]);
      setLeagueName(detail?.league.name ?? '');
      setMyRole(detail?.league.myRole ?? null);
      setMembers(detail?.members ?? []);
      setCategories(fetchedCategories);
      setTotals(fetchedTotals);
      if (!entryCategoryId && fetchedCategories.length > 0) setEntryCategoryId(fetchedCategories[0].id);
    } catch (e) {
      Alert.alert('Could not load stats', errorMessage(e));
    } finally {
      setLoading(false);
    }
    // entryCategoryId intentionally excluded — only used to seed the initial default once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCommissioner = myRole === 'commissioner' || myRole === 'co_commissioner';

  const handleAddCategory = async () => {
    if (!id) return;
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setAddingCategory(true);
    try {
      await createStatCategory(id, trimmed, newCategoryUnit.trim() || null);
      setNewCategoryName('');
      setNewCategoryUnit('');
      load();
    } catch (e) {
      Alert.alert('Could not add category', errorMessage(e));
    } finally {
      setAddingCategory(false);
    }
  };

  const handleDeleteCategory = (category: StatCategory) => {
    Alert.alert(`Delete "${category.name}"?`, 'This removes every recorded entry in this category.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStatCategory(category.id);
            load();
          } catch (e) {
            Alert.alert('Could not delete category', errorMessage(e));
          }
        },
      },
    ]);
  };

  const handleRecordStat = async () => {
    if (!id || !userId || !entryCategoryId || !entryUserId) return;
    const value = parseFloat(entryValue);
    if (Number.isNaN(value)) {
      Alert.alert('Enter a value', 'Type a number for this stat entry.');
      return;
    }
    setRecording(true);
    try {
      await recordPlayerStat({
        leagueId: id,
        statCategoryId: entryCategoryId,
        userId: entryUserId,
        teamId: null,
        matchId: null,
        value,
        recordedBy: userId,
      });
      setEntryValue('');
      load();
    } catch (e) {
      Alert.alert('Could not record stat', errorMessage(e));
    } finally {
      setRecording(false);
    }
  };

  const totalsByCategory = useMemo(() => {
    const map = new Map<string, StatTotal[]>();
    for (const total of totals) {
      const list = map.get(total.statCategoryId) ?? [];
      list.push(total);
      map.set(total.statCategoryId, list);
    }
    return map;
  }, [totals]);

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
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {leagueName ? `${leagueName} · Stats` : 'Stats'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isCommissioner ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add a stat category</Text>
            <View style={styles.addCategoryRow}>
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder="e.g. Points"
                placeholderTextColor={colors.textSecondary}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
              />
              <TextInput
                style={[styles.input, styles.unitInput]}
                placeholder="unit"
                placeholderTextColor={colors.textSecondary}
                value={newCategoryUnit}
                onChangeText={setNewCategoryUnit}
              />
              <AnimatedPressable style={styles.addButton} onPress={handleAddCategory} disabled={addingCategory}>
                {addingCategory ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Plus size={16} color={ON_ACCENT} strokeWidth={2.5} />}
              </AnimatedPressable>
            </View>
          </View>
        ) : null}

        {categories.length === 0 ? (
          <View style={styles.empty}>
            <BarChart3 size={32} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyText}>
              {isCommissioner ? 'Add a stat category to start tracking player stats.' : 'No stats being tracked yet.'}
            </Text>
          </View>
        ) : (
          categories.map((category) => (
            <View key={category.id} style={styles.section}>
              <View style={styles.categoryHeader}>
                <Text style={styles.sectionTitle}>
                  {category.name}
                  {category.unit ? ` (${category.unit})` : ''}
                </Text>
                {isCommissioner ? (
                  <AnimatedPressable onPress={() => handleDeleteCategory(category)} hitSlop={8}>
                    <Trash2 size={15} color={colors.textSecondary} strokeWidth={2} />
                  </AnimatedPressable>
                ) : null}
              </View>
              {(totalsByCategory.get(category.id) ?? []).length === 0 ? (
                <Text style={styles.emptyRowText}>No entries yet.</Text>
              ) : (
                (totalsByCategory.get(category.id) ?? []).map((row, index) => (
                  <View key={row.userId} style={styles.totalRow}>
                    <Text style={styles.rank}>{index + 1}</Text>
                    <Text style={styles.totalName} numberOfLines={1}>
                      {row.userName}
                    </Text>
                    <Text style={styles.totalValue}>{row.total}</Text>
                  </View>
                ))
              )}
            </View>
          ))
        )}

        {isCommissioner && categories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Record a stat</Text>
            <View style={styles.pillRow}>
              {categories.map((c) => (
                <AnimatedPressable
                  key={c.id}
                  style={[styles.pill, entryCategoryId === c.id && styles.pillSelected]}
                  onPress={() => setEntryCategoryId(c.id)}>
                  <Text style={[styles.pillText, entryCategoryId === c.id && styles.pillTextSelected]}>{c.name}</Text>
                </AnimatedPressable>
              ))}
            </View>

            <Text style={styles.label}>Player</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScroll}>
              {members.map((m) => (
                <AnimatedPressable
                  key={m.userId}
                  style={[styles.pill, entryUserId === m.userId && styles.pillSelected]}
                  onPress={() => setEntryUserId(m.userId)}>
                  <Text style={[styles.pillText, entryUserId === m.userId && styles.pillTextSelected]} numberOfLines={1}>
                    {m.name}
                  </Text>
                </AnimatedPressable>
              ))}
            </ScrollView>

            <View style={styles.entryRow}>
              <TextInput
                style={[styles.input, styles.valueInput]}
                placeholder="Value"
                placeholderTextColor={colors.textSecondary}
                value={entryValue}
                onChangeText={setEntryValue}
                keyboardType="numeric"
              />
              <AnimatedPressable
                style={styles.recordButton}
                onPress={handleRecordStat}
                disabled={recording || !entryCategoryId || !entryUserId || !entryValue}>
                {recording ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.recordButtonText}>Record</Text>}
              </AnimatedPressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    section: { marginTop: 22, gap: 8 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addCategoryRow: { flexDirection: 'row', gap: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.background,
    },
    nameInput: { flex: 2 },
    unitInput: { flex: 1 },
    addButton: {
      width: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
    },
    empty: { alignItems: 'center', gap: 10, paddingTop: 40 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    emptyRowText: { fontSize: 13, fontStyle: 'italic', color: colors.textSecondary },
    totalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    rank: { fontSize: 12, fontWeight: WEIGHT.bold, color: colors.textSecondary, width: 16 },
    totalName: { flex: 1, fontSize: 14, color: colors.text },
    totalValue: { fontSize: 14, fontWeight: WEIGHT.bold, color: colors.text },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    memberScroll: { flexGrow: 0 },
    pill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 8,
    },
    pillSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
    pillText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    pillTextSelected: { color: ON_ACCENT },
    label: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
    entryRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    valueInput: { flex: 1 },
    recordButton: {
      backgroundColor: colors.blue,
      borderRadius: RADII.md,
      paddingHorizontal: 18,
      justifyContent: 'center',
    },
    recordButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
