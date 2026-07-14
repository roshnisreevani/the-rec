import { Image as ExpoImage } from 'expo-image';
import { MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { CARD_WIDTH } from '@/components/feed/card-layout';
import { FlyingReaction } from '@/components/feed/flying-reaction';
import { PostVideo } from '@/components/feed/post-video';
import { GradientScrim } from '@/components/feed/gradient-scrim';
import { ReactionBar } from '@/components/feed/reaction-bar';
import { StreakBadge } from '@/components/feed/streak-badge';
import { ContentMenu } from '@/components/moderation/content-menu';
import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { GOLD, ON_ACCENT, ON_DARK_SURFACE, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { STREAK_DISPLAY_THRESHOLD } from '@/lib/feed-streak';
import type { ReportReason } from '@/lib/moderation';
import type { Post } from '@/lib/posts';
import { SPORTS } from '@/lib/sports';
import type { ReactionType } from '@/lib/reactions';

const DOUBLE_TAP_MS = 280;

type Props = {
  post: Post;
  currentUserId: string;
  isHot: boolean;
  isPostOfWeek: boolean;
  streak: number;
  onToggleReaction: (type: ReactionType) => void;
  onOpenComments: () => void;
  onDelete: () => void;
  onReport: (reason: ReportReason) => void;
  onBlock: () => void;
  // Single tap on the media (double-tap still fires 🔥).
  onOpenPost?: () => void;
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function sportLabel(sportTag: string | null): string {
  const sport = SPORTS.find((s) => s.value === sportTag);
  return sport ? `${sport.emoji} ${sport.label}` : '🏟️ General';
}

/**
 * The full-screen visual treatment for a single post inside a session's
 * swipeable carousel. This is a sibling of (not a replacement for)
 * components/feed/post-card.tsx — that component's compact bordered-list
 * layout is still there and untouched, just no longer used by Feed's new
 * session view. Every piece of actual *behavior* (reactions, comments,
 * report/block/delete, the double-tap-to-fire animation) is the same
 * underlying ReactionBar/ContentMenu/FlyingReaction components and
 * lib/posts.ts + lib/moderation.ts functions, unchanged.
 */
export function SessionPostCard({
  post,
  currentUserId,
  isHot,
  isPostOfWeek,
  streak,
  onToggleReaction,
  onOpenComments,
  onDelete,
  onReport,
  onBlock,
  onOpenPost,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flyKey, setFlyKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwn = post.authorId === currentUserId;
  const hasReactedFire = post.myReactions.includes('fire');
  const showStreak = hasReactedFire && streak >= STREAK_DISPLAY_THRESHOLD;

  // Single tap opens the full-screen post view; double tap fires 🔥. The
  // single-tap action waits out the double-tap window so it never triggers
  // on the first tap of a double.
  const handleMediaPress = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      setFlyKey((k) => k + 1);
      if (!post.myReactions.includes('fire')) {
        onToggleReaction('fire');
      }
    } else if (onOpenPost) {
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        onOpenPost();
      }, DOUBLE_TAP_MS);
    }
    lastTap.current = now;
  };

  return (
    <View style={styles.card}>
      <Pressable onPress={handleMediaPress} style={styles.mediaWrap}>
        {post.mediaType === 'video' ? (
          <PostVideo uri={post.mediaUrl} style={styles.media} />
        ) : (
          // expo-image (not core RN Image) for its memory+disk caching —
          // paired with the adjacent-post prefetch in feed-carousel.tsx,
          // this is what makes the swiped-to photo already be decoded and
          // ready instead of re-fetching on every swipe. contentFit="cover"
          // is explicit (matches core Image's default too, but explicit
          // here since stretching/tiling was one of the things to rule out).
          <ExpoImage
            source={{ uri: post.mediaUrl }}
            style={styles.media}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        )}
        <FlyingReaction triggerKey={flyKey} emoji="🔥" />

        {/* Top overlay: author + badges + menu, plus the swipe-up hint. */}
        <View style={styles.topOverlay}>
          <View style={styles.authorChip}>
            {post.authorAvatarUrl ? (
              <Image source={{ uri: post.authorAvatarUrl }} style={styles.avatarImage} />
            ) : (
              <InitialsAvatar name={post.authorName} size={28} />
            )}
            <View style={styles.authorText}>
              <Text style={styles.authorName} numberOfLines={1}>
                {post.authorName}
              </Text>
              <Text style={styles.timeText} numberOfLines={1}>
                {sportLabel(post.sportTag)} · {timeAgo(post.createdAt)}
              </Text>
            </View>
          </View>

          <View style={styles.topRight}>
            {isPostOfWeek ? (
              <View style={styles.crownBadge}>
                <Text style={styles.crownBadgeText}>👑 Post of the Week</Text>
              </View>
            ) : isHot ? (
              <View style={styles.hotBadge}>
                <Text style={styles.hotBadgeText}>🔥 HOT</Text>
              </View>
            ) : null}
            <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)} hitSlop={8}>
              <MoreHorizontal size={18} color={ON_DARK_SURFACE} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        <View style={styles.swipeHintWrap} pointerEvents="none">
          <Text style={styles.swipeHintText}>↑ swipe up to send to Banter</Text>
        </View>

        {/* Bottom overlay: gradient scrim + caption, directly on the image. */}
        <GradientScrim height={post.caption ? 150 : 90} />
        {post.caption ? (
          <View style={styles.captionWrap} pointerEvents="none">
            <Text style={styles.captionText} numberOfLines={4}>
              {post.caption}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <View style={styles.footer}>
        {showStreak ? (
          <View style={styles.streakWrap}>
            <StreakBadge streak={streak} />
          </View>
        ) : null}
        <View style={styles.footerRow}>
          <ReactionBar
            counts={post.reactionCounts}
            active={post.myReactions}
            onToggle={onToggleReaction}
            onNoWay={() => {}}
          />
          <Pressable style={styles.commentButton} onPress={onOpenComments} hitSlop={8}>
            <MessageCircle size={16} color={colors.blue} strokeWidth={1.75} />
            <Text style={styles.commentCount}>{post.commentCount}</Text>
          </Pressable>
        </View>
      </View>

      <ContentMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        canDelete={isOwn}
        showReportAndBlock={!isOwn}
        authorName={post.authorName}
        onDelete={onDelete}
        onReport={onReport}
        onBlock={onBlock}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: CARD_WIDTH,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      backgroundColor: colors.background,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    mediaWrap: { width: '100%', aspectRatio: 0.82, backgroundColor: colors.borderSoft },
    media: { width: '100%', height: '100%' },
    topOverlay: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    authorChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: RADII.pill,
      paddingVertical: 5,
      paddingHorizontal: 8,
      maxWidth: '62%',
    },
    avatarImage: { width: 28, height: 28, borderRadius: 14 },
    authorText: { gap: 0 },
    authorName: { fontSize: 12, fontWeight: WEIGHT.bold, color: ON_DARK_SURFACE },
    timeText: { fontSize: 10, color: 'rgba(255,255,255,0.75)' },
    topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    hotBadge: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    hotBadgeText: { color: ON_ACCENT, fontSize: 10, fontWeight: WEIGHT.bold },
    crownBadge: {
      backgroundColor: GOLD,
      borderRadius: RADII.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
      maxWidth: 150,
    },
    crownBadgeText: { color: '#3A2E00', fontSize: 10, fontWeight: WEIGHT.bold },
    menuButton: {
      padding: 4,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: RADII.pill,
    },
    swipeHintWrap: {
      position: 'absolute',
      top: 50,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    swipeHintText: {
      fontSize: 10,
      fontWeight: WEIGHT.medium,
      color: 'rgba(255,255,255,0.8)',
      backgroundColor: 'rgba(0,0,0,0.3)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADII.pill,
      overflow: 'hidden',
    },
    captionWrap: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 12,
    },
    captionText: { fontSize: 14, color: ON_DARK_SURFACE, lineHeight: 19, fontWeight: WEIGHT.medium },
    footer: { padding: 12, gap: 8 },
    streakWrap: { alignItems: 'flex-start' },
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    commentButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    commentCount: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.blue },
  });
}
