import { Image as ExpoImage } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { aiModeLabel } from '@/lib/ai-mode-style';
import { totalReactions, type Post } from '@/lib/posts';

type Props = {
  posts: Post[];
  colors: ThemeColors;
  columns?: number;
  // Omit to render a plain, non-interactive grid (e.g. Profile's read-only
  // Featured section — managing what's featured happens from Archive).
  onPressItem?: (post: Post) => void;
};

/**
 * Shared photo-grid tile layout for any list of posts shown outside the main
 * swipeable Feed carousel — used by the Archive screen and Profile's
 * Featured section so both stay visually consistent.
 */
export function PostThumbnailGrid({ posts, colors, columns = 3, onPressItem }: Props) {
  const styles = makeStyles(colors, columns);

  return (
    <View style={styles.grid}>
      {posts.map((post) => {
        // AI highlight shares (post.aiMode set) get a red border + a
        // "Roast Volleyball" mode/sport pill instead of sitting in the grid
        // looking like a plain photo — makes them instantly recognizable as
        // AI content at a glance, matching Feed's trading-card treatment.
        const isAiHighlight = !!post.aiMode;
        const modeSportLabel = isAiHighlight
          ? [aiModeLabel(post.aiMode as string), post.sportTag].filter(Boolean).join(' ')
          : null;

        const tile = (
          <>
            <ExpoImage
              source={{ uri: post.mediaUrl }}
              style={[styles.tileImage, isAiHighlight && styles.tileImageAi]}
              contentFit="cover"
            />
            {modeSportLabel ? (
              <View style={styles.tileAiBadge}>
                <Text style={styles.tileAiBadgeText} numberOfLines={1}>
                  {modeSportLabel}
                </Text>
              </View>
            ) : null}
            <View style={styles.tileFooter}>
              <Text style={styles.tileReactions}>{totalReactions(post)}</Text>
            </View>
          </>
        );

        if (!onPressItem) {
          return (
            <View key={post.id} style={styles.tile}>
              {tile}
            </View>
          );
        }

        return (
          <AnimatedPressable key={post.id} style={styles.tile} onPress={() => onPressItem(post)}>
            {tile}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors, columns: number) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
    tile: { width: `${100 / columns}%`, aspectRatio: 1, padding: 2 },
    tileImage: { flex: 1, borderRadius: RADII.sm, backgroundColor: colors.borderSoft },
    // AI highlight shares get a red ring instead of the plain photo look —
    // matches the "posted" red used on the highlight detail screen's own
    // status badge, so the same color means the same thing app-wide.
    tileImageAi: { borderWidth: 2, borderColor: colors.danger },
    tileAiBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      right: 6,
      backgroundColor: colors.danger,
      borderRadius: RADII.pill,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    tileAiBadgeText: { fontSize: 9, fontWeight: WEIGHT.bold, color: '#FFFFFF', textAlign: 'center' },
    tileFooter: { position: 'absolute', bottom: 6, left: 6 },
    tileReactions: {
      fontSize: 10,
      fontWeight: WEIGHT.semibold,
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: RADII.pill,
      overflow: 'hidden',
    },
  });
}
