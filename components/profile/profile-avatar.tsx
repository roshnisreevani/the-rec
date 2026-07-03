import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { BORDER, COLORS } from '@/constants/style';

type Props = {
  name: string;
  photoUri: string | null;
  size?: number;
  editable?: boolean;
  onPress?: () => void;
};

export function ProfileAvatar({ name, photoUri, size = 76, editable, onPress }: Props) {
  const content = photoUri ? (
    <Image
      source={{ uri: photoUri }}
      style={[
        styles.photo,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    />
  ) : (
    <InitialsAvatar name={name} size={size} />
  );

  if (!editable) return content;

  return (
    <Pressable onPress={onPress} hitSlop={6}>
      {content}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>📸</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photo: { borderWidth: BORDER.width, borderColor: BORDER.color },
  badge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.mustard,
    borderWidth: 2,
    borderColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12 },
});
