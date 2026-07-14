import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Minus, Plus, Settings2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  fetchLeaderboard,
  saveLeaderboardEntry,
  updateLeaderboardSettings,
  type EntryStats,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardSettings,
} from '@/lib/leaderboard';

const COL_WIDTH = 44;

function pctLabel(winPct: number | null): string {
  return winPct === null ? '—' : `${Math.round(winPct * 100)}%`;
}

export default function GroupLeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaderboardEntry | null>(null);
  const [draft, setDraft] = useState<EntryStats>({ wins: 0, losses: 0, gamesPlayed: 0, attendance: 0 });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const fetched = await fetchLeaderboard(id, userId);
      if (!fetched) {
        Alert.alert('Group not found', "This group doesn't exist or you're no longer a member.");
        router.back();
        return;
      }
      setBoard(fetched);
    } catch (e) {
      Alert.alert('Could not load leaderboard', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const settings = board?.settings;
  const canEdit = !!board && (board.isCommissioner || board.settings.editMode === 'anyone');

  // Columns adapt to the tracked metrics — only flagged ones render.
  const columns = useMemo(() => {
    if (!settings) return [];
    const cols: { key: string; label: string; value: (e: LeaderboardEntry) => string }[] = [];
    if (settings.trackWinsLosses) {
      cols.push({ key: 'w', label: 'W', value: (e) => String(e.wins) });
      cols.push({ key: 'l', label: 'L', value: (e) => String(e.losses) });
    }
    if (settings.trackGamesPlayed) {
      cols.push({ key: 'gp', label: 'GP', value: (e) => String(e.gamesPlayed) });
    }
    if (settings.trackWinPct) {
      cols.push({ key: 'pct', label: 'W%', value: (e) => pctLabel(e.winPct) });
    }
    if (settings.trackAttendance) {
      cols.push({ key: 'att', label: 'ATT', value: (e) => String(e.attendance) });
    }
    return cols;
  }, [settings]);

  const openEditor = (entry: LeaderboardEntry) => {
    if (!canEdit) return;
    setDraft({
      wins: entry.wins,
      losses: entry.losses,
      gamesPlayed: entry.gamesPlayed,
      attendance: entry.attendance,
    });
    setEditTarget(entry);
  };

  // W/L steppers move GP with them (a decided game was played); GP stays
  // independently steppable for games without a result.
  const bump = (field: keyof EntryStats, delta: number) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: Math.max(0, prev[field] + delta) };
      if ((field === 'wins' || field === 'losses') && next[field] !== prev[field]) {
        next.gamesPlayed = Math.max(0, next.gamesPlayed + delta);
      }
      return next;
    });
  };

  const handleSaveEntry = async () => {
    if (!id || !editTarget) return;
    setSaving(true);
    try {
      await saveLeaderboardEntry(id, editTarget.userId, draft);
      setEditTarget(null);
      await load();
    } catch (e) {
      Alert.alert('Could not save entry', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // Commissioner settings: each change saves immediately, optimistically.
  const applySettings = async (next: LeaderboardSettings) => {
    if (!id || !board) return;
    const prev = board.settings;
    setBoard({ ...board, settings: next });
    try {
      await updateLeaderboardSettings(id, next);
      load();
    } catch (e) {
      setBoard((b) => (b ? { ...b, settings: prev } : b));
      Alert.alert('Could not update settings', errorMessage(e));
    }
  };

  const showWLSteppers = !!settings && (settings.trackWinsLosses || settings.trackWinPct);
  const showGPStepper = !!settings && (settings.trackGamesPlayed || showWLSteppers);

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        {board?.isCommissioner ? (
          <AnimatedPressable onPress={() => setSettingsOpen(true)} hitSlop={8}>
            <Settings2 size={22} color={colors.text} strokeWidth={1.75} />
          </AnimatedPressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      {loading || !board ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {canEdit ? (
            <Text style={styles.editHint}>
              {board.isCommissioner && board.settings.editMode === 'commissioner'
                ? 'Tap a member to update their stats. Only you (the commissioner) can edit.'
                : 'Tap a member to update their stats.'}
            </Text>
          ) : null}

          {columns.length === 0 ? (
            <Text style={styles.empty}>No metrics selected — the commissioner can pick some in settings.</Text>
          ) : (
            <>
              <View style={styles.headerRow}>
                <Text style={styles.rankHeader}>#</Text>
                <Text style={styles.nameHeader}>Member</Text>
                {columns.map((col) => (
                  <Text key={col.key} style={styles.colHeader}>
                    {col.label}
                  </Text>
                ))}
              </View>

              {board.entries.map((entry, index) => (
                <AnimatedPressable
                  key={entry.userId}
                  style={styles.row}
                  onPress={() => openEditor(entry)}
                  disabled={!canEdit}>
                  <Text style={styles.rank}>{index + 1}</Text>
                  {entry.avatarUrl ? (
                    <Image source={{ uri: entry.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <InitialsAvatar name={entry.name} size={30} />
                  )}
                  <Text style={styles.name} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  {columns.map((col) => (
                    <Text key={col.key} style={styles.colValue}>
                      {col.value(entry)}
                    </Text>
                  ))}
                </AnimatedPressable>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Edit a member's stats */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{editTarget?.name}</Text>

            {showWLSteppers ? (
              <>
                <StatStepper label="Wins" value={draft.wins} onBump={(d) => bump('wins', d)} styles={styles} colors={colors} />
                <StatStepper label="Losses" value={draft.losses} onBump={(d) => bump('losses', d)} styles={styles} colors={colors} />
              </>
            ) : null}
            {showGPStepper ? (
              <StatStepper
                label="Games played"
                value={draft.gamesPlayed}
                onBump={(d) => bump('gamesPlayed', d)}
                styles={styles}
                colors={colors}
              />
            ) : null}
            {settings?.trackAttendance ? (
              <StatStepper
                label="Attendance"
                value={draft.attendance}
                onBump={(d) => bump('attendance', d)}
                styles={styles}
                colors={colors}
              />
            ) : null}

            <AnimatedPressable style={styles.saveButton} onPress={handleSaveEntry} disabled={saving}>
              {saving ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
            </AnimatedPressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Commissioner settings */}
      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Leaderboard settings</Text>

            {settings ? (
              <>
                <Text style={styles.settingsSection}>Tracked metrics</Text>
                <SettingSwitch
                  label="Wins & losses"
                  value={settings.trackWinsLosses}
                  onChange={(v) => applySettings({ ...settings, trackWinsLosses: v })}
                  styles={styles}
                  colors={colors}
                />
                <SettingSwitch
                  label="Win percentage"
                  value={settings.trackWinPct}
                  onChange={(v) => applySettings({ ...settings, trackWinPct: v })}
                  styles={styles}
                  colors={colors}
                />
                <SettingSwitch
                  label="Games played"
                  value={settings.trackGamesPlayed}
                  onChange={(v) => applySettings({ ...settings, trackGamesPlayed: v })}
                  styles={styles}
                  colors={colors}
                />
                <SettingSwitch
                  label="Attendance"
                  value={settings.trackAttendance}
                  onChange={(v) => applySettings({ ...settings, trackAttendance: v })}
                  styles={styles}
                  colors={colors}
                />

                <Text style={styles.settingsSection}>Who can edit entries</Text>
                <View style={styles.modeRow}>
                  {(
                    [
                      { mode: 'commissioner', label: 'Commissioner only' },
                      { mode: 'anyone', label: 'Anyone can edit' },
                    ] as const
                  ).map(({ mode, label }) => {
                    const selected = settings.editMode === mode;
                    return (
                      <AnimatedPressable
                        key={mode}
                        style={[styles.modePill, selected && styles.modePillSelected]}
                        onPress={() => applySettings({ ...settings, editMode: mode })}>
                        <Text style={[styles.modePillText, selected && styles.modePillTextSelected]}>{label}</Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <AnimatedPressable style={styles.saveButton} onPress={() => setSettingsOpen(false)}>
              <Text style={styles.saveButtonText}>Done</Text>
            </AnimatedPressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function StatStepper({
  label,
  value,
  onBump,
  styles,
  colors,
}: {
  label: string;
  value: number;
  onBump: (delta: number) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <AnimatedPressable style={styles.stepperButton} onPress={() => onBump(-1)} hitSlop={6}>
          <Minus size={15} color={colors.text} strokeWidth={2.25} />
        </AnimatedPressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <AnimatedPressable style={styles.stepperButton} onPress={() => onBump(1)} hitSlop={6}>
          <Plus size={15} color={colors.text} strokeWidth={2.25} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

function SettingSwitch({
  label,
  value,
  onChange,
  styles,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.coral, false: colors.border }}
        thumbColor={ON_ACCENT}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    list: { padding: 20, paddingTop: 12, paddingBottom: 48 },
    editHint: { fontSize: 12, color: colors.textSecondary, marginBottom: 12 },
    empty: { marginTop: 40, textAlign: 'center', fontStyle: 'italic', color: colors.textSecondary, fontSize: 14 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rankHeader: { width: 22, fontSize: 11, fontWeight: WEIGHT.bold, color: colors.textSecondary },
    nameHeader: { flex: 1, fontSize: 11, fontWeight: WEIGHT.bold, color: colors.textSecondary, marginLeft: 38 },
    colHeader: {
      width: COL_WIDTH,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: WEIGHT.bold,
      color: colors.textSecondary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    rank: { width: 22, fontSize: 13, fontWeight: WEIGHT.bold, color: colors.textSecondary },
    avatar: { width: 30, height: 30, borderRadius: 15 },
    name: { flex: 1, fontSize: 14, fontWeight: WEIGHT.medium, color: colors.text },
    colValue: { width: COL_WIDTH, textAlign: 'center', fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    modalCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.background,
      borderRadius: RADII.lg,
      padding: 20,
      gap: 12,
    },
    modalTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text, textAlign: 'center', marginBottom: 4 },
    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepperLabel: { fontSize: 14, color: colors.text },
    stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepperButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperValue: { minWidth: 30, textAlign: 'center', fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    saveButton: {
      marginTop: 8,
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    saveButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
    settingsSection: { fontSize: 12, fontWeight: WEIGHT.bold, color: colors.textSecondary, marginTop: 6 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    switchLabel: { fontSize: 14, color: colors.text },
    modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    modePill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    modePillSelected: { backgroundColor: colors.coral, borderColor: colors.coral },
    modePillText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    modePillTextSelected: { color: ON_ACCENT },
  });
}
