import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { REACTIONS, type ReactionType } from '@/lib/reactions';

type Props = {
  counts: Record<ReactionType, number>;
  active: ReactionType[];
  onToggle: (type: ReactionType) => void;
  // Fired whenever "no way" is tapped so the parent post card can shake itself.
  onNoWay: () => void;
};

export function ReactionBar({ counts, active, onToggle, onNoWay }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {REACTIONS.map((meta) => (
        <ReactionPill
          key={meta.type}
          type={meta.type}
          emoji={meta.emoji}
          accent={meta.accent}
          count={counts[meta.type] ?? 0}
          isActive={active.includes(meta.type)}
          colors={colors}
          styles={styles}
          onPress={() => {
            if (meta.type === 'no_way') onNoWay();
            onToggle(meta.type);
          }}
        />
      ))}
    </View>
  );
}

function ReactionPill({
  type,
  emoji,
  accent,
  count,
  isActive,
  colors,
  styles,
  onPress,
}: {
  type: ReactionType;
  emoji: string;
  accent: 'red' | 'blue' | 'neutral';
  count: number;
  isActive: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const pop = useSharedValue(1);
  const [burstKey, setBurstKey] = useState(0);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pop.value = withSequence(withTiming(1.45, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 260 }));
    setBurstKey((k) => k + 1);
    onPress();
  };

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const accentColor = accent === 'red' ? colors.coral : accent === 'blue' ? colors.blue : colors.text;

  return (
    <View style={styles.pillWrap}>
      {type === 'fire' ? <FlameBurst triggerKey={burstKey} /> : null}
      {type === 'rough' ? <PuffBurst triggerKey={burstKey} colors={colors} /> : null}

      <AnimatedPressable
        style={[styles.pill, isActive && { borderColor: accentColor, backgroundColor: colors.borderSoft }]}
        onPress={handlePress}
        haptic={false}>
        <Animated.Text style={[styles.pillEmoji, popStyle]}>{emoji}</Animated.Text>
        <Text style={[styles.pillCount, isActive && { color: accentColor, fontWeight: WEIGHT.bold }]}>{count}</Text>
      </AnimatedPressable>
    </View>
  );
}

const FLAME_COUNT = 4;

function FlameBurst({ triggerKey }: { triggerKey: number }) {
  if (triggerKey === 0) return null;
  return (
    <View style={burstStyles.wrap} pointerEvents="none">
      {Array.from({ length: FLAME_COUNT }).map((_, i) => (
        <FlameParticle key={`${triggerKey}-${i}`} index={i} />
      ))}
    </View>
  );
}

function FlameParticle({ index }: { index: number }) {
  const progress = useSharedValue(0);
  const dx = (index - (FLAME_COUNT - 1) / 2) * 10 + (Math.random() - 0.5) * 6;

  useEffect(() => {
    progress.value = withDelay(
      index * 40,
      withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateY: -progress.value * 34 },
      { translateX: dx * progress.value },
      { scale: 0.7 + progress.value * 0.5 },
    ],
  }));

  return (
    <Animated.Text style={[burstStyles.flame, style]} pointerEvents="none">
      🔥
    </Animated.Text>
  );
}

function PuffBurst({ triggerKey, colors }: { triggerKey: number; colors: ThemeColors }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (triggerKey === 0) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  const style = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * 0.6,
    transform: [{ scale: 0.6 + progress.value * 1.1 }],
  }));

  if (triggerKey === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[burstStyles.puff, { borderColor: colors.textSecondary }, style]}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 8 },
    pillWrap: { position: 'relative' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: RADII.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    pillEmoji: { fontSize: 14 },
    pillCount: { fontSize: 12, color: colors.textSecondary, fontWeight: WEIGHT.medium },
  });
}

const burstStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 4,
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flame: { position: 'absolute', fontSize: 12 },
  puff: {
    position: 'absolute',
    top: 0,
    left: '30%',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
  },
});
