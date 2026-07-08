import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const MAX_OPACITY = 0.78;

/**
 * A real smooth bottom-up black gradient for caption legibility over a
 * photo, rendered with react-native-svg (already a dependency here via the
 * QR code screen) so it's GPU-interpolated rather than approximated.
 *
 * This replaces a previous version that stacked 8 solid rgba(...) bands to
 * fake a gradient — that produced visible horizontal banding/step artifacts
 * right where the fade was steepest (near the bottom of the photo, just
 * above the reaction row), which is what this component was actually
 * responsible for. expo-linear-gradient isn't installed and this sandbox
 * has no network access to add it, but react-native-svg's LinearGradient
 * does the same job with zero banding and no new dependency.
 */
export function GradientScrim({ height = 140 }: { height?: number }) {
  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="feedCaptionScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={MAX_OPACITY} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#feedCaptionScrim)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
