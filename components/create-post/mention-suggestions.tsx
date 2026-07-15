import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { FONTS, RADII, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import type { FollowUser } from '@/lib/follows';
import { useMemo } from 'react';

type Props = {
  suggestions: FollowUser[];
  onSelect: (user: FollowUser) => void;
};

export function MentionSuggestions({ suggestions, onSelect }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      {suggestions.map((user) => (
        <Pressable key={user.id} style={styles.row} onPress={() => onSelect(user)}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <InitialsAvatar name={user.name} size={32} />
          )}
          <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    avatar: { width: 32, height: 32, borderRadius: 16 },
    name: { fontSize: 14, fontFamily: FONTS.displayMedium, color: colors.text, flex: 1 },
  });
}
