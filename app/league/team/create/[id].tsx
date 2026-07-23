import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import { createTeam } from '@/lib/leagues';

export default function CreateTeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!userId || !id) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Give this team a name.');
      return;
    }
    setSaving(true);
    try {
      await createTeam({ leagueId: id, name: trimmedName, description: description.trim(), avatarUrl: null, createdBy: userId });
      router.back();
    } catch (e) {
      Alert.alert('Could not create team', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
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
    content: { padding: 20, gap: 22 },
    field: { gap: 8 },
    label: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
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
    multilineInput: { minHeight: 72, textAlignVertical: 'top' },
  });

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Create Team</Text>
        <AnimatedPressable style={styles.saveButton} onPress={handleCreate} disabled={saving}>
          {saving ? <ActivityIndicator color={ON_ACCENT} size="small" /> : <Text style={styles.saveButtonText}>Create</Text>}
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Team name</Text>
            <TextInput
              style={styles.input}
              placeholder="The Backboard Breakers"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Anything worth knowing about this team?"
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
