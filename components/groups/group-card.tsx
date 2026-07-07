import { Lock, Users2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { GROUP_TYPE_LABELS, type Group } from '@/lib/groups';

type Props = {
  group: Group;
  onPress: () => void;
};

export function GroupCard({ group, onPress }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <AnimatedPressable style={styles.card} onPress={onPress}>
      <View style={styles.topRow}>
        {group.avatarUrl ? (
          <Image source={{ uri: group.avatarUrl }} style={styles.avatar} />
        ) : (
          <InitialsAvatar name={group.name} size={40} />
        )}
        <Text style={styles.name} numberOfLines={1}>
          {group.name}
        </Text>
        {group.privacy === 'private' ? <Lock size={14} color={colors.textSecondary} strokeWidth={2} /> : null}
      </View>

      <View style={styles.typePill}>
        <Text style={styles.typePillText}>{GROUP_TYPE_LABELS[group.groupType]}</Text>
      </View>

      {group.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {group.description}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Users2 size={13} color={colors.textSecondary} strokeWidth={2} />
          <Text style={styles.footerText}>
            {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
          </Text>
        </View>
        <Text style={styles.footerText} numberOfLines={1}>
          {group.activityPreview}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      backgroundColor: colors.background,
      padding: 14,
      gap: 8,
      marginBottom: 14,
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    name: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text, flex: 1 },
    typePill: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    typePillText: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    description: { fontSize: 13, color: colors.text },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    footerText: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  });
}
