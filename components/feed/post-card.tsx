import * as Haptics from 'expo-haptics';
import { MapPin, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ContentMenu } from '@/components/moderation/content-menu';
import { FlyingReaction } from '@/components/feed/flying-reaction';
import { PostVideo } from '@/components/feed/post-video';
import { ReactionBar } from '@/components/feed/reaction-bar';
import { ShareSheet } from '@/components/feed/share-sheet';
import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { GOLD, ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
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
  isNew?: boolean;
  onToggleReaction: (type: ReactionType) => void;
  onOpenComments: () => void;
  onDelete: () => void;
  onReport: (reason: ReportReason) => void;
  onBlock: () => void;
  onReshare: () => void;
  // Single tap on the media (double-tap still fires 🔥). Omit where the
  // card already IS the full-screen view.
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

export function PostCard({
  post,
  currentUserId,
  isHot,
  isPostOfWeek,
  isNew,
  onToggleReaction,
  onOpenComments,
  onDelete,
  onReport,
  onBlock,
  onReshare,
  onOpenPost,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flyKey, setFlyKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const isOwn = post.authorId === currentUserId;

  const shakeX = useSharedValue(0);
  const entranceY = useSharedValue(isNew ? -32 : 0);
  const entranceOpacity = useSharedValue(isNew ? 0 : 1);

  useEffect(() => {
    if (isNew) {
      entranceY.value = withSpring(0, { damping: 12, stiffness: 140 });
      entranceOpacity.value = withTiming(1, { duration: 260 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: entranceOpacity.value,
    transform: [{ translateY: entranceY.value }, { translateX: shakeX.value }],
  }));

  const handleShake = () => {
    shakeX.value = withSequence(
      withTiming(-6, { duration: 45, easing: Easing.linear }),
      withTiming(6, { duration: 45 }),
      withTiming(-5, { duration: 45 }),
      withTiming(5, { duration: 45 }),
      withTiming(0, { duration: 45 })
    );
  };

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    <Animated.View style={[styles.card, isPostOfWeek && styles.cardPostOfWeek, cardStyle]}>
      {post.resharedFromAuthorName ? (
        <Text style={styles.reshareLabel}>🔁 Reshared from {post.resharedFromAuthorName}</Text>
      ) : null}
      <View style={styles.header}>
        {post.authorAvatarUrl ? (
          <Image source={{ uri: post.authorAvatarUrl }} style={styles.avatarImage} />
        ) : (
          <InitialsAvatar name={post.authorName} size={34} />
        )}
        <View style={styles.headerText}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.authorName}
          </Text>
          <Text style={styles.groupLine} numberOfLines={1}>
            {sportLabel(post.sportTag)} · {timeAgo(post.createdAt)}
          </Text>
          {post.location ? (
            <View style={styles.locationLine}>
              <MapPin size={11} color={colors.textSecondary} strokeWidth={1.75} />
              <Text style={styles.locationText} numberOfLines={1}>
                {post.location}
              </Text>
            </View>
          ) : null}
        </View>

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
          <MoreHorizontal size={18} color={colors.textSecondary} strokeWidth={1.75} />
        </Pressable>
      </View>

      <Pressable onPress={handleMediaPress}>
        <View style={styles.mediaWrap}>
          {post.mediaType === 'video' ? (
            <PostVideo uri={post.mediaUrl} style={styles.media} />
          ) : (
            <Image source={{ uri: post.mediaUrl }} style={styles.media} />
          )}
          <FlyingReaction triggerKey={flyKey} emoji="🔥" />
        </View>
      </Pressable>

      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

      <View style={styles.footer}>
        <ReactionBar
          postId={post.id}
          counts={post.reactionCounts}
          active={post.myReactions}
          onToggle={onToggleReaction}
          onOpenShare={() => setShareSheetOpen(true)}
        />

        <Pressable style={styles.commentButton} onPress={onOpenComments} hitSlop={8}>
          <MessageCircle size={16} color={colors.blue} strokeWidth={1.75} />
          <Text style={styles.commentCount}>{post.commentCount}</Text>
        </Pressable>
      </View>

      <ShareSheet
        visible={shareSheetOpen}
        post={post}
        currentUserId={currentUserId}
        onClose={() => setShareSheetOpen(false)}
        onReshare={onReshare}
      />

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
    </Animated.View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      backgroundColor: colors.background,
      padding: 14,
      gap: 10,
      marginBottom: 16,
    },
    cardPostOfWeek: {
      borderColor: GOLD,
      borderWidth: 2,
      shadowColor: GOLD,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: 3,
    },
    reshareLabel: { fontSize: 11, fontWeight: WEIGHT.medium, color: colors.textSecondary },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatarImage: { width: 34, height: 34, borderRadius: 17 },
    headerText: { flex: 1, gap: 1 },
    authorName: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    groupLine: { fontSize: 11, color: colors.textSecondary },
    locationLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    locationText: { fontSize: 11, color: colors.textSecondary },
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
    menuButton: { padding: 2 },
    mediaWrap: {
      borderRadius: RADII.md,
      overflow: 'hidden',
      backgroundColor: colors.borderSoft,
    },
    media: { width: '100%', aspectRatio: 1, backgroundColor: colors.borderSoft },
    caption: { fontSize: 14, color: colors.text, lineHeight: 19 },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    commentButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    commentCount: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.blue },
  });
}
