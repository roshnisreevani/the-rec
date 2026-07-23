import { Lock, Trophy } from 'lucide-react-native';
import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { LEAGUE_FORMAT_LABELS, type League } from '@/lib/leagues';

type Props = {
  league: League;
  onPress: () => void;
};

export function LeagueCard({ league, onPress }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <AnimatedPressable style={styles.card} onPress={onPress}>
      <View style={styles.topRow}>
        {league.avatarUrl ? (
          <Image source={{ uri: league.avatarUrl }} style={styles.avatar} />
        ) : (
          <InitialsAvatar name={league.name} size={40} />
        )}
        <Text style={styles.name} numberOfLines={1}>
          {league.name}
        </Text>
        {league.privacy === 'private' ? <Lock size={14} color={colors.textSecondary} strokeWidth={2} /> : null}
      </View>

      <View style={styles.typePill}>
        <Text style={styles.typePillText}>{LEAGUE_FORMAT_LABELS[league.format]}</Text>
      </View>

      {league.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {league.description}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Trophy size={13} color={colors.textSecondary} strokeWidth={2} />
          <Text style={styles.footerText}>
            {league.memberCount} member{league.memberCount === 1 ? '' : 's'}
          </Text>
        </View>
        <Text style={styles.footerText} numberOfLines={1}>
          {league.status === 'upcoming' ? 'Registration open' : league.status === 'active' ? 'In progress' : 'Completed'}
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
