import Svg, { Path } from 'react-native-svg';
import { Text, View, StyleSheet } from 'react-native';
import { WEIGHT, ON_ACCENT } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';

const PENNIE_BLUE = '#2563EB';

export function PennieBadge({ count }: { count: number }) {
  const colors = useThemeColors();

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeWrap}>
        <Svg width={38} height={42} viewBox="0 0 100 110">
          <Path d="M18,0 L38,0 L38,22 L18,22 Z" fill={PENNIE_BLUE} />
          <Path d="M62,0 L82,0 L82,22 L62,22 Z" fill={PENNIE_BLUE} />
          <Path
            d="M12,14 Q12,8 20,8 L38,8 Q50,22 62,8 L80,8 Q88,8 88,14 L88,96 Q88,104 80,104 L20,104 Q12,104 12,96 Z"
            fill={PENNIE_BLUE}
          />
        </Svg>
        <View style={styles.countOverlay}>
          <Text style={styles.count}>{count}</Text>
        </View>
      </View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>pennies</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  badgeWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  countOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  count: { fontSize: 13, fontWeight: WEIGHT.bold, color: ON_ACCENT },
  label: { fontSize: 11, marginTop: 2 },
});
