import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SportPickerField } from '@/components/create-post/sport-picker-field';
import { GameMap } from '@/components/open-games/game-map';
import { MapPickerModal } from '@/components/open-games/map-picker-modal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { formatEventDate } from '@/lib/events';
import { SKILL_LEVEL_LABELS, type SkillLevel } from '@/lib/open-games';
import { type SportTag } from '@/lib/sports';

const SKILL_LEVELS: SkillLevel[] = ['all', 'beginner', 'competitive'];

function defaultStartTime(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

export type OpenGameFormValues = {
  sport: string;
  title: string;
  description: string;
  skillLevel: SkillLevel;
  locationName: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  maxSpots: number | null;
  requiresApproval: boolean;
  photosPublic: boolean;
};

type Props = {
  mode: 'create' | 'edit';
  initialValues?: Partial<OpenGameFormValues>;
  onSubmit: (values: OpenGameFormValues) => Promise<void>;
};

export function OpenGameForm({ mode, initialValues, onSubmit }: Props) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sport, setSport] = useState<SportTag | null>(initialValues?.sport ?? null);
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(initialValues?.skillLevel ?? 'all');
  const [locationName, setLocationName] = useState(initialValues?.locationName ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialValues?.latitude !== undefined && initialValues?.longitude !== undefined
      ? { lat: initialValues.latitude, lng: initialValues.longitude }
      : null
  );
  const [maxSpots, setMaxSpots] = useState(initialValues?.maxSpots ? String(initialValues.maxSpots) : '');
  const [startsAt, setStartsAt] = useState<Date>(
    initialValues?.startsAt ? new Date(initialValues.startsAt) : defaultStartTime()
  );
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(initialValues?.requiresApproval ?? false);
  const [photosPublic, setPhotosPublic] = useState(initialValues?.photosPublic ?? false);
  const [saving, setSaving] = useState(false);

  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedLocation = locationName.trim();
    if (!sport) {
      Alert.alert('Pick a sport', 'Choose what sport this game is for.');
      return;
    }
    if (!trimmedTitle) {
      Alert.alert('Name required', 'Give your game a title.');
      return;
    }
    if (!trimmedLocation || !coords) {
      Alert.alert('Location required', 'Enter where it is, or tap the map to drop a pin.');
      return;
    }
    if (startsAt.getTime() < Date.now()) {
      Alert.alert('Pick a future time', "This game's start time is in the past.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        sport: sport as SportTag,
        title: trimmedTitle,
        description: description.trim(),
        skillLevel,
        locationName: trimmedLocation,
        latitude: coords.lat,
        longitude: coords.lng,
        startsAt: startsAt.toISOString(),
        maxSpots: maxSpots.trim() ? parseInt(maxSpots.trim(), 10) : null,
        requiresApproval,
        photosPublic,
      });
    } catch (e) {
      const raw = errorMessage(e);
      // The RLS policy that gates posting a game (verified account, 3+ days
      // old) fails with raw Postgres "row-level security policy" text, which
      // reads as a broken app rather than an explainable rule — translate it
      // to the actual requirement instead.
      const friendly = /row-level security policy/i.test(raw)
        ? "You need a verified account that's at least 3 days old to post a game. Verify your account in Settings if you haven't yet."
        : raw;
      Alert.alert(mode === 'create' ? 'Could not post game' : 'Could not save changes', friendly);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
        <Text style={styles.headerTitle}>{mode === 'create' ? 'Post Open Game' : 'Edit Game'}</Text>
        <AnimatedPressable style={styles.saveButton} onPress={handleSubmit} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={ON_ACCENT} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>{mode === 'create' ? 'Post' : 'Save'}</Text>
          )}
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title="Sport" styles={styles}>
            <SportPickerField value={sport} onChange={setSport} />
          </Section>

          <Section title="Title" styles={styles}>
            <TextInput
              style={styles.input}
              placeholder="Sunday pickup run"
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />
          </Section>

          <Section title="Details (optional)" styles={styles}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Bring your own ball, we'll do full court"
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </Section>

          <Section title="Skill level" styles={styles}>
            <View style={styles.pillRow}>
              {SKILL_LEVELS.map((level) => {
                const selected = level === skillLevel;
                return (
                  <AnimatedPressable
                    key={level}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => setSkillLevel(level)}>
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                      {SKILL_LEVEL_LABELS[level]}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </Section>

          <Section title="When" styles={styles}>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={startsAt}
                mode="datetime"
                minimumDate={new Date()}
                onChange={(_e, selected) => selected && setStartsAt(selected)}
              />
            ) : (
              <>
                <View style={styles.androidDateRow}>
                  <AnimatedPressable style={styles.androidDateButton} onPress={() => setAndroidPicker('date')}>
                    <Calendar size={15} color={colors.text} strokeWidth={2} />
                    <Text style={styles.androidDateButtonText}>{formatEventDate(startsAt.toISOString())}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.androidDateButton} onPress={() => setAndroidPicker('time')}>
                    <Text style={styles.androidDateButtonText}>Change</Text>
                  </AnimatedPressable>
                </View>
                {androidPicker ? (
                  <DateTimePicker
                    value={startsAt}
                    mode={androidPicker}
                    minimumDate={new Date()}
                    onChange={(_e, selected) => {
                      setAndroidPicker(null);
                      if (selected) setStartsAt(selected);
                    }}
                  />
                ) : null}
              </>
            )}
          </Section>

          <Section title="Location" styles={styles}>
            {coords ? (
              <AnimatedPressable style={styles.mapPreviewWrap} onPress={() => setMapPickerOpen(true)}>
                <GameMap latitude={coords.lat} longitude={coords.lng} height={140} />
                <View style={styles.mapPreviewFooter}>
                  <Text style={styles.mapPreviewText} numberOfLines={1}>
                    {locationName || 'Dropped pin'}
                  </Text>
                  <Text style={styles.mapPreviewChange}>Change</Text>
                </View>
              </AnimatedPressable>
            ) : (
              <AnimatedPressable style={styles.mapPickerTrigger} onPress={() => setMapPickerOpen(true)}>
                <Text style={styles.mapPickerTriggerText}>Choose location on map</Text>
              </AnimatedPressable>
            )}

            <MapPickerModal
              visible={mapPickerOpen}
              initialCoords={coords}
              initialLocationName={locationName}
              onClose={() => setMapPickerOpen(false)}
              onConfirm={(nextCoords, nextName) => {
                setCoords(nextCoords);
                setLocationName(nextName);
                setMapPickerOpen(false);
              }}
            />
          </Section>

          <Section title="Max spots (optional)" styles={styles}>
            <TextInput
              style={styles.input}
              placeholder="e.g. 10"
              placeholderTextColor={colors.textSecondary}
              value={maxSpots}
              onChangeText={setMaxSpots}
              keyboardType="number-pad"
            />
          </Section>

          <Section title="Join requests" styles={styles}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Require approval</Text>
                <Text style={styles.toggleHint}>
                  {requiresApproval
                    ? "People send a request with a short note — you approve or decline each one."
                    : 'Anyone eligible can join instantly, no approval needed.'}
                </Text>
              </View>
              <Switch
                value={requiresApproval}
                onValueChange={setRequiresApproval}
                trackColor={{ true: colors.coral, false: colors.border }}
                thumbColor={ON_ACCENT}
              />
            </View>
          </Section>

          <Section title="Photos" styles={styles}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Make photos public</Text>
                <Text style={styles.toggleHint}>
                  {photosPublic
                    ? 'Anyone browsing Discover can see photos from this game, even if they never joined.'
                    : 'Only people who joined this game can see its photos.'}
                </Text>
              </View>
              <Switch
                value={photosPublic}
                onValueChange={setPhotosPublic}
                trackColor={{ true: colors.coral, false: colors.border }}
                thumbColor={ON_ACCENT}
              />
            </View>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Section({
  title,
  children,
  styles,
}: {
  title: string;
  children: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
}) {
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
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 7,
      minWidth: 56,
      alignItems: 'center',
    },
    saveButtonText: { fontWeight: WEIGHT.bold, color: ON_ACCENT, fontSize: 14 },
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    section: { marginTop: 20, gap: 8 },
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
    multilineInput: { minHeight: 70, textAlignVertical: 'top' },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    toggleText: { flex: 1, gap: 2 },
    toggleLabel: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    toggleHint: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    pillSelected: { backgroundColor: colors.coral, borderColor: colors.coral },
    pillText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    pillTextSelected: { color: ON_ACCENT },
    mapPickerTrigger: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    mapPickerTriggerText: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    mapPreviewWrap: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      overflow: 'hidden',
    },
    mapPreviewFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    mapPreviewText: { flex: 1, fontSize: 13, color: colors.text },
    mapPreviewChange: { fontSize: 12, fontWeight: WEIGHT.bold, color: colors.coral },
    androidDateRow: { flexDirection: 'row', gap: 8 },
    androidDateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    androidDateButtonText: { fontSize: 14, fontWeight: WEIGHT.medium, color: colors.text },
  });
}
