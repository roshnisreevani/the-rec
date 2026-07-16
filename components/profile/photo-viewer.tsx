import { Image as ExpoImage } from 'expo-image';
import { X } from 'lucide-react-native';
import { useMemo } from 'react';
import { Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { WEIGHT } from '@/constants/style';

export type ViewerPhoto = { url: string; caption?: string };

type Props = {
  photos: ViewerPhoto[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
};

/**
 * Full-screen photo viewer for the profile's Pick Your 3 grid: fade-in dark
 * overlay, tap-outside or X to dismiss, horizontal swipe between photos.
 * Models the existing profile avatar-viewer conventions (fade modal, dark
 * backdrop, top-right X) — no reusable lightbox existed to share.
 */
export function PhotoViewer({ photos, initialIndex, visible, onClose }: Props) {
  const width = Dimensions.get('window').width;
  const styles = useMemo(() => makeStyles(width), [width]);
  // Clamp so a stale index can never scroll past the list.
  const startIndex = Math.min(Math.max(initialIndex, 0), Math.max(photos.length - 1, 0));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FlatList
          data={photos}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item }) => (
            // Tapping the page (anywhere but a swipe) dismisses.
            <Pressable style={styles.page} onPress={onClose}>
              <ExpoImage source={{ uri: item.url }} style={styles.image} contentFit="contain" cachePolicy="disk" />
              {item.caption ? (
                <View style={styles.captionWrap} pointerEvents="none">
                  <Text style={styles.caption}>{item.caption}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />

        {photos.length > 1 ? (
          <View style={styles.counterWrap} pointerEvents="none">
            <Text style={styles.counter}>{photos.length} photos · swipe to browse</Text>
          </View>
        ) : null}

        <AnimatedPressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
          <X size={26} color="#FFFFFF" strokeWidth={2} />
        </AnimatedPressable>
      </View>
    </Modal>
  );
}

function makeStyles(width: number) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
    page: { width, flex: 1, alignItems: 'center', justifyContent: 'center' },
    image: { width: '100%', height: '80%' },
    captionWrap: { position: 'absolute', bottom: 72, left: 24, right: 24, alignItems: 'center' },
    caption: { color: '#FFFFFF', fontSize: 15, fontWeight: WEIGHT.medium, textAlign: 'center' },
    counterWrap: { position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center' },
    counter: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: WEIGHT.semibold },
    closeButton: { position: 'absolute', top: 60, right: 24 },
  });
}
