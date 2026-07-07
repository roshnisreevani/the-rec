import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useTheme, useThemeColors } from '@/contexts/theme-context';
import { deleteAccount } from '@/lib/account';
import { fetchSettings, updateSetting, type UserSettings } from '@/lib/settings';

const PRIVACY_POLICY_URL = 'https://example.com/the-rec/privacy';
const TERMS_URL = 'https://example.com/the-rec/terms';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const { mode, toggleTheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const fetched = await fetchSettings(userId);
      setSettings(fetched);
    } catch (e) {
      Alert.alert('Could not load settings', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (key: keyof UserSettings, column: Parameters<typeof updateSetting>[1]) => {
    if (!userId || !settings) return;
    const nextValue = !settings[key];
    setSettings({ ...settings, [key]: nextValue });
    try {
      await updateSetting(userId, column, nextValue);
    } catch (e) {
      setSettings(settings);
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your profile, your photos, and your account. There is no undoing this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            setDeleting(true);
            try {
              await deleteAccount(userId);
            } catch (e) {
              setDeleting(false);
              Alert.alert('Could not delete account', e instanceof Error ? e.message : 'Unknown error.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading || !settings ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Section title="Appearance" colors={colors} styles={styles}>
            <Row
              label="Dark mode"
              sublabel="Applies across the whole app"
              colors={colors}
              styles={styles}
              right={
                <Switch
                  value={mode === 'dark'}
                  onValueChange={toggleTheme}
                  trackColor={{ true: colors.coral, false: colors.border }}
                  thumbColor={ON_ACCENT}
                />
              }
            />
          </Section>

          <Section title="Notifications" colors={colors} styles={styles}>
            <Row
              label="Group activity"
              sublabel="RSVPs, new posts, and chat in your groups"
              colors={colors}
              styles={styles}
              right={
                <Switch
                  value={settings.notifyGroupActivity}
                  onValueChange={() => toggle('notifyGroupActivity', 'notify_group_activity')}
                  trackColor={{ true: colors.coral, false: colors.border }}
                  thumbColor={ON_ACCENT}
                />
              }
            />
            <Row
              label="Banter replies"
              sublabel="When someone claps back at your trash talk"
              colors={colors}
              styles={styles}
              right={
                <Switch
                  value={settings.notifyBanterReplies}
                  onValueChange={() => toggle('notifyBanterReplies', 'notify_banter_replies')}
                  trackColor={{ true: colors.coral, false: colors.border }}
                  thumbColor={ON_ACCENT}
                />
              }
            />
          </Section>

          <Section title="Privacy" colors={colors} styles={styles}>
            <Row
              label="Approximate location"
              sublabel="Show your area instead of your exact city"
              colors={colors}
              styles={styles}
              right={
                <Switch
                  value={settings.locationPrivacyApproximate}
                  onValueChange={() => toggle('locationPrivacyApproximate', 'location_privacy_approximate')}
                  trackColor={{ true: colors.coral, false: colors.border }}
                  thumbColor={ON_ACCENT}
                />
              }
            />
            <Row
              label="Allow connection requests from anyone"
              sublabel="Turn off to stop new people from requesting to connect"
              colors={colors}
              styles={styles}
              right={
                <Switch
                  value={settings.allowConnectionRequests}
                  onValueChange={() => toggle('allowConnectionRequests', 'allow_connection_requests')}
                  trackColor={{ true: colors.coral, false: colors.border }}
                  thumbColor={ON_ACCENT}
                />
              }
            />
          </Section>

          <Section title="Safety" colors={colors} styles={styles}>
            <LinkRow
              label="Privacy & Safety"
              onPress={() => router.push('/privacy-safety')}
              colors={colors}
              styles={styles}
            />
          </Section>

          <Section title="About" colors={colors} styles={styles}>
            <LinkRow label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} colors={colors} styles={styles} />
            <LinkRow label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} colors={colors} styles={styles} />
          </Section>

          <Section title="Account" colors={colors} styles={styles}>
            <AnimatedPressable style={styles.logoutRow} onPress={signOut}>
              <Text style={styles.logoutText}>Log Out</Text>
            </AnimatedPressable>
          </Section>

          <View style={styles.dangerZone}>
            <Text style={styles.dangerLabel}>Danger zone</Text>
            <AnimatedPressable style={styles.deleteButton} onPress={handleDeleteAccount} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator color={ON_ACCENT} size="small" />
              ) : (
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              )}
            </AnimatedPressable>
            <Text style={styles.dangerHint}>
              Permanently deletes your profile, photos, and account. This can't be undone.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

type SectionStyleProps = { colors: ThemeColors; styles: ReturnType<typeof makeStyles> };

function Section({ title, children, styles }: { title: string; children: ReactNode } & SectionStyleProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  sublabel,
  right,
  styles,
}: { label: string; sublabel?: string; right: ReactNode } & SectionStyleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function LinkRow({
  label,
  onPress,
  colors,
  styles,
}: { label: string; onPress: () => void } & SectionStyleProps) {
  return (
    <AnimatedPressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ChevronRight size={18} color={colors.textSecondary} strokeWidth={1.75} />
    </AnimatedPressable>
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
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    section: { marginTop: 22, gap: 8 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: WEIGHT.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionBody: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
      backgroundColor: colors.background,
    },
    rowText: { flex: 1, paddingRight: 12, gap: 2 },
    rowLabel: { fontSize: 14, fontWeight: WEIGHT.medium, color: colors.text },
    rowSublabel: { fontSize: 12, color: colors.textSecondary },
    logoutRow: {
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      backgroundColor: colors.background,
    },
    logoutText: { fontSize: 14, fontWeight: WEIGHT.semibold, color: colors.text },
    dangerZone: { marginTop: 34, gap: 8, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
    dangerLabel: {
      fontSize: 12,
      fontWeight: WEIGHT.bold,
      color: colors.danger,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    deleteButton: {
      backgroundColor: colors.danger,
      borderRadius: RADII.md,
      paddingVertical: 13,
      alignItems: 'center',
    },
    deleteButtonText: { fontWeight: WEIGHT.bold, color: ON_ACCENT, fontSize: 14 },
    dangerHint: { fontSize: 12, color: colors.textSecondary },
  });
}
