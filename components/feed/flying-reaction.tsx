import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  // Bump to re-trigger. 0 means "never fired yet".
  triggerKey: number;
  emoji: string;
};

// Big center-of-media reaction animation for double-tap — scale + slight
// rotation + fade, similar to the classic "double tap to like" gesture.
export function FlyingReaction({ triggerKey, emoji }: Props) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (triggerKey === 0) return;
    rotate.value = (Math.random() - 0.5) * 24;
    scale.value = 0;
    opacity.value = 1;
    scale.value = withSequence(
      withTiming(1.25, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 140 })
    );
    opacity.value = withDelay(450, withTiming(0, { duration: 280 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  if (triggerKey === 0) return null;

  return (
    <Animated.Text style={[styles.emoji, style]} pointerEvents="none">
      {emoji}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  emoji: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    fontSize: 72,
  },
});
