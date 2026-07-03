import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const handleSubmit = async () => {
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
      setNotice('Check your inbox to confirm your email, then log in.');
      setMode('login');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          The Rec
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          {isSignup
            ? 'New here? Come make some questionable athletic memories.'
            : 'Welcome back, legend.'}
        </ThemedText>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, { color: palette.text, borderColor: palette.icon }]}
            placeholder="you@example.com"
            placeholderTextColor="#888"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[styles.input, { color: palette.text, borderColor: palette.icon }]}
            placeholder="password (make it a good one)"
            placeholderTextColor="#888"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          {notice ? <ThemedText style={styles.notice}>{notice}</ThemedText> : null}

          <Pressable
            style={[styles.button, { backgroundColor: palette.tint }, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>{isSignup ? 'Sign up' : 'Log in'}</ThemedText>
            )}
          </Pressable>

          <Pressable onPress={() => setMode(isSignup ? 'login' : 'signup')} hitSlop={8}>
            <ThemedText style={[styles.switchText, { color: palette.tint }]}>
              {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 8, marginBottom: 28, opacity: 0.7 },
  form: { gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: '#d92626', textAlign: 'center' },
  notice: { color: '#2f9e44', textAlign: 'center' },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  switchText: { textAlign: 'center', marginTop: 8 },
});
