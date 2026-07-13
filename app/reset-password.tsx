import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';

// Shown instead of the normal signed-in app whenever isPasswordRecovery is
// true (see contexts/auth-context.tsx) — i.e. the user got here by tapping
// the password-reset link in their email, not by a normal sign-in. Once they
// set a new password, isPasswordRecovery flips back off and the root
// navigator's guard sends them into the normal app with their existing
// session (Supabase's recovery flow authenticates them, no re-login needed).
export default function ResetPasswordScreen() {
  const { updatePasswordAndFinishRecovery } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (password.length < 6) {
      setError('Password needs to be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError("Those don't match — try again.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await updatePasswordAndFinishRecovery(password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    Alert.alert('Password updated', "You're all set.");
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Choose something you haven't used here before.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="new password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            style={styles.input}
            placeholder="confirm new password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AnimatedPressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            {submitting ? <ActivityIndicator color={ON_ACCENT} /> : <Text style={styles.buttonText}>Update Password</Text>}
          </AnimatedPressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, justifyContent: 'center', padding: 24 },
    title: { fontSize: 22, fontWeight: WEIGHT.bold, color: colors.text, textAlign: 'center' },
    subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 30 },
    form: { gap: 12 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.background,
    },
    error: { color: colors.danger, textAlign: 'center', fontSize: 13 },
    button: {
      borderRadius: RADII.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
      backgroundColor: colors.coral,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: ON_ACCENT, fontWeight: WEIGHT.bold, fontSize: 16 },
  });
}
