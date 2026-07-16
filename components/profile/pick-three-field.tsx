import { Image } from 'expo-image';
import { Plus, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
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
  onRemovePhoto?: (index: number) => void;
};

type ViewProps = {
  editing: false;
  items: PickThreeItem[];
  onPressItem?: (index: number) => void; // tap a filled photo to open it larger
};

type Props = EditProps | ViewProps;

export function PickThreeField(props: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (props.editing) {
    const { slots, onPickPhoto, onCaptionChange, onRemovePhoto } = props;
    return (
      <View style={styles.row}>
        {[0, 1, 2].map((index) => {
          const slot = slots[index] ?? { uri: null, caption: '' };
          return (
            <View key={index} style={styles.column}>
              <AnimatedPressable
                style={[styles.square, !slot.uri && styles.squareEmpty]}
                onPress={() => onPickPhoto(index)}>
                {slot.uri ? (
                  <Image source={{ uri: slot.uri }} style={styles.image} cachePolicy="disk" />
                ) : (
                  <Plus size={26} color={colors.textSecondary} strokeWidth={1.75} />
                )}
                {slot.uri ? (
                  <View style={styles.changeBadge}>
                    <Text style={styles.changeBadgeText}>change</Text>
                  </View>
                ) : null}
              </AnimatedPressable>
              {slot.uri && onRemovePhoto ? (
                <AnimatedPressable
                  style={styles.removeBadge}
                  hitSlop={8}
                  onPress={() => onRemovePhoto(index)}>
                  <X size={12} color="#FFFFFF" strokeWidth={2.5} />
                </AnimatedPressable>
              ) : null}
              <TextInput
                style={styles.captionInput}
                placeholder={PLACEHOLDER_CAPTIONS[index]}
                placeholderTextColor={colors.textSecondary}
                value={slot.caption}
                onChangeText={(text) => onCaptionChange(index, text)}
              />
            </View>
          );
        })}
      </View>
    );
  }

  const { items, onPressItem } = props;
  return (
    <View style={styles.row}>
      {[0, 1, 2].map((index) => {
        const item = items[index];
        const square = (
          <View style={[styles.square, !item && styles.squareEmpty]}>
            {item ? <Image source={{ uri: item.url }} style={styles.image} cachePolicy="disk" /> : null}
          </View>
        );
        return (
          <View key={index} style={styles.column}>
            {item && onPressItem ? (
              <AnimatedPressable onPress={() => onPressItem(index)}>{square}</AnimatedPressable>
            ) : (
              square
            )}
            {item ? (
              <Text numberOfLines={2} style={styles.captionText}>
                {item.caption}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 10 },
    column: { flex: 1, gap: 6, position: 'relative' },
    square: {
      aspectRatio: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    squareEmpty: { borderStyle: 'dashed' },
    image: { width: '100%', height: '100%' },
    changeBadge: {
      position: 'absolute',
      bottom: 4,
      alignSelf: 'center',
      backgroundColor: colors.text,
      borderRadius: RADII.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    changeBadgeText: { color: colors.background, fontWeight: '700', fontSize: 10 },
    removeBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    captionInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.sm,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 12,
      color: colors.text,
      backgroundColor: colors.background,
    },
    captionText: {
      fontSize: 12,
      textAlign: 'center',
      fontStyle: 'italic',
      color: colors.textSecondary,
    },
  });
}
