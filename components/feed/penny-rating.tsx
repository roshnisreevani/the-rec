import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { FONTS } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';

const PINNIE_COLORS = ['#D93025', '#E8622A', '#F5C518', '#2E9E52', '#C9A227'];
const PINNIE_LABELS = ['Rough', 'Meh', 'Decent', 'Good', 'Balled out'];

function PinnieIcon({ color, size = 48 }: { color: string; size?: number }) {
  const w = size * (100 / 110);
  const h = size;
  return (
    <Svg width={w} height={h} viewBox="0 0 100 110">
      <Path d="M18,0 L38,0 L38,22 L18,22 Z" fill={color} />
      <Path d="M62,0 L82,0 L82,22 L62,22 Z" fill={color} />
      <Path
        d="M12,14 Q12,8 20,8 L38,8 Q50,22 62,8 L80,8 Q88,8 88,14 L88,96 Q88,104 80,104 L20,104 Q12,104 12,96 Z"
        fill={color}
      />
    </Svg>
  );
}

/** Selector shown in create-post — lets the author pick 1–5. */
export function PennyRatingSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number | null) => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.selectorWrap}>
      <Text style={[styles.sectionLabel, { color: colors.text }]}>Post-game rating</Text>
      <View style={styles.row}>
        {PINNIE_COLORS.map((pinnieColor, i) => {
          const rating = i + 1;
          const selected = value === rating;
          return (
            <Pressable
              key={rating}
              onPress={() => onChange(selected ? null : rating)}
              style={styles.pinnieWrap}
              hitSlop={8}>
              <PinnieIcon color={selected ? pinnieColor : colors.border} size={52} />
              <Text
                style={[
                  styles.pinnieLabel,
                  { color: selected ? pinnieColor : colors.textSecondary },
                ]}>
                {PINNIE_LABELS[i]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Display shown on the post card. */
export function PennyRatingDisplay({ rating }: { rating: number }) {
  const color = PINNIE_COLORS[rating - 1];
  const label = PINNIE_LABELS[rating - 1];

  return (
    <View style={styles.displayWrap}>
      <PinnieIcon color={color} size={22} />
      <Text style={[styles.displayLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  selectorWrap: { gap: 16, alignItems: 'center' },
  sectionLabel: { fontSize: 16, fontFamily: FONTS.displaySemibold, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  pinnieWrap: { alignItems: 'center', gap: 7 },
  pinnieLabel: { fontSize: 11, fontFamily: FONTS.displaySemibold, textAlign: 'center' },
  displayWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  displayLabel: { fontSize: 13, fontFamily: FONTS.displaySemibold },
});
