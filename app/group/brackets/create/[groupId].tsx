import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import { useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SportPickerField } from '@/components/create-post/sport-picker-field';
import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { createBracket, type SeedingMethod } from '@/lib/brackets';
import { fetchGroupDetail, type GroupMember } from '@/lib/groups';
import { type SportTag } from '@/lib/sports';

export default function CreateBracketScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [sportTag, setSportTag] = useState<SportTag | null>(null);
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [seeding, setSeeding] = useState<SeedingMethod>('random');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!groupId || !userId) return;
    fetchGroupDetail(groupId, userId)
      .then((detail) => setMembers(detail?.members ?? []))
      .catch(() => Alert.alert('Could not load members'))
      .finally(() => setLoadingMembers(false));
  }, [groupId, userId]);

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = name.trim().length > 0 && selectedIds.size >= 2 && !submitting;

  const handleCreate = async () => {
    if (!canSubmit || !userId || !groupId) return;
    setSubmitting(true);
    try {
      const participants = members
        .filter((m) => selectedIds.has(m.userId))
        .map((m) => ({ userId: m.userId, displayName: m.name }));

      const bracketId = await createBracket({
        groupId,
        createdBy: userId,
        name: name.trim(),
        sportTag,
        description: description.trim() || null,
        startDate: startDate.trim() || null,
        seeding,
        participants,
      });
      router.replace(`/group/brackets/detail/${bracketId}`);
    } catch (e) {
      Alert.alert('Could not create bracket', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Create Bracket</Text>
        <AnimatedPressable
          style={[styles.doneBtn, !canSubmit && styles.doneBtnDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit}>
          {submitting ? (
            <ActivityIndicator color={ON_ACCENT} size="small" />
          ) : (
            <Text style={styles.doneBtnText}>Create</Text>
          )}
        </AnimatedPressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Bracket name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Summer Hoops Showdown"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* Sport */}
        <View style={styles.field}>
          <Text style={styles.label}>Sport / activity</Text>
          <SportPickerField value={sportTag} onChange={setSportTag} />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Optional — what's this bracket about?"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </View>

        {/* Start date */}
        <View style={styles.field}>
          <Text style={styles.label}>Start date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
            value={startDate}
            onChangeText={setStartDate}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        {/* Seeding */}
        <View style={styles.field}>
          <Text style={styles.label}>Seeding</Text>
          <View style={styles.pillRow}>
            {(['random', 'manual'] as SeedingMethod[]).map((s) => (
              <AnimatedPressable
                key={s}
                style={[styles.pill, seeding === s && styles.pillActive]}
                onPress={() => setSeeding(s)}>
                <Text style={[styles.pillText, seeding === s && styles.pillTextActive]}>
                  {s === 'random' ? '🎲 Random' : '✍️ Manual'}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {seeding === 'random'
              ? 'Participants will be randomly seeded.'
              : 'Participants will be seeded in the order you select them.'}
          </Text>
        </View>

        {/* Participants */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Participants{' '}
            <Text style={styles.labelCount}>
              ({selectedIds.size} selected{selectedIds.size < 2 ? ' — pick at least 2' : ''})
            </Text>
          </Text>
          {loadingMembers ? (
            <ActivityIndicator color={colors.text} style={{ marginTop: 8 }} />
          ) : (
            members.map((m) => {
              const selected = selectedIds.has(m.userId);
              return (
                <AnimatedPressable
                  key={m.userId}
                  style={[styles.memberRow, selected && styles.memberRowSelected]}
                  onPress={() => toggleMember(m.userId)}>
                  {m.avatarUrl ? (
                    <Image source={{ uri: m.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <InitialsAvatar name={m.name} size={36} />
                  )}
                  <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                  {selected ? (
                    <View style={styles.checkCircle}>
                      <Check size={13} color={ON_ACCENT} strokeWidth={2.5} />
                    </View>
                  ) : (
                    <View style={styles.emptyCircle} />
                  )}
                </AnimatedPressable>
              );
            })
          )}
        </View>
      </ScrollView>
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    doneBtn: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 7,
      minWidth: 68,
      alignItems: 'center',
    },
    doneBtnDisabled: { opacity: 0.4 },
    doneBtnText: { color: ON_ACCENT, fontWeight: WEIGHT.bold, fontSize: 14 },
    content: { padding: 20, gap: 22, paddingBottom: 60 },
    field: { gap: 8 },
    label: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    labelCount: { fontWeight: WEIGHT.regular, color: colors.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.background,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
    pillRow: { flexDirection: 'row', gap: 10 },
    pill: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingVertical: 10,
      alignItems: 'center',
    },
    pillActive: { borderColor: colors.coral, backgroundColor: colors.coral + '18' },
    pillText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    pillTextActive: { color: colors.coral },
    hint: { fontSize: 12, color: colors.textSecondary },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    memberRowSelected: { borderColor: colors.coral, backgroundColor: colors.coral + '10' },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    memberName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: WEIGHT.medium },
    checkCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
  });
}
