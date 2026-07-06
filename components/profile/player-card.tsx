import { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCodeStyled from 'react-native-qrcode-styled';
import ViewShot from 'react-native-view-shot';

import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';

type Props = {
  name: string;
  profileUrl: string;
};

const CARD_WIDTH = 280;

// The shareable QR card captured for the native share sheet / camera roll,
// intentionally simple per spec: name, a one-line tagline, and the QR code —
// no stats grid, no trophies, no walk-up song.
export const PlayerCard = forwardRef<ViewShot, Props>(function PlayerCard({ name, profileUrl }, ref) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ViewShot ref={ref} options={{ format: 'png', quality: 1 }}>
      <View style={styles.card}>
        <Text style={styles.wordmark}>the rec</Text>
        <Text style={styles.name} numberOfLines={1}>
          {name || 'Nameless legend'}
        </Text>
        <Text style={styles.tagline}>scan to connect on The Rec</Text>

        <View style={styles.qrWrap}>
          {/*
            Rounded coral "eyes" (corner markers) via outerEyesOptions /
            innerEyesOptions — if the installed version of
            react-native-qrcode-styled doesn't support these props it simply
            ignores them and falls back to standard square corners, so this
            never breaks scannability.

            `errorCorrectionLevel` is cast via `as any` below because the
            `qrcode` package (react-native-qrcode-styled's dependency) ships
            no type declarations and this project has no @types/qrcode
            installed, so the re-exported QRCodeOptions type resolves
            incompletely and TS doesn't see this (very real, documented) prop.
          */}
          <QRCodeStyled
            {...({
              data: profileUrl,
              size: 200,
              padding: 16,
              color: colors.text,
              pieceCornerType: 'rounded',
              pieceBorderRadius: 3,
              outerEyesOptions: { borderRadius: 12, color: colors.coral },
              innerEyesOptions: { borderRadius: 6, color: colors.coral },
              errorCorrectionLevel: 'H',
            } as any)}
          />
          {/*
            Centered logo drawn as a manual overlay rather than the library's
            `logo` prop, since we don't have a bundled icon image asset yet.
            Safe because errorCorrectionLevel is "H" (recovers ~30% of the
            code), which is the standard technique for punching a small logo
            into the middle of a QR code without hurting scannability.
          */}
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🏀</Text>
          </View>
        </View>
      </View>
    </ViewShot>
  );
});

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: CARD_WIDTH,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      paddingVertical: 26,
      paddingHorizontal: 24,
      alignItems: 'center',
      gap: 4,
    },
    wordmark: { fontWeight: WEIGHT.bold, fontSize: 13, color: colors.coral, letterSpacing: 0.5 },
    name: { fontWeight: WEIGHT.bold, fontSize: 20, color: colors.text, marginTop: 6, textAlign: 'center' },
    tagline: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
    qrWrap: { alignItems: 'center', justifyContent: 'center' },
    logoBadge: {
      position: 'absolute',
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.coral,
      borderWidth: 3,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoEmoji: { fontSize: 15 },
  });
}
