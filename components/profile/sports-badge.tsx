import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Text, View, StyleSheet } from 'react-native';
import { WEIGHT, ON_ACCENT } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';

const PENNIE_BLUE = '#2563EB';

export function SportsBadge({ count }: { count: number }) {
  const colors = useThemeColors();

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeWrap}>
        <Svg width={42} height={42} viewBox="0 0 100 100">
          <Path
            d="M15,30 Q15,20 25,20 L75,20 Q85,20 85,30 L85,55 Q85,75 50,85 Q15,75 15,55 Z"
            fill={PENNIE_BLUE}
          />
          <Circle cx={50} cy={25} r={4} fill="white" />
          <Line x1={15} y1={45} x2={85} y2={45} stroke="white" strokeDasharray="4,4" />
        </Svg>
        <View style={styles.countOverlay}>
          <Text style={styles.count}>{count}</Text>
        </View>
      </View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>sports</Text>
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
    paddingTop: 12,
  },
  count: { fontSize: 13, fontWeight: WEIGHT.bold, color: ON_ACCENT },
  label: { fontSize: 11, marginTop: 2 },
});
