import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { fetchGroupDetail, type GroupMember } from '@/lib/groups';
import { createPickEm, formatDeadline } from '@/lib/pickem';

const DEFAULT_DEADLINE_LEAD_MS = 24 * 60 * 60 * 1000; // default to this time tomorrow, if enabled

type SideChoice = 'a' | 'b' | null;

export default function CreatePickEmScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sides, setSides] = useState<Record<string, SideChoice>>({});
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Voting deadline is optional — off by default, matching existing
  // Pick'Ems, which never have one.
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState<Date>(() => new Date(Date.now() + DEFAULT_DEADLINE_LEAD_MS));
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);

  useEffect(() => {
    if (!groupId || !userId) return;
    fetchGroupDetail(groupId, userId)
      .then((detail) => setMembers(detail?.members ?? []))
      .catch((e) => Alert.alert('Could not load members', errorMessage(e)))
      .finally(() => setLoadingMembers(false));
  }, [groupId, userId]);

  // Tapping A or B assigns that side; tapping the current side again clears it.
  const setSide = (memberId: string, side: 'a' | 'b') => {
    setSides((prev) => ({ ...prev, [memberId]: prev[memberId] === side ? null : side }));
  };

  const sideA = Object.entries(sides).filter(([, s]) => s === 'a').map(([id]) => id);
  const sideB = Object.entries(sides).filter(([, s]) => s === 'b').map(([id]) => id);
  const canSubmit = sideA.length >= 1 && sideB.length >= 1 && !submitting;

  const handleCreate = async () => {
    if (!groupId || !userId || !canSubmit) return;
    setSubmitting(true);
    try {
      const id = await createPickEm({
        groupId,
        createdBy: userId,
        title: title.trim() || null,
        sideA,
        sideB,
        expiresAt: hasDeadline ? deadline : null,
      });
      router.replace(`/group/pickem/${groupId}?highlight=${id}`);
    } catch (e) {
      Alert.alert('Could not create Pick’Em', errorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>New Pick&rsquo;Em</Text>
        <AnimatedPressable
          style={[styles.createButton, !canSubmit && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit}>
          {submitting ? (
            <ActivityIndicator color={ON_ACCENT} size="small" />
          ) : (
            <Text style={styles.createButtonText}>Post</Text>
          )}
        </AnimatedPressable>
      </View>

      {loadingMembers ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.input}
            placeholder="What's the matchup? (optional)"
            placeholderTextColor={colors.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.hint}>
            Tap A or B to put a member on that side. Each side needs at least one.
          </Text>

          <AnimatedPressable style={styles.deadlineToggleRow} onPress={() => setHasDeadline((v) => !v)}>
            <View style={[styles.checkbox, hasDeadline && styles.checkboxChecked]}>
              {hasDeadline ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.deadlineToggleText}>Set a voting deadline (optional)</Text>
          </AnimatedPressable>

          {hasDeadline ? (
            <View style={styles.deadlineField}>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={deadline}
                  mode="datetime"
                  minimumDate={new Date()}
                  onChange={(_e, selected) => selected && setDeadline(selected)}
                />
              ) : (
                <>
                  <View style={styles.androidDateRow}>
                    <AnimatedPressable style={styles.androidDateButton} onPress={() => setAndroidPicker('date')}>
                      <Text style={styles.androidDateButtonText}>{formatDeadline(deadline.toISOString())}</Text>
                    </AnimatedPressable>
                    <AnimatedPressable style={styles.androidDateButton} onPress={() => setAndroidPicker('time')}>
                      <Text style={styles.androidDateButtonText}>Set time</Text>
                    </AnimatedPressable>
                  </View>
                  {androidPicker ? (
                    <DateTimePicker
                      value={deadline}
                      mode={androidPicker}
                      minimumDate={new Date()}
                      onChange={(_e, selected) => {
                        setAndroidPicker(null);
                        if (selected) setDeadline(selected);
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {members.map((m) => {
            const side = sides[m.userId] ?? null;
            return (
              <View key={m.userId} style={styles.memberRow}>
                {m.avatarUrl ? (
                  <Image source={{ uri: m.avatarUrl }} style={styles.avatar} />
                ) : (
                  <InitialsAvatar name={m.name} size={34} />
                )}
                <Text style={styles.memberName} numberOfLines={1}>
                  {m.name}
                </Text>
                <View style={styles.sideButtons}>
                  <AnimatedPressable
                    style={[styles.sideButton, side === 'a' ? styles.sideButtonAActive : styles.sideButtonIdle]}
                    onPress={() => setSide(m.userId, 'a')}>
                    <Text style={side === 'a' ? styles.sideButtonActiveText : styles.sideButtonIdleText}>A</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[styles.sideButton, side === 'b' ? styles.sideButtonBActive : styles.sideButtonIdle]}
                    onPress={() => setSide(m.userId, 'b')}>
                    <Text style={side === 'b' ? styles.sideButtonActiveText : styles.sideButtonIdleText}>B</Text>
                  </AnimatedPressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
        </KeyboardAvoidingView>
      )}
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
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    createButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 7,
      minWidth: 58,
      alignItems: 'center',
    },
    createButtonDisabled: { opacity: 0.4 },
    createButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.bold, fontSize: 14 },
    spinner: { marginTop: 30 },
    content: { padding: 20, paddingBottom: 48, gap: 12 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontSize: 15,
      color: colors.text,
    },
    hint: { fontSize: 12, color: colors.textSecondary },
    deadlineToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: colors.coral, borderColor: colors.coral },
    checkboxMark: { color: ON_ACCENT, fontSize: 12, fontWeight: WEIGHT.bold },
    deadlineToggleText: { fontSize: 14, color: colors.text },
    deadlineField: { marginTop: -4 },
    androidDateRow: { flexDirection: 'row', gap: 10 },
    androidDateButton: {
      flex: 1,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingVertical: 10,
    },
    androidDateButtonText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 34, height: 34, borderRadius: 17 },
    memberName: { flex: 1, fontSize: 14, fontWeight: WEIGHT.medium, color: colors.text },
    sideButtons: { flexDirection: 'row', gap: 8 },
    sideButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sideButtonIdle: { borderColor: colors.border },
    sideButtonIdleText: { fontSize: 14, fontWeight: WEIGHT.bold, color: colors.text },
    sideButtonAActive: { backgroundColor: colors.coral, borderColor: colors.coral },
    sideButtonBActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    sideButtonActiveText: { fontSize: 14, fontWeight: WEIGHT.bold, color: ON_ACCENT },
  });
}
