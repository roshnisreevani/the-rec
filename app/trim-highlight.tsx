import { useRouter, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, SPACING, TYPE, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { TARGET_CLIP_SECONDS } from '@/lib/pick-photo';
import { resolveTrimResult } from '@/lib/trim-bridge';

const TIMELINE_HEIGHT = 64;

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, '0')}`;
}

/**
 * Lets the user drag a fixed 15s window over their picked clip — the same
 * "drag a selection over a timeline" interaction as iOS Photos' video trim,
 * just with a fixed-width window instead of resizable edges (simpler to get
 * right, and 15s is a hard requirement here, not a suggestion). Nothing is
 * actually cut on-device: this only records where the window landed
 * (trimStartSeconds); the real cut happens server-side via Cloudinary when
 * the clip is played back or analyzed, and locally via player-seek+clamp
 * for the owner's own playback. See lib/trim-bridge.ts for how the result
 * gets back to create-highlight.tsx.
 */
export default function TrimHighlightScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ uri: string; durationSeconds: string }>();
  const uri = params.uri;
  const paramDuration = Number(params.durationSeconds) || TARGET_CLIP_SECONDS;

  const [duration, setDuration] = useState(paramDuration);
  const [timelineWidth, setTimelineWidth] = useState(0);
  const [trimStart, setTrimStart] = useState(0);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  // The picker's reported duration can be a rough estimate — once the
  // player itself loads the file, prefer its real duration so the window's
  // right-hand clamp (duration - 15) isn't off by a second or two.
  useEffect(() => {
    const sub = player.addListener('statusChange', (status) => {
      if (status.status === 'readyToPlay' && player.duration > 0) {
        setDuration(player.duration);
      }
    });
    return () => sub.remove();
  }, [player]);

  const maxStart = Math.max(0, duration - TARGET_CLIP_SECONDS);
  const windowFraction = duration > 0 ? Math.min(1, TARGET_CLIP_SECONDS / duration) : 1;
  const windowWidthPx = timelineWidth * windowFraction;

  const dragStartX = useSharedValue(0);
  const trimStartPx = useSharedValue(0);

  // Keeps the window pinned visually if maxStart/timelineWidth change after
  // layout settles (e.g. duration correction from the player above).
  useEffect(() => {
    const clamped = Math.min(trimStart, maxStart);
    if (clamped !== trimStart) setTrimStart(clamped);
    trimStartPx.value = timelineWidth > 0 && duration > 0 ? (clamped / duration) * timelineWidth : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, timelineWidth]);

  const seekPreview = (seconds: number) => {
    player.currentTime = seconds;
  };

  const maxStartPx = timelineWidth - windowWidthPx;

  const pan = Gesture.Pan()
    .onStart(() => {
      dragStartX.value = trimStartPx.value;
    })
    .onUpdate((e) => {
      const next = Math.min(Math.max(dragStartX.value + e.translationX, 0), Math.max(0, maxStartPx));
      trimStartPx.value = next;
      const nextSeconds = timelineWidth > 0 ? (next / timelineWidth) * duration : 0;
      runOnJS(setTrimStart)(nextSeconds);
      runOnJS(seekPreview)(nextSeconds);
    });

  const windowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: trimStartPx.value }],
    width: windowWidthPx,
  }));

  const handleConfirm = () => {
    player.pause();
    resolveTrimResult({ uri, trimStartSeconds: trimStart });
    router.back();
  };

  const handleCancel = () => {
    player.pause();
    resolveTrimResult(null);
    router.back();
  };

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
    } else {
      player.currentTime = trimStart;
      player.play();
    }
  };

  return (
    // Top inset handled manually below (not via SafeAreaView's `top` edge)
    // so there's exactly one source of truth for it — this screen was
    // previously a fullScreenModal, which on iOS doesn't reliably hand the
    // modal's content the same safe-area top inset a normal pushed screen
    // gets, so relying on SafeAreaView alone had left the header rendered
    // up under the status bar with "Use clip" untappable.
    <SafeAreaView style={styles.flex} edges={['bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, SPACING.md) }]}>
        <AnimatedPressable onPress={handleCancel} hitSlop={12} style={styles.headerSideButton}>
          <X size={22} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Trim to 15s</Text>
        <AnimatedPressable onPress={handleConfirm} hitSlop={12} style={styles.headerSideButton}>
          <Text style={styles.useClip}>Use clip</Text>
        </AnimatedPressable>
      </View>

      <AnimatedPressable style={styles.videoWrap} onPress={togglePlay}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      </AnimatedPressable>

      <View style={styles.footer}>
        <Text style={styles.rangeLabel}>
          {formatClock(trimStart)} – {formatClock(trimStart + TARGET_CLIP_SECONDS)}
          <Text style={styles.rangeLabelMuted}>  /  {formatClock(duration)} total</Text>
        </Text>

        <View
          style={styles.timeline}
          onLayout={(e) => setTimelineWidth(e.nativeEvent.layout.width)}
        >
          <View style={styles.timelineTrack} />
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.timelineWindow, windowStyle]} />
          </GestureDetector>
        </View>

        <Text style={styles.hint}>Drag the highlighted section to pick your 15 seconds.</Text>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: '#000000' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    headerSideButton: { minWidth: 60, alignItems: 'center' },
    headerTitle: { fontSize: TYPE.subtitle, fontWeight: WEIGHT.semibold as any, color: ON_ACCENT },
    useClip: { fontSize: TYPE.body, fontWeight: WEIGHT.bold as any, color: colors.coral },
    videoWrap: { flex: 1, backgroundColor: '#000000' },
    footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
    rangeLabel: { fontSize: TYPE.bodyLarge, fontWeight: WEIGHT.semibold as any, color: ON_ACCENT, textAlign: 'center' },
    rangeLabelMuted: { fontSize: TYPE.body, fontWeight: WEIGHT.regular as any, color: 'rgba(255,255,255,0.6)' },
    timeline: { height: TIMELINE_HEIGHT, justifyContent: 'center' },
    timelineTrack: {
      height: 8,
      borderRadius: RADII.pill,
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    timelineWindow: {
      position: 'absolute',
      height: TIMELINE_HEIGHT,
      borderRadius: RADII.md,
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderWidth: 2,
      borderColor: ON_ACCENT,
    },
    hint: { fontSize: TYPE.caption, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  });
}
