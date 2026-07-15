import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Share2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { GAME_DAY_QUIZ, GAME_DAY_TYPES, scoreQuiz, type GameDayType } from '@/lib/gameday-quiz';
import { saveGameDayType } from '@/lib/profile';

/**
 * A short (7-question) personality quiz that sets the "Game-day type" shown
 * on Profile in place of the old Pick Your 3 photo grid. Deliberately not
 * gated on any game history — works for a brand-new user immediately.
 * Result is saved via saveGameDayType (not the full profile form) so this
 * flow doesn't need to know about the rest of the profile.
 */
export default function GameDayQuizScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<GameDayType[]>([]);
  const [saving, setSaving] = useState(false);

  const question = GAME_DAY_QUIZ[index];
  const result = answers.length === GAME_DAY_QUIZ.length ? scoreQuiz(answers) : null;

  const handlePick = (type: GameDayType) => {
    const next = [...answers.slice(0, index), type];
    setAnswers(next);
    if (index < GAME_DAY_QUIZ.length - 1) {
      setIndex(index + 1);
    } else {
      void handleFinish(next);
    }
  };

  const handleFinish = async (finalAnswers: GameDayType[]) => {
    if (!userId) return;
    setSaving(true);
    try {
      await saveGameDayType(userId, scoreQuiz(finalAnswers));
    } catch (e) {
      Alert.alert('Could not save your result', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRetake = () => {
    setAnswers([]);
    setIndex(0);
  };

  const handleBack = () => {
    if (index === 0) {
      router.back();
    } else {
      setIndex(index - 1);
    }
  };

  if (result) {
    const info = GAME_DAY_TYPES[result];
    return (
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <X size={24} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Game-day type</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.resultWrap}>
          <View style={styles.resultCard}>
            <Text style={styles.resultEyebrow}>YOUR GAME-DAY TYPE IS</Text>
            <View style={styles.resultIconBadge}>
              <Text style={styles.resultIconText}>{info.label.replace(/^The /, '')[0]}</Text>
            </View>
            <Text style={styles.resultLabel}>{info.label}</Text>
            <Text style={styles.resultDescription}>{info.description}</Text>

            {saving ? <ActivityIndicator color={colors.textSecondary} style={{ marginBottom: 12 }} /> : null}

            <View style={styles.resultActions}>
              <AnimatedPressable style={styles.secondaryButton} onPress={handleRetake}>
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.primaryButton}
                onPress={() =>
                  Alert.alert('Share', 'Sharing your result card is coming soon.')
                }>
                <Share2 size={15} color={colors.background} strokeWidth={2} />
                <Text style={styles.primaryButtonText}>Share result</Text>
              </AnimatedPressable>
            </View>
          </View>

          <AnimatedPressable onPress={() => router.back()}>
            <Text style={styles.doneLink}>Done</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Game-day type</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.progressRow}>
        {GAME_DAY_QUIZ.map((q, i) => (
          <View key={q.id} style={[styles.progressBar, i <= index && styles.progressBarActive]} />
        ))}
      </View>

      <View style={styles.body}>
        <Text style={styles.questionMeta}>
          QUESTION {index + 1} OF {GAME_DAY_QUIZ.length}
        </Text>
        <Text style={styles.questionPrompt}>{question.prompt}</Text>

        <View style={styles.options}>
          {question.options.map((opt) => (
            <AnimatedPressable key={opt.label} style={styles.option} onPress={() => handlePick(opt.type)}>
              <Text style={styles.optionText}>{opt.label}</Text>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2} />
            </AnimatedPressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, marginBottom: 8 },
    progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft },
    progressBarActive: { backgroundColor: colors.coral },
    body: { paddingHorizontal: 20, paddingTop: 16 },
    questionMeta: { fontSize: 12, color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5 },
    questionPrompt: { fontSize: 19, fontWeight: WEIGHT.semibold, color: colors.text, marginBottom: 22, lineHeight: 26 },
    options: { gap: 10 },
    option: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    optionText: { fontSize: 14, color: colors.text, flex: 1 },
    resultWrap: { flex: 1, paddingHorizontal: 20, justifyContent: 'center', gap: 20 },
    resultCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      padding: 28,
      alignItems: 'center',
    },
    resultEyebrow: { fontSize: 12, color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 14 },
    resultIconBadge: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.coral,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    resultIconText: { fontSize: 28, fontWeight: WEIGHT.bold, color: colors.background },
    resultLabel: { fontSize: 22, fontWeight: WEIGHT.semibold, color: colors.text, marginBottom: 6 },
    resultDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 22,
    },
    resultActions: { flexDirection: 'row', gap: 8, width: '100%' },
    secondaryButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingVertical: 11,
      alignItems: 'center',
    },
    secondaryButtonText: { fontSize: 13, color: colors.text },
    primaryButton: {
      flex: 1,
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 11,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    primaryButtonText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.background },
    doneLink: { textAlign: 'center', fontSize: 13, color: colors.textSecondary },
  });
}
