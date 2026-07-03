import { StyleSheet, Text, View } from 'react-native';

import { ACCENT_ROTATION, BORDER, FONTS, textOnAccent } from '@/constants/style';

function colorForName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return ACCENT_ROTATION[0];

  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = trimmed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ACCENT_ROTATION[Math.abs(hash) % ACCENT_ROTATION.length];
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  name: string;
  size?: number;
};

export function InitialsAvatar({ name, size = 76 }: Props) {
  const backgroundColor = colorForName(name);
  const initials = initialsForName(name);

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor },
      ]}>
      <Text style={[styles.text, { fontSize: size * 0.34, color: textOnAccent(backgroundColor) }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER.width,
    borderColor: BORDER.color,
  },
  text: { fontFamily: FONTS.bodyBold },
});
