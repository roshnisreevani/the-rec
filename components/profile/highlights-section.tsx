import { useRouter } from 'expo-router';
import { Flame, Mic, Plus, Target, Zap } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { aiModeColor, aiModeLabel } from '@/lib/ai-mode-style';
import { fetchMyHighlightClips, type HighlightClip, type HighlightMode } from '@/lib/highlights';

const MODE_ICON: Record<HighlightMode, typeof Flame> = {
  roast: Flame,
  hype: Zap,
  commentator: Mic,
  critique: Target,
};

type Props = {
  userId: string;
  // Bumped by the parent's pull-to-refresh — this component manages its own
  // fetch, so the parent can't just call a shared `load`; incrementing this
  // number is how it says "refetch now" from the outside.
  refreshSignal?: number;
};

export function HighlightsSection({ userId, refreshSignal }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [clips, setClips] = useState<HighlightClip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setClips(await fetchMyHighlightClips(userId));
    } catch {
      // quiet fail — highlights are supplementary, not core profile data
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Was a plain useEffect (mount-only) — archiving a clip from its detail
  // screen and navigating back never refetched, so an archived clip kept
  // showing here even though it was correctly removed in the database.
  // useFocusEffect refetches every time Profile comes back into view.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Skip the very first run (mount already triggers a load via
  // useFocusEffect above) — only refetch on refreshSignal changes after that.
  const isFirstRefreshSignal = useRef(true);
  useEffect(() => {
    if (isFirstRefreshSignal.current) {
      isFirstRefreshSignal.current = false;
      return;
    }
    load();
  }, [refreshSignal, load]);

  if (loading) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Highlights</Text>
        <AnimatedPressable style={styles.addButton} onPress={() => router.push('/create-highlight')}>
          <Plus size={13} color={colors.text} strokeWidth={2.5} />
          <Text style={styles.addButtonText}>New clip</Text>
        </AnimatedPressable>
      </View>

      {clips.length === 0 ? (
        <AnimatedPressable style={styles.emptyCard} onPress={() => router.push('/create-highlight')}>
          <Text style={styles.emptyTitle}>Post a 15-second clip</Text>
          <Text style={styles.emptyText}>Get roasted, or get real feedback on your level.</Text>
        </AnimatedPressable>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {clips.map((clip) => {
            // Only clips actually shared to Feed get the red border —
            // "posted to profile" (friends can react but it's not a Feed
            // card) stays looking like a normal clip.
            const isPosted = clip.visibility === 'feed';
            return (
              <AnimatedPressable
                key={clip.id}
                style={[styles.card, isPosted && styles.cardPosted]}
                onPress={() => router.push(`/highlight/${clip.id}`)}>
                <View style={styles.cardIconRow}>
                  {(() => {
                    const ModeIcon = MODE_ICON[clip.mode];
                    return <ModeIcon size={14} color={aiModeColor(clip.mode, colors)} strokeWidth={2} />;
                  })()}
                  <Text style={styles.cardMode}>
                    {aiModeLabel(clip.mode)}
                    {clip.sport ? ` ${clip.sport}` : ''}
                  </Text>
                </View>
                {clip.status === 'pending' ? (
                  <Text style={styles.cardSport}>Analyzing...</Text>
                ) : clip.status === 'failed' ? (
                  <Text style={styles.cardFailed}>Couldn't process</Text>
                ) : null}
                {clip.status === 'pending' ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginTop: 4 }} />
                ) : null}
                {isPosted ? <Text style={styles.cardPostedText}>● Posted</Text> : null}
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: { marginTop: 20, gap: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    addButtonText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    emptyCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: RADII.lg,
      padding: 16,
      gap: 3,
    },
    emptyTitle: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    emptyText: { fontSize: 12, color: colors.textSecondary },
    row: { gap: 8 },
    card: {
      width: 130,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      padding: 10,
      gap: 3,
    },
    cardPosted: { borderWidth: 2, borderColor: colors.danger },
    cardIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    cardMode: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.text },
    cardSport: { fontSize: 12, color: colors.textSecondary },
    cardFailed: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
    cardPostedText: { fontSize: 10, fontWeight: WEIGHT.bold, color: colors.danger, marginTop: 4 },
  });
}
