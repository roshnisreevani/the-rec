import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SportPickerField } from '@/components/create-post/sport-picker-field';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  createLeague,
  LEAGUE_FORMATS,
  LEAGUE_FORMAT_LABELS,
  type LeagueFormat,
  type LeaguePrivacy,
} from '@/lib/leagues';
import type { SportTag } from '@/lib/sports';

type DateField = 'opens' | 'closes' | null;

export default function CreateLeagueScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sportTag, setSportTag] = useState<SportTag | null>(null);
  const [format, setFormat] = useState<LeagueFormat>('single_elim');
  const [privacy, setPrivacy] = useState<LeaguePrivacy>('public');
  const [maxMembers, setMaxMembers] = useState('');
  const [entryRequirements, setEntryRequirements] = useState('');
  const [registrationOpensAt, setRegistrationOpensAt] = useState<Date | null>(null);
  const [registrationClosesAt, setRegistrationClosesAt] = useState<Date | null>(null);
  const [openDatePicker, setOpenDatePicker] = useState<DateField>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!userId) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Give your league a name before creating it.');
      return;
    }

    setSaving(true);
    try {
      const league = await createLeague({
        name: trimmedName,
        description: description.trim(),
        sportTag,
        format,
        privacy,
        maxMembers: maxMembers.trim() ? Math.max(0, parseInt(maxMembers, 10)) : null,
        registrationOpensAt: registrationOpensAt ? registrationOpensAt.toISOString() : null,
        registrationClosesAt: registrationClosesAt ? registrationClosesAt.toISOString() : null,
        entryRequirements: entryRequirements.trim(),
        avatarUrl: null,
        createdBy: userId,
      });
      router.replace(`/league/${league.id}`);
    } catch (e) {
      Alert.alert('Could not create league', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const renderDatePicker = (field: Exclude<DateField, null>) => {
    const value = field === 'opens' ? registrationOpensAt : registrationClosesAt;
    const setValue = field === 'opens' ? setRegistrationOpensAt : setRegistrationClosesAt;

    if (Platform.OS === 'ios') {
      return (
        <Modal transparent animationType="slide" visible={openDatePicker === field}>
          <Pressable style={styles.dateModalOverlay} onPress={() => setOpenDatePicker(null)} />
          <View style={[styles.datePickerSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.datePickerHeader}>
              <Pressable onPress={() => setOpenDatePicker(null)}>
                <Text style={[styles.datePickerDone, { color: colors.text }]}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={value ?? new Date()}
              mode="date"
              display="spinner"
              onChange={(_, date) => {
                if (date) setValue(date);
              }}
              themeVariant="light"
            />
          </View>
        </Modal>
      );
    }

    if (openDatePicker !== field) return null;
    return (
      <DateTimePicker
        value={value ?? new Date()}
        mode="date"
        display="default"
        onChange={(_, date) => {
          setOpenDatePicker(null);
          if (date) setValue(date);
        }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Create League</Text>
        <AnimatedPressable style={styles.saveButton} onPress={handleCreate} disabled={saving}>
          {saving ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.saveButtonText}>Create</Text>}
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title="League name" styles={styles}>
            <TextInput
              style={styles.input}
              placeholder="Tuesday Night Hoops League"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </Section>

          <Section title="Description (optional)" styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="What's this league about?"
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </Section>

          <Section title="Sport / activity" styles={styles}>
            <SportPickerField value={sportTag} onChange={setSportTag} />
          </Section>

          <Section title="Format" styles={styles}>
            <View style={styles.pillRow}>
              {LEAGUE_FORMATS.map((f) => {
                const selected = f === format;
                return (
                  <AnimatedPressable
                    key={f}
                    style={[styles.typePill, selected && styles.typePillSelected]}
                    onPress={() => setFormat(f)}>
                    <Text style={[styles.typePillText, selected && styles.typePillTextSelected]}>
                      {LEAGUE_FORMAT_LABELS[f]}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
            {format === 'double_elim' ? (
              <Text style={styles.privacyHint}>
                Double-elimination bracket generation isn&apos;t built yet — you can create the league now and add matches
                manually once it lands.
              </Text>
            ) : null}
          </Section>

          <Section title="Privacy" styles={styles}>
            <View style={styles.pillRow}>
              <AnimatedPressable
                style={[styles.typePill, privacy === 'public' && styles.typePillSelected]}
                onPress={() => setPrivacy('public')}>
                <Text style={[styles.typePillText, privacy === 'public' && styles.typePillTextSelected]}>Public</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.typePill, privacy === 'private' && styles.typePillSelected]}
                onPress={() => setPrivacy('private')}>
                <Text style={[styles.typePillText, privacy === 'private' && styles.typePillTextSelected]}>
                  Private
                </Text>
              </AnimatedPressable>
            </View>
            <Text style={styles.privacyHint}>
              {privacy === 'public'
                ? 'Anyone can find and join this league from Discover, or via an invite link.'
                : 'Only people with an invite link can join.'}
            </Text>
          </Section>

          <Section title="Max members (optional)" styles={styles}>
            <TextInput
              style={styles.input}
              placeholder="No limit"
              placeholderTextColor={colors.textSecondary}
              value={maxMembers}
              onChangeText={(t) => setMaxMembers(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          </Section>

          <Section title="Registration window (optional)" styles={styles}>
            <Pressable style={styles.dateButton} onPress={() => setOpenDatePicker('opens')}>
              <CalendarDays size={16} color={registrationOpensAt ? colors.text : colors.textSecondary} strokeWidth={1.75} />
              <Text style={[styles.dateButtonText, !registrationOpensAt && { color: colors.textSecondary }]}>
                {registrationOpensAt
                  ? `Opens ${registrationOpensAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
                  : 'Opens…'}
              </Text>
            </Pressable>
            {renderDatePicker('opens')}

            <Pressable style={styles.dateButton} onPress={() => setOpenDatePicker('closes')}>
              <CalendarDays size={16} color={registrationClosesAt ? colors.text : colors.textSecondary} strokeWidth={1.75} />
              <Text style={[styles.dateButtonText, !registrationClosesAt && { color: colors.textSecondary }]}>
                {registrationClosesAt
                  ? `Closes ${registrationClosesAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
                  : 'Closes…'}
              </Text>
            </Pressable>
            {renderDatePicker('closes')}
          </Section>

          <Section title="Entry requirements (optional)" styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="e.g. Must be 18+, bring your own paddle…"
              placeholderTextColor={colors.textSecondary}
              value={entryRequirements}
              onChangeText={setEntryRequirements}
              multiline
            />
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children, styles }: { title: string; children: React.ReactNode; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
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
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cancelText: { fontSize: 15, color: colors.textSecondary },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    saveButton: {
      backgroundColor: colors.blue,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 7,
      minWidth: 66,
      alignItems: 'center',
    },
    saveButtonText: { fontWeight: WEIGHT.bold, color: ON_ACCENT, fontSize: 14 },
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    section: { marginTop: 22, gap: 8 },
    sectionTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.background,
    },
    multilineInput: { minHeight: 80, textAlignVertical: 'top' },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typePill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    typePillSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
    typePillText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    typePillTextSelected: { color: ON_ACCENT },
    privacyHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
    },
    dateButtonText: { flex: 1, fontSize: 15, color: colors.text },
    dateModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
    datePickerSheet: {
      borderTopWidth: 1,
      borderTopLeftRadius: RADII.lg,
      borderTopRightRadius: RADII.lg,
      paddingBottom: 30,
    },
    datePickerHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    datePickerDone: { fontSize: 16, fontWeight: WEIGHT.semibold },
  });
}
