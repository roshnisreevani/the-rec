import Svg, { G, Path } from 'react-native-svg';
import { Text, View, StyleSheet } from 'react-native';
import { WEIGHT, ON_ACCENT } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';

const PENNIE_BLUE = '#2563EB';

const BIB_PATH =
  'M18,0 L38,0 L38,22 L18,22 Z M62,0 L82,0 L82,22 L62,22 Z M12,14 Q12,8 20,8 L38,8 Q50,22 62,8 L80,8 Q88,8 88,14 L88,96 Q88,104 80,104 L20,104 Q12,104 12,96 Z';

export function GroupsBadge({ count }: { count: number }) {
  const colors = useThemeColors();

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeWrap}>
        <Svg width={44} height={40} viewBox="0 0 100 90">
          <G transform="translate(2,10) scale(0.55)" opacity={0.4}>
            <Path d={BIB_PATH} fill={PENNIE_BLUE} />
          </G>
          <G transform="translate(24,10) scale(0.55)" opacity={0.7}>
            <Path d={BIB_PATH} fill={PENNIE_BLUE} />
          </G>
          <G transform="translate(46,10) scale(0.55)">
            <Path d={BIB_PATH} fill={PENNIE_BLUE} />
          </G>
        </Svg>
        <View style={styles.countOverlay}>
          <Text style={styles.count}>{count}</Text>
        </View>
      </View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>groups</Text>
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
    paddingTop: 6,
    paddingLeft: 8,
  },
  count: { fontSize: 13, fontWeight: WEIGHT.bold, color: ON_ACCENT },
  label: { fontSize: 11, marginTop: 2 },
});
