import {
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
} from '@expo-google-fonts/urbanist';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/contexts/theme-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { session, initializing, isPasswordRecovery } = useAuth();
  const { mode, colors } = useTheme();

  return (
    <NavigationThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
      {initializing ? (
        <View style={[styles.loading, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <Stack>
          {/* Password-reset link opened the app: show only the "set a new
              password" screen, regardless of session state, until it's done. */}
          <Stack.Protected guard={isPasswordRecovery}>
            <Stack.Screen name="reset-password" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!isPasswordRecovery && !!session}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen name="edit-profile" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="create-post" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="create-group" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="group/invite/[id]" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="group/members/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="group/gameday/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="group/leaderboard/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="join/[code]" options={{ headerShown: false }} />
            <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="new-chat" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="find-people" options={{ headerShown: false }} />
            <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="u/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ headerShown: false }} />
            <Stack.Screen name="privacy-safety" options={{ headerShown: false }} />
            <Stack.Screen name="follows" options={{ headerShown: false }} />
            <Stack.Screen name="connections" options={{ headerShown: false }} />
            <Stack.Screen name="my-groups" options={{ headerShown: false }} />
            <Stack.Screen name="archive" options={{ headerShown: false }} />
            <Stack.Screen name="saved-posts" options={{ headerShown: false }} />
            <Stack.Screen name="gameday-quiz" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="my-schedule" options={{ headerShown: false }} />
            <Stack.Screen name="similar-people" options={{ headerShown: false }} />
            <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
            <Stack.Screen name="terms-of-service" options={{ headerShown: false }} />
            <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="group/brackets/[groupId]" options={{ headerShown: false }} />
            <Stack.Screen name="group/brackets/create/[groupId]" options={{ headerShown: false }} />
            <Stack.Screen name="group/brackets/detail/[bracketId]" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!isPasswordRecovery && !session}>
            <Stack.Screen name="auth" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      )}
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Urbanist_400Regular,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold,
    PermanentMarker_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    // Required at the app root for react-native-gesture-handler's Pan
    // gestures to work correctly (Feed's new swipeable session cards use
    // real Gesture.Pan()/GestureDetector gestures, not just Pressables).
    // Wrapping the whole app is the standard/only supported placement.
    <GestureHandlerRootView style={styles.flex}>
      <AppThemeProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
