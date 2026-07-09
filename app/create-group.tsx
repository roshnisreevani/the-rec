import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { createGroup, GROUP_TYPES, GROUP_TYPE_LABELS, type GroupPrivacy, type GroupType } from '@/lib/groups';
import { pickPhoto } from '@/lib/pick-photo';
import { uploadAvatarPhoto } from '@/lib/upload-photo';

export default function CreateGroupScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupType, setGroupType] = useState<GroupType>('friend_group');
  const [privacy, setPrivacy] = useState<GroupPrivacy>('private');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCancel = () => {
    router.back();
  };

  const handlePickAvatar = async () => {
    const uri = await pickPhoto();
    if (uri) setAvatarUri(uri);
  };

  const handleCreate = async () => {
    if (!userId) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Give your group a name before creating it.');
      return;
    }

    setSaving(true);
    try {
      const avatarUrl = avatarUri ? await uploadAvatarPhoto(userId, avatarUri) : null;
      const group = await createGroup({
        name: trimmedName,
        description: description.trim(),
        groupType,
        privacy,
        avatarUrl,
        createdBy: userId,
      });
      router.replace(`/group/${group.id}`);
    } catch (e) {
      Alert.alert('Could not create group', errorMessage(e, 'Unknown error.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={handleCancel} hitSlop={8} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Create Group</Text>
        <AnimatedPressable style={styles.saveButton} onPress={handleCreate} disabled={saving}>
          {saving ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.saveButtonText}>Create</Text>}
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarRow}>
          <ProfileAvatar name={name} photoUri={avatarUri} editable onPress={handlePickAvatar} size={84} />
          <Text style={styles.avatarHint}>Add a group photo (optional)</Text>
        </View>

        <Section title="Group name" styles={styles}>
          <TextInput
            style={styles.input}
            placeholder="Tuesday Night Hoops"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </Section>

        <Section title="Description (optional)" styles={styles}>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="What's this group about?"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </Section>

        <Section title="Group type" styles={styles}>
          <View style={styles.pillRow}>
            {GROUP_TYPES.map((type) => {
              const selected = type === groupType;
              return (
                <AnimatedPressable
                  key={type}
                  style={[styles.typePill, selected && styles.typePillSelected]}
                  onPress={() => setGroupType(type)}>
                  <Text style={[styles.typePillText, selected && styles.typePillTextSelected]}>
                    {GROUP_TYPE_LABELS[type]}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </Section>

        <Section title="Privacy" styles={styles}>
          <View style={styles.pillRow}>
            <AnimatedPressable
              style={[styles.typePill, privacy === 'private' && styles.typePillSelected]}
              onPress={() => setPrivacy('private')}>
              <Text style={[styles.typePillText, privacy === 'private' && styles.typePillTextSelected]}>
                Private
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.typePill, privacy === 'public' && styles.typePillSelected]}
              onPress={() => setPrivacy('public')}>
              <Text style={[styles.typePillText, privacy === 'public' && styles.typePillTextSelected]}>Public</Text>
            </AnimatedPressable>
          </View>
          <Text style={styles.privacyHint}>
            {privacy === 'private'
              ? 'People need an invite to join, and invite links require your approval to join.'
              : 'Anyone with an invite link can join instantly, no approval needed.'}
          </Text>
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
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 7,
      minWidth: 66,
      alignItems: 'center',
    },
    saveButtonText: { fontWeight: WEIGHT.bold, color: ON_ACCENT, fontSize: 14 },
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    avatarRow: { alignItems: 'center', gap: 10, marginTop: 8 },
    avatarHint: { fontSize: 13, color: colors.textSecondary },
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
    typePillSelected: { backgroundColor: colors.coral, borderColor: colors.coral },
    typePillText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    typePillTextSelected: { color: ON_ACCENT },
    privacyHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  });
}
