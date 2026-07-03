import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BORDER, COLORS, FONTS, RADII } from '@/constants/style';
import type { PickThreeItem } from '@/lib/profile';

export type PickThreeSlot = {
  uri: string | null;
  caption: string;
};

const PLACEHOLDER_CAPTIONS = ['pregame face', 'mid-collapse', 'trophy pose (self-awarded)'];

type EditProps = {
  editing: true;
  slots: PickThreeSlot[];
  onPickPhoto: (index: number) => void;
  onCaptionChange: (index: number, text: string) => void;
};

type ViewProps = {
  editing: false;
  items: PickThreeItem[];
};

type Props = EditProps | ViewProps;

export function PickThreeField(props: Props) {
  if (props.editing) {
    const { slots, onPickPhoto, onCaptionChange } = props;
    return (
      <View style={styles.row}>
        {[0, 1, 2].map((index) => {
          const slot = slots[index] ?? { uri: null, caption: '' };
          return (
            <View key={index} style={styles.column}>
              <Pressable
                style={[styles.square, !slot.uri && styles.squareEmpty]}
                onPress={() => onPickPhoto(index)}>
                {slot.uri ? (
                  <Image source={{ uri: slot.uri }} style={styles.image} />
                ) : (
                  <Text style={styles.plusIcon}>+</Text>
                )}
                {slot.uri ? (
                  <View style={styles.changeBadge}>
                    <Text style={styles.changeBadgeText}>change</Text>
                  </View>
                ) : null}
              </Pressable>
              <TextInput
                style={styles.captionInput}
                placeholder={PLACEHOLDER_CAPTIONS[index]}
                placeholderTextColor="#8A8378"
                value={slot.caption}
                onChangeText={(text) => onCaptionChange(index, text)}
              />
            </View>
          );
        })}
      </View>
    );
  }

  const { items } = props;
  return (
    <View style={styles.row}>
      {[0, 1, 2].map((index) => {
        const item = items[index];
        return (
          <View key={index} style={styles.column}>
            <View style={[styles.square, !item && styles.squareEmpty]}>
              {item ? (
                <Image source={{ uri: item.url }} style={styles.image} />
              ) : (
                <Text style={styles.emptyIcon}>—</Text>
              )}
            </View>
            <Text numberOfLines={2} style={styles.captionText}>
              {item ? item.caption : 'empty pedestal'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  column: { flex: 1, gap: 6 },
  square: {
    aspectRatio: 1,
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderRadius: RADII.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  squareEmpty: { borderStyle: 'dashed' },
  image: { width: '100%', height: '100%' },
  plusIcon: { fontFamily: FONTS.bodyBold, fontSize: 28, color: COLORS.ink, opacity: 0.5 },
  emptyIcon: { fontSize: 20, color: COLORS.ink, opacity: 0.35 },
  changeBadge: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    backgroundColor: COLORS.ink,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  changeBadgeText: { color: COLORS.cream, fontFamily: FONTS.bodyBold, fontSize: 10 },
  captionInput: {
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
  },
  captionText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    color: COLORS.ink,
    opacity: 0.8,
  },
});
