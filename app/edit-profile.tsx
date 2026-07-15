import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

import { PickThreeField, type PickThreeSlot } from '@/components/profile/pick-three-field';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { SportTagsField } from '@/components/profile/sport-tags-field';
import { WalkupSongPlayer } from '@/components/profile/walkup-song-player';
import { WalkupSongSearch } from '@/components/profile/walkup-song-search';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import type { ItunesTrack } from '@/lib/itunes';
import { pickPhoto } from '@/lib/pick-photo';
import { fetchProfile, saveProfile, type Profile, type Trophy } from '@/lib/profile';
import { ROAST_LINES } from '@/lib/roast-lines';
import type { SportTag } from '@/lib/sports';
import { uploadAvatarPhoto, uploadPickThreePhoto } from '@/lib/upload-photo';

const EMPTY_SLOTS: PickThreeSlot[] = [
  { uri: null, caption: '' },
  { uri: null, caption: '' },
  { uri: null, caption: '' },
];

export default function EditProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState<SportTag[]>([]);
  const [legend, setLegend] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [song, setSong] = useState<Profile['walkupSong']>(null);
  const [slots, setSlots] = useState<PickThreeSlot[]>(EMPTY_SLOTS);
  // Trophy Case UI no longer exists anywhere, but `trophies` is still a real
  // column on the profile row — carried through from the initial load so
  // saving here never wipes out (or requires a redundant re-fetch of) it.
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const lastRoastIndex = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const profile = await fetchProfile(userId);
      setName(profile.name);
      setLocation(profile.location);
      setTags(profile.sportTags);
      setLegend(profile.legend);
      setAvatarUri(profile.avatarUrl);
      setSong(profile.walkupSong);
      const nextSlots: PickThreeSlot[] = [0, 1, 2].map((i) => {
        const item = profile.pickThree[i];
        return item ? { uri: item.url, caption: item.caption } : { uri: null, caption: '' };
      });
      setSlots(nextSlots);
      setTrophies(profile.trophies);
    } catch (e) {
      Alert.alert('Could not load your profile', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTag = (tag: SportTag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSelectSong = (track: ItunesTrack) => {
    setSong({
      title: track.trackName,
      artist: track.artistName,
      artworkUrl: track.artworkUrl,
      previewUrl: track.previewUrl,
    });
  };

  const handleRoastMe = () => {
    if (ROAST_LINES.length === 0) return;
    let idx = Math.floor(Math.random() * ROAST_LINES.length);
    if (ROAST_LINES.length > 1) {
      while (idx === lastRoastIndex.current) {
        idx = Math.floor(Math.random() * ROAST_LINES.length);
      }
    }
    lastRoastIndex.current = idx;
    setLegend(ROAST_LINES[idx]);
  };

  const handlePickAvatar = async () => {
    const uri = await pickPhoto();
    if (uri) setAvatarUri(uri);
  };

  const handlePickPhoto = async (index: number) => {
    const uri = await pickPhoto();
    if (!uri) return;
    setSlots((prev) => prev.map((slot, i) => (i === index ? { uri, caption: slot.caption } : slot)));
  };

  const handleRemovePhoto = (index: number) => {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { uri: null, caption: '' } : slot)));
  };

  const handleRemoveAvatar = () => {
    setAvatarUri(null);
  };

  const handleCaptionChange = (index: number, text: string) => {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, caption: text } : slot)));
  };

  const handleCancel = () => {
    router.back();
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const isRemote = (uri: string) => uri.startsWith('http://') || uri.startsWith('https://');

      const avatarUrl = !avatarUri
        ? null
        : isRemote(avatarUri)
          ? avatarUri
          : await uploadAvatarPhoto(userId, avatarUri);

      const uploaded = await Promise.all(
        slots.map(async (slot) => {
          if (!slot.uri) return null;
          const url = isRemote(slot.uri) ? slot.uri : await uploadPickThreePhoto(userId, slot.uri);
          return { url, caption: slot.caption.trim() };
        })
      );

      const updated: Profile = {
        id: userId,
        name: name.trim(),
        location: location.trim(),
        sportTags: tags,
        legend: legend.trim(),
        avatarUrl,
        walkupSong: song,
        pickThree: uploaded.filter((item): item is { url: string; caption: string } => item !== null),
        trophies,
      };

      await saveProfile(updated);
      router.back();
    } catch (e) {
      Alert.alert('Save failed', errorMessage(e, 'Something went sideways.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={handleCancel} hitSlop={8} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <AnimatedPressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={ON_ACCENT} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarRow}>
          <ProfileAvatar name={name} photoUri={avatarUri} editable onPress={handlePickAvatar} size={84} />
          {avatarUri ? (
            <AnimatedPressable onPress={handleRemoveAvatar} hitSlop={8}>
              <Text style={styles.removeAvatarText}>Remove photo</Text>
            </AnimatedPressable>
          ) : null}
        </View>

        <Section title="Name" styles={styles}>
          <TextInput
            style={styles.input}
            placeholder="your name (or nickname)"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />
        </Section>

        <Section title="Location" styles={styles}>
          <TextInput
            style={styles.input}
            placeholder="what city are you claiming to represent?"
            placeholderTextColor={colors.textSecondary}
            value={location}
            onChangeText={setLocation}
          />
        </Section>

        <Section title="What I claim to play" styles={styles}>
          <SportTagsField editing selected={tags} onToggle={toggleTag} />
        </Section>

        <Section title="My legend" styles={styles}>
          <View style={styles.legendRow}>
            <TextInput
              style={[styles.input, styles.legendInput]}
              placeholder="peaked in 8th grade, still showing up"
              placeholderTextColor={colors.textSecondary}
              value={legend}
              onChangeText={setLegend}
            />
            <AnimatedPressable style={styles.roastButton} onPress={handleRoastMe}>
              <Text style={styles.roastButtonText}>Roast me</Text>
            </AnimatedPressable>
          </View>
        </Section>

        <Section title="Walk-up song" styles={styles}>
          {song ? (
            <View style={styles.selectedSongRow}>
              <WalkupSongPlayer key={song.previewUrl} song={song} />
              <AnimatedPressable onPress={() => setSong(null)} hitSlop={8}>
                <Text style={styles.changeSongText}>change song</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <WalkupSongSearch onSelect={handleSelectSong} />
          )}
        </Section>

        <Section title="Pick your 3" styles={styles}>
          <PickThreeField
            editing
            slots={slots}
            onPickPhoto={handlePickPhoto}
            onCaptionChange={handleCaptionChange}
            onRemovePhoto={handleRemovePhoto}
          />
        </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
  styles,
}: {
  title: string;
  children: ReactNode;
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
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
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
      minWidth: 58,
      alignItems: 'center',
    },
    saveButtonText: { fontWeight: WEIGHT.bold, color: ON_ACCENT, fontSize: 14 },
    content: { padding: 20, paddingBottom: 60, gap: 4 },
    avatarRow: { alignItems: 'center', marginBottom: 8, gap: 8 },
    removeAvatarText: { fontSize: 13, color: colors.danger, fontWeight: WEIGHT.medium },
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
    legendRow: { gap: 8 },
    legendInput: { fontStyle: 'italic' },
    roastButton: {
      alignSelf: 'flex-start',
      borderRadius: RADII.pill,
      backgroundColor: colors.text,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    roastButtonText: { fontWeight: WEIGHT.semibold, fontSize: 12, color: colors.background },
    selectedSongRow: { gap: 8 },
    changeSongText: { fontSize: 12, color: colors.coral, alignSelf: 'flex-start', fontWeight: WEIGHT.medium },
  });
}
