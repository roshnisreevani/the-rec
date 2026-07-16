import { useRouter } from 'expo-router';
import { Pencil, Users } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CARD_WIDTH } from '@/components/feed/card-layout';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';

const MOTTOS = [
  "Your friends were out here. Where were you? 👀",
  "Everyone showed up. The feed's waiting on you. ⏳",
  "This all happened without you. Just saying. 🤷",
  "They played, they posted. Your move. 🏃",
  "Your crew's got receipts. Do you? 📸",
  "The squad's been cooking. You still ordering takeout? 👀",
  "All this happened while you were thinking about it. 😬",
  "Don't let your friends have all the highlights. 🎬",
  "Everyone's got a story. What's yours? 🤔",
  "The bench misses you less than the court does. 🪑",
  "Your friends didn't sit this one out. Will you? 😤",
  "This is what you missed. Don't miss the next one. 🔔",
  "The group chat already saw this. Now show them yours. 💬",
  "They showed up. They balled. They posted. Your turn. 💪",
];

function getDailyMotto(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return MOTTOS[dayOfYear % MOTTOS.length];
}

export function FeedEndCard() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>🏁</Text>
      <Text style={styles.title}>You're all caught up</Text>
      <Text style={styles.motto}>{getDailyMotto()}</Text>

      <View style={styles.actions}>
        <AnimatedPressable style={styles.actionButton} onPress={() => router.push('/create-post')}>
          <Pencil size={15} color={colors.text} strokeWidth={1.75} />
          <Text style={styles.actionButtonText}>Post something</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.actionButton} onPress={() => router.push('/(tabs)/groups')}>
          <Users size={15} color={colors.text} strokeWidth={1.75} />
          <Text style={styles.actionButtonText}>Check Teams</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: CARD_WIDTH,
      alignSelf: 'center',
      borderRadius: RADII.lg,
      backgroundColor: colors.borderSoft,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    emoji: { fontSize: 36 },
    title: { fontSize: 17, fontWeight: WEIGHT.bold, color: colors.text },
    motto: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      fontStyle: 'italic',
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 10,
      marginTop: 8,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    actionButtonText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
  });
}
