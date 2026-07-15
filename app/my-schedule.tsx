import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchMyUpcomingEvents, formatEventDate, type UpcomingEvent } from '@/lib/events';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weekLabel(eventDate: string, now: Date): string {
  const d = new Date(eventDate);
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setHours(0, 0, 0, 0);
  const diff = d.getTime() - startOfThisWeek.getTime();
  if (diff < WEEK_MS) return 'THIS WEEK';
  if (diff < WEEK_MS * 2) return 'NEXT WEEK';
  return 'LATER';
}

/**
 * Every upcoming game the user is RSVP'd to across all their groups, grouped
 * by week — the "See full schedule" destination from Profile's Upcoming
 * card. Read-only; RSVP changes still happen from inside each group's event.
 */
export default function MyScheduleScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setEvents(await fetchMyUpcomingEvents(userId));
    } catch (e) {
      Alert.alert('Could not load your schedule', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const now = new Date();
  const groups = useMemo(() => {
    const map = new Map<string, UpcomingEvent[]>();
    for (const e of events) {
      const label = weekLabel(e.eventDate, now);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(e);
    }
    return Array.from(map.entries());
  }, [events]);

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>My schedule</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : events.length === 0 ? (
        <Text style={styles.empty}>No games on the books. RSVP to something in a group to see it here.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {groups.map(([label, groupEvents]) => (
            <View key={label} style={styles.weekGroup}>
              <Text style={styles.weekLabel}>{label}</Text>
              {groupEvents.map((event) => (
                <View key={event.id} style={styles.row}>
                  <View style={styles.dateWrap}>
                    <Text style={styles.dateWeekday}>
                      {new Date(event.eventDate).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                    </Text>
                    <Text style={styles.dateDay}>{new Date(event.eventDate).getDate()}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {event.groupName} · {formatEventDate(event.eventDate).split('·')[1]?.trim()}
                    </Text>
                  </View>
                  <View style={styles.goingPill}>
                    <Text style={styles.goingPillText}>Going</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
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
    spinner: { marginTop: 30 },
    empty: { marginTop: 40, textAlign: 'center', fontSize: 14, color: colors.textSecondary, paddingHorizontal: 24 },
    content: { padding: 20, gap: 22 },
    weekGroup: { gap: 4 },
    weekLabel: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.textSecondary, marginBottom: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    dateWrap: { width: 38, alignItems: 'center' },
    dateWeekday: { fontSize: 10, color: colors.textSecondary },
    dateDay: { fontSize: 16, fontWeight: WEIGHT.semibold, color: colors.text },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    rowSubtitle: { fontSize: 12, color: colors.textSecondary },
    goingPill: { backgroundColor: colors.borderSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    goingPillText: { fontSize: 10, fontWeight: WEIGHT.semibold, color: colors.text },
  });
}
