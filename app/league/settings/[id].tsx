import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, Lock } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
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

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  fetchLeagueDetail,
  leagueHasMatches,
  updateLeagueSettings,
  LEAGUE_FORMATS,
  LEAGUE_FORMAT_LABELS,
  type League,
  type LeagueFormat,
} from '@/lib/leagues';

type DateField = 'opens' | 'closes' | null;

export default function LeagueSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [league, setLeague] = useState<League | null>(null);
  const [formatLocked, setFormatLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<LeagueFormat>('single_elim');
  const [maxMembers, setMaxMembers] = useState('');
  const [entryRequirements, setEntryRequirements] = useState('');
  const [registrationOpensAt, setRegistrationOpensAt] = useState<Date | null>(null);
  const [registrationClosesAt, setRegistrationClosesAt] = useState<Date | null>(null);
  const [openDatePicker, setOpenDatePicker] = useState<DateField>(null);

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const [detail, hasMatches] = await Promise.all([fetchLeagueDetail(id, userId), leagueHasMatches(id)]);
      if (!detail) {
        Alert.alert('League not found');
        router.back();
        return;
      }
      if (detail.league.myRole !== 'commissioner' && detail.league.myRole !== 'co_commissioner') {
        Alert.alert('Commissioners only', "You don't have permission to edit this league's settings.");
        router.back();
        return;
      }
      const { league: fetchedLeague } = detail;
      setLeague(fetchedLeague);
      setFormatLocked(hasMatches);
      setName(fetchedLeague.name);
      setDescription(fetchedLeague.description);
      setFormat(fetchedLeague.format);
      setMaxMembers(fetchedLeague.maxMembers ? String(fetchedLeague.maxMembers) : '');
      setEntryRequirements(fetchedLeague.entryRequirements);
      setRegistrationOpensAt(fetchedLeague.registrationOpensAt ? new Date(fetchedLeague.registrationOpensAt) : null);
      setRegistrationClosesAt(fetchedLeague.registrationClosesAt ? new Date(fetchedLeague.registrationClosesAt) : null);
    } catch (e) {
      Alert.alert('Could not load settings', errorMessage(e));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSave = async () => {
    if (!id || !league) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Give your league a name.');
      return;
    }
    setSaving(true);
    try {
      await updateLeagueSettings(id, {
        name: trimmedName,
        description: description.trim(),
        format,
        maxMembers: maxMembers.trim() ? Math.max(0, parseInt(maxMembers, 10)) : null,
        registrationOpensAt: registrationOpensAt ? registrationOpensAt.toISOString() : null,
        registrationClosesAt: registrationClosesAt ? registrationClosesAt.toISOString() : null,
        entryRequirements: entryRequirements.trim(),
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save settings', errorMessage(e));
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

  if (loading || !league) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8} disabled={saving}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>League Settings</Text>
        <AnimatedPressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
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
            />
          </Section>

          <Section title="Description" styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="What's this league about?"
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </Section>

          <Section title="Format" styles={styles}>
            {formatLocked ? (
              <View style={styles.lockedBox}>
                <Lock size={13} color={colors.textSecondary} strokeWidth={2} />
                <Text style={styles.lockedText}>
                  {LEAGUE_FORMAT_LABELS[format]} — format can&apos;t be changed once the schedule has matches. Delete the
                  league and recreate it to pick a different format.
                </Text>
              </View>
            ) : (
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
            )}
          </Section>

          <Section title="Max members" styles={styles}>
            <TextInput
              style={styles.input}
              placeholder="No limit"
              placeholderTextColor={colors.textSecondary}
              value={maxMembers}
              onChangeText={(t) => setMaxMembers(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          </Section>

          <Section title="Registration window" styles={styles}>
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

          <Section title="Entry requirements" styles={styles}>
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
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
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
    lockedBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 10,
      borderRadius: RADII.md,
      backgroundColor: colors.borderSoft,
    },
    lockedText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
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
