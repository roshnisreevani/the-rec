import { Image as ExpoImage } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
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
        const tile = (
          <>
            <ExpoImage source={{ uri: post.mediaUrl }} style={styles.tileImage} contentFit="cover" />
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
