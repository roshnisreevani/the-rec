import { Image as ExpoImage } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CARD_HEIGHT, CARD_WIDTH } from '@/components/feed/card-layout';
import { PositionDots } from '@/components/feed/position-dots';
import { SessionPostCard } from '@/components/feed/session-post-card';
import { ON_ACCENT, ON_DARK_SURFACE, RADII, WEIGHT } from '@/constants/style';
import type { ReportReason } from '@/lib/moderation';
import type { Post } from '@/lib/posts';
import type { ReactionType } from '@/lib/reactions';
import { sendPostToBanter } from '@/lib/send-to-banter';

const H_SWIPE_THRESHOLD = 70;
const V_SWIPE_THRESHOLD = 70;
const SLIDE_OUT_MS = 100; // + settle below ≈ under 250ms total

// A single decisive motion, not a bouncy one: overshootClamping stops the
// spring dead the instant it reaches its target instead of letting it swing
// past and correct itself, tuned close to critical damping so there's
// essentially nothing left to clamp in the first place.
const DECISIVE_SPRING = {
  damping: 26,
  stiffness: 420,
  mass: 0.8,
  overshootClamping: true,
} as const;

type Props = {
  posts: Post[]; // already ordered most-recent-first
  currentUserId: string;
  isHot: (post: Post) => boolean;
  isPostOfWeek: (post: Post) => boolean;
  streak: number;
  onLeavePost: (postId: string, hasFireReaction: boolean) => void;
  onToggleReaction: (postId: string, type: ReactionType) => void;
  onOpenComments: (postId: string) => void;
  onDelete: (post: Post) => void;
  onReport: (post: Post, reason: ReportReason) => void;
  onBlock: (post: Post) => void;
};

/**
 * The single continuous swipeable sequence for the whole Feed — every post
 * from every group, in one run, ordered most-recent-first. This replaces
 * the earlier per-group/per-day "session" carousel (components/feed/
 * session-carousel.tsx, left in place but no longer used by feed.tsx) —
 * that grouping/clustering made Feed feel divided rather than cohesive, so
 * there's no more resetting or breaking between groups here. Each card
 * still shows which group a post is from (see SessionPostCard's author
 * line), it's just no longer used to segment the sequence itself.
 */
