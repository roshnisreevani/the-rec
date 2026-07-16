import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { fetchReactionUsers } from '@/lib/posts';
import type { ReactionType } from '@/lib/reactions';

export const WORD_BANK = [
  'Dope', 'Baller', 'Clutch', 'No way', 'Bosh', 'Rough',
  'Nasty', "Let's go", 'Rookie move', 'Unreal', 'Mid', 'Sheesh',
  'Goat move', 'Respect', 'W', 'L', 'Lowkey fire', 'Filthy',
];

export const EMOJI_BANK = [
  '🔥', '💪', '😤', '🏆', '💀', '😂',
  '🫡', '🤙', '👑', '🙌', '😮', '🥶',
  '🐐', '🤯', '😬', '🫠', '🤣', '👏',
];

const EMOJI_BANK_SET = new Set(EMOJI_BANK);

// Written by double-tap on media — stored in DB but never shown as a pill
const HIDDEN = new Set(['fire']);

type Props = {
  postId: string;
  counts: Record<string, number>;
  active: ReactionType[];
  onToggle: (type: ReactionType) => void;
};

export function ReactionBar({ postId, counts, active, onToggle }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [wordOpen, setWordOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactorsFor, setReactorsFor] = useState<string | null>(null);
  const [reactorNames, setReactorNames] = useState<string[] | null>(null);

  const topWord = useMemo(() => {
    return Object.entries(counts)
      .filter(([type, count]) => WORD_BANK.includes(type) && type !== 'W' && count > 0)
      .sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [counts]);

  const topEmoji = useMemo(() => {
    return Object.entries(counts)
      .filter(([type, count]) => EMOJI_BANK_SET.has(type) && count > 0)
      .sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [counts]);

  const handleShowReactors = (type: string) => {
    setReactorsFor(type);
    setReactorNames(null);
    fetchReactionUsers(postId, type)
      .then(setReactorNames)
      .catch(() => setReactorNames([]));
  };

  const handleToggle = (type: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(type as ReactionType);
  };

  return (
    <View style={styles.row}>
      {/* W — instant like button */}
      <Pressable
        style={[styles.bankBtn, active.includes('W' as ReactionType) && styles.bankBtnActive]}
        onPress={() => handleToggle('W')}
        hitSlop={6}>
        <Text style={[styles.bankBtnLabel, active.includes('W' as ReactionType) && styles.bankBtnLabelActive]}>W</Text>
      </Pressable>

      {/* ... — opens word bank */}
      <Pressable style={styles.bankBtn} onPress={() => setWordOpen(true)} hitSlop={6}>
        <Text style={styles.bankBtnLabel}>···</Text>
      </Pressable>

      {/* Emoji bank */}
      <Pressable style={styles.bankBtn} onPress={() => setEmojiOpen(true)} hitSlop={6}>
        <Text style={styles.bankBtnEmoji}>😊</Text>
      </Pressable>

      {/* Most popular word reaction */}
      {topWord ? (
        <ReactionPill
          type={topWord[0]}
          count={topWord[1]}
          isActive={active.includes(topWord[0] as ReactionType)}
          colors={colors}
          styles={styles}
          onPress={() => handleToggle(topWord[0])}
          onLongPress={() => handleShowReactors(topWord[0])}
        />
      ) : null}

      {/* Most popular emoji reaction */}
      {topEmoji ? (
        <ReactionPill
          type={topEmoji[0]}
          count={topEmoji[1]}
          isActive={active.includes(topEmoji[0] as ReactionType)}
          colors={colors}
          styles={styles}
          onPress={() => handleToggle(topEmoji[0])}
          onLongPress={() => handleShowReactors(topEmoji[0])}
        />
      ) : null}

      {/* ── Word bank modal ── */}
      <Modal visible={wordOpen} transparent animationType="fade" onRequestClose={() => setWordOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setWordOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>React with a word</Text>
            <View style={styles.wordGrid}>
              {WORD_BANK.map((word) => {
                const isActive = active.includes(word as ReactionType);
                return (
                  <Pressable
                    key={word}
                    style={[styles.wordPill, isActive && styles.wordPillActive]}
                    onPress={() => { handleToggle(word); setWordOpen(false); }}>
                    <Text style={[styles.wordPillText, isActive && styles.wordPillTextActive]}>
                      {word}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Emoji bank modal ── */}
      <Modal visible={emojiOpen} transparent animationType="fade" onRequestClose={() => setEmojiOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEmojiOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>React with an emoji</Text>
            <View style={styles.emojiGrid}>
              {EMOJI_BANK.map((emoji) => {
                const isActive = active.includes(emoji as ReactionType);
                return (
                  <Pressable
                    key={emoji}
                    style={[styles.emojiCell, isActive && styles.emojiCellActive]}
                    onPress={() => { handleToggle(emoji); setEmojiOpen(false); }}>
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Reactors modal (long-press on a pill) ── */}
      <Modal
        visible={reactorsFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReactorsFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setReactorsFor(null)}>
          <Pressable style={[styles.sheet, styles.reactorsSheet]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{reactorsFor ?? ''}</Text>
            {reactorNames === null ? (
              <ActivityIndicator color={colors.text} />
            ) : reactorNames.length === 0 ? (
              <Text style={styles.reactorEmpty}>No one yet.</Text>
            ) : (
              reactorNames.map((name, i) => (
                <Text key={`${name}-${i}`} style={styles.reactorName}>{name}</Text>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ReactionPill({
  type, count, isActive, colors, styles, onPress, onLongPress,
}: {
  type: string;
  count: number;
  isActive: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const handlePress = () => {
    pop.value = withSequence(
      withTiming(1.35, { duration: 100 }),
      withSpring(1, { damping: 8, stiffness: 260 }),
    );
    onPress();
  };

  const isEmoji = EMOJI_BANK_SET.has(type);

  return (
    <AnimatedPressable
      style={[styles.pill, isActive && { borderColor: colors.coral, backgroundColor: colors.coral + '15' }]}
      onPress={handlePress}
      onLongPress={onLongPress}
      haptic={false}>
      <Animated.Text style={[isEmoji ? styles.pillEmoji : styles.pillWord, popStyle]}>
        {type}
      </Animated.Text>
      <Text style={[styles.pillCount, isActive && { color: colors.coral, fontWeight: WEIGHT.bold }]}>
        {count}
      </Text>
    </AnimatedPressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },

    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: RADII.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    pillEmoji: { fontSize: 13 },
    pillWord: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.text },
    pillCount: { fontSize: 11, color: colors.textSecondary, fontWeight: WEIGHT.medium },

    bankBtn: {
      width: 30,
      height: 30,
      borderRadius: RADII.pill,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankBtnActive: {
      borderColor: colors.coral,
      backgroundColor: colors.coral + '15',
    },
    bankBtnLabel: { fontSize: 12, fontWeight: WEIGHT.bold, color: colors.textSecondary },
    bankBtnLabelActive: { color: colors.coral },
    bankBtnEmoji: { fontSize: 14 },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: RADII.lg,
      borderTopRightRadius: RADII.lg,
      padding: 20,
      paddingBottom: 36,
      gap: 16,
    },
    sheetTitle: {
      fontSize: 14,
      fontWeight: WEIGHT.bold,
      color: colors.text,
      textAlign: 'center',
    },

    wordGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    wordPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: RADII.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    wordPillActive: {
      borderColor: colors.coral,
      backgroundColor: colors.coral + '15',
    },
    wordPillText: {
      fontSize: 13,
      fontWeight: WEIGHT.semibold,
      color: colors.text,
    },
    wordPillTextActive: { color: colors.coral },

    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      justifyContent: 'center',
    },
    emojiCell: {
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADII.md,
    },
    emojiCellActive: {
      backgroundColor: colors.coral + '20',
    },
    emojiText: { fontSize: 26 },

    reactorsSheet: { alignItems: 'center' },
    reactorName: { fontSize: 14, color: colors.text },
    reactorEmpty: { fontSize: 13, color: colors.textSecondary },
  });
}
