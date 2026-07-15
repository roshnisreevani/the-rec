import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Plus, Trophy } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { fetchGroupBrackets, type Bracket } from '@/lib/brackets';
import { SPORTS } from '@/lib/sports';

function sportLabel(tag: string | null) {
  if (!tag) return null;
  const sport = SPORTS.find((s) => s.value === tag);
  return sport ? `${sport.emoji} ${sport.label}` : null;
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BracketsListScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      setBrackets(await fetchGroupBrackets(groupId));
    } catch (e) {
      Alert.alert('Could not load brackets', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = brackets.filter((b) => b.status === 'active');
  const completed = brackets.filter((b) => b.status === 'completed');

  const renderBracket = (b: Bracket) => (
    <Pressable key={b.id} style={styles.bracketCard} onPress={() => router.push(`/group/brackets/detail/${b.id}`)}>
      <View style={styles.bracketCardTop}>
        <Trophy size={16} color={b.status === 'completed' ? colors.coral : colors.text} strokeWidth={1.75} />
        <Text style={styles.bracketName} numberOfLines={1}>{b.name}</Text>
        <View style={[styles.statusBadge, b.status === 'completed' && styles.statusBadgeDone]}>
          <Text style={[styles.statusText, b.status === 'completed' && styles.statusTextDone]}>
            {b.status === 'active' ? 'Active' : 'Done'}
          </Text>
        </View>
      </View>
      {sportLabel(b.sportTag) ? <Text style={styles.bracketMeta}>{sportLabel(b.sportTag)}</Text> : null}
      {formatDate(b.startDate) ? <Text style={styles.bracketMeta}>Starts {formatDate(b.startDate)}</Text> : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Brackets</Text>
        <AnimatedPressable
          style={styles.createBtn}
          onPress={() => router.push(`/group/brackets/create/${groupId}`)}>
          <Plus size={16} color={ON_ACCENT} strokeWidth={2.5} />
          <Text style={styles.createBtnText}>Create</Text>
        </AnimatedPressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {brackets.length === 0 ? (
            <View style={styles.empty}>
              <Trophy size={40} color={colors.border} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No brackets yet</Text>
              <Text style={styles.emptySubtitle}>Create one to settle things properly.</Text>
            </View>
          ) : (
            <>
              {active.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Active</Text>
                  {active.map(renderBracket)}
                </View>
              ) : null}
              {completed.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Completed</Text>
                  {completed.map(renderBracket)}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    createBtnText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 13 },
    content: { padding: 20, gap: 24, paddingBottom: 60 },
    section: { gap: 10 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.textSecondary },
    bracketCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      padding: 14,
      gap: 5,
      backgroundColor: colors.background,
    },
    bracketCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bracketName: { flex: 1, fontSize: 15, fontWeight: WEIGHT.semibold, color: colors.text },
    statusBadge: {
      borderRadius: RADII.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.borderSoft,
    },
    statusBadgeDone: { backgroundColor: colors.coral + '22' },
    statusText: { fontSize: 11, fontWeight: WEIGHT.bold, color: colors.textSecondary },
    statusTextDone: { color: colors.coral },
    bracketMeta: { fontSize: 12, color: colors.textSecondary, marginLeft: 24 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: WEIGHT.bold, color: colors.text },
    emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  });
}