export function FeedCarousel({
  posts,
  currentUserId,
  isHot,
  isPostOfWeek,
  streak,
  onLeavePost,
  onToggleReaction,
  onOpenComments,
  onDelete,
  onReport,
  onBlock,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [arrowDirection, setArrowDirection] = useState<'left' | 'right' | null>(null);
  const [banterMessage, setBanterMessage] = useState<string | null>(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const arrowOpacity = useSharedValue(0);
  const arrowScale = useSharedValue(0.6);
  const banterOpacity = useSharedValue(0);

  const activePost = posts[activeIndex];

  // Preload the adjacent posts' photos so they're already decoded and in
  // memory/disk cache by the time a swipe brings them into view — without
  // this, swapping `activePost` to the next/prev post makes expo-image
  // start a fresh fetch+decode right at swipe time, which is exactly the
  // "beat of lag" this is fixing. Only ever the immediate neighbors, per
  // spec — not the whole feed.
  useEffect(() => {
    const neighborUrls = [posts[activeIndex + 1]?.mediaUrl, posts[activeIndex - 1]?.mediaUrl].filter(
      (uri): uri is string => !!uri
    );
    if (neighborUrls.length > 0) {
      ExpoImage.prefetch(neighborUrls).catch(() => {
        // Best-effort — a failed prefetch just means that neighbor loads
        // normally (with its usual latency) when swiped to, not a crash.
      });
    }
  }, [activeIndex, posts]);

  const finishTransition = (direction: 'left' | 'right') => {
    const newIndex = direction === 'left' ? activeIndex + 1 : activeIndex - 1;
    setActiveIndex(newIndex);
    // Snap (invisibly, since opacity is already low) to the opposite edge,
    // then settle the newly-active card in from there in one clean motion.
    translateX.value = direction === 'left' ? CARD_WIDTH : -CARD_WIDTH;
    translateX.value = withSpring(0, DECISIVE_SPRING);
    cardOpacity.value = withTiming(1, { duration: 110 });
  };

  const triggerTransition = (direction: 'left' | 'right') => {
    const leaving = posts[activeIndex];
    onLeavePost(leaving.id, leaving.myReactions.includes('fire'));

    // Quick, single pop-and-fade via withTiming only — no spring-back, so
    // it can't read as part of any card-transition bounce.
    setArrowDirection(direction);
    arrowOpacity.value = withSequence(withTiming(1, { duration: 70 }), withDelay(50, withTiming(0, { duration: 80 })));
    arrowScale.value = withSequence(
      withTiming(1.15, { duration: 70, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 60, easing: Easing.out(Easing.quad) })
    );

    const exitX = direction === 'left' ? -CARD_WIDTH : CARD_WIDTH;
    translateX.value = withTiming(exitX, { duration: SLIDE_OUT_MS, easing: Easing.out(Easing.quad) });
    cardOpacity.value = withTiming(0.25, { duration: SLIDE_OUT_MS }, (finished) => {
      if (finished) runOnJS(finishTransition)(direction);
    });
  };

  const handleSwipeUpToBanter = async () => {
    setBanterMessage('Sending…');
    banterOpacity.value = withTiming(1, { duration: 120 });
    const delivered = await sendPostToBanter(activePost, currentUserId);
    setBanterMessage(delivered ? 'Sent to Banter ✓' : "Couldn't reach this group's Banter thread yet");
    setTimeout(() => {
      banterOpacity.value = withTiming(0, { duration: 200 });
      setTimeout(() => setBanterMessage(null), 220);
    }, 1300);
  };

  const canGoNext = activeIndex < posts.length - 1;
  const canGoPrev = activeIndex > 0;

  const pan = Gesture.Pan()
    // Without a minimum drag distance, this Pan gesture would compete with
    // (and could win over) the reaction pills / comment button / menu
    // button rendered inside SessionPostCard, since RNGH's default
    // activation distance is tiny. Requiring ~12px of movement lets plain
    // taps fall through to those Pressables untouched, while intentional
    // swipes still activate normally.
    .minDistance(12)
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const dx = e.translationX;
      const dy = e.translationY;
      const isVertical = Math.abs(dy) > Math.abs(dx);

      if (isVertical && dy < -V_SWIPE_THRESHOLD) {
        translateX.value = withSpring(0, DECISIVE_SPRING);
        translateY.value = withSpring(0, DECISIVE_SPRING);
        runOnJS(handleSwipeUpToBanter)();
        return;
      }

      if (!isVertical && dx < -H_SWIPE_THRESHOLD && canGoNext) {
        translateY.value = withSpring(0, DECISIVE_SPRING);
        runOnJS(triggerTransition)('left');
        return;
      }

      if (!isVertical && dx > H_SWIPE_THRESHOLD && canGoPrev) {
        translateY.value = withSpring(0, DECISIVE_SPRING);
        runOnJS(triggerTransition)('right');
        return;
      }

      // Didn't clear either threshold — snap back to center, same clean
      // no-overshoot motion as everything else in this file.
      translateX.value = withSpring(0, DECISIVE_SPRING);
      translateY.value = withSpring(0, DECISIVE_SPRING);
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value * 0.4 }],
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
    transform: [{ scale: arrowScale.value }],
  }));

  const banterBannerStyle = useAnimatedStyle(() => ({
    opacity: banterOpacity.value,
  }));

  const nextPost = posts[activeIndex + 1] ?? null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dotsWrap}>
        <PositionDots count={posts.length} activeIndex={activeIndex} />
      </View>

      <View style={styles.stage}>
        {nextPost ? (
          <View style={styles.peekWrap} pointerEvents="none">
            <ExpoImage
              source={{ uri: nextPost.mediaUrl }}
              style={styles.peekImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </View>
        ) : null}

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.activeCardWrap, cardStyle]}>
            <SessionPostCard
              post={activePost}
              currentUserId={currentUserId}
              isHot={isHot(activePost)}
              isPostOfWeek={isPostOfWeek(activePost)}
              streak={streak}
              onToggleReaction={(type) => onToggleReaction(activePost.id, type)}
              onOpenComments={() => onOpenComments(activePost.id)}
              onDelete={() => onDelete(activePost)}
              onReport={(reason) => onReport(activePost, reason)}
              onBlock={() => onBlock(activePost)}
            />
          </Animated.View>
        </GestureDetector>

        {arrowDirection ? (
          <Animated.View style={[styles.arrowWrap, arrowStyle]} pointerEvents="none">
            <Text style={styles.arrowText}>{arrowDirection === 'left' ? '→' : '←'}</Text>
          </Animated.View>
        ) : null}

        {banterMessage ? (
          <Animated.View style={[styles.banterBanner, banterBannerStyle]} pointerEvents="none">
            <Text style={styles.banterBannerText}>{banterMessage}</Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, alignItems: 'center' },
  dotsWrap: { marginBottom: 10 },
  stage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekWrap: {
    position: 'absolute',
    width: CARD_WIDTH * 0.94,
    height: CARD_HEIGHT * 0.94,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    top: 10,
    right: -14,
    transform: [{ rotate: '4deg' }],
    opacity: 0.55,
  },
  peekImage: { width: '100%', height: '100%' },
  activeCardWrap: {
    position: 'absolute',
    width: CARD_WIDTH,
  },
  arrowWrap: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { fontSize: 26, color: ON_DARK_SURFACE, fontWeight: WEIGHT.bold },
  banterBanner: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: RADII.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  banterBannerText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
});
