import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { FONTS, ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  const switchMode = (next: 'login' | 'signup' | 'reset') => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async () => {
    if (isReset) {
      if (!email.trim()) {
        setError('Enter the email on your account first.');
        return;
      }
      setSubmitting(true);
      setError(null);
      setNotice(null);
      const result = await resetPassword(email.trim());
      setSubmitting(false);

      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Check your inbox for a reset link — it'll bring you right back here.");
      setMode('login');
      return;
    }

    if (!email.trim() || !password) {
      setError("Can't show up empty-handed — fill in both fields.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = isSignup
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (isSignup) {
      setNotice('Check your inbox to confirm your email, then sign in.');
      setMode('login');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.brand}>
          <Image
            source={require('@/assets/images/Pinnied_Logo_Final.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.wordmark}>Pinnied</Text>
          <Text style={styles.tagline}>pin it or it didn't happen.</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {isReset ? null : (
            <TextInput
              style={styles.input}
              placeholder="password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
          )}

          {!isReset && !isSignup ? (
            <AnimatedPressable onPress={() => switchMode('reset')} hitSlop={8} haptic={false} style={styles.forgotRow}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </AnimatedPressable>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <AnimatedPressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={ON_ACCENT} />
            ) : (
              <Text style={styles.buttonText}>
                {isReset ? 'Send Reset Link' : isSignup ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </AnimatedPressable>

          <AnimatedPressable
            onPress={() => switchMode(isReset ? 'login' : isSignup ? 'login' : 'signup')}
            hitSlop={8}
            haptic={false}>
            <Text style={styles.switchText}>
              {isReset
                ? 'Back to sign in'
                : isSignup
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Create Account"}
            </Text>
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
    brand: { alignItems: 'center', marginBottom: 40 },
    logo: { width: 120, height: 120, marginBottom: 12, borderRadius: RADII.lg },
    wordmark: { fontSize: 34, fontFamily: FONTS.display, color: colors.coral },
    tagline: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },
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
    forgotRow: { alignSelf: 'flex-end' },
    forgotText: { color: colors.textSecondary, fontSize: 13 },
    error: { color: colors.danger, textAlign: 'center', fontSize: 13 },
    notice: { color: colors.text, textAlign: 'center', fontSize: 13 },
    button: {
      borderRadius: RADII.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
      backgroundColor: colors.coral,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: ON_ACCENT, fontWeight: WEIGHT.bold, fontSize: 16 },
    switchText: { textAlign: 'center', marginTop: 8, color: colors.textSecondary, fontSize: 13 },
  });
}
