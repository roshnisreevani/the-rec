import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { TrophyCase } from '@/components/profile/trophy-case';
import { WalkupSongPlayer } from '@/components/profile/walkup-song-player';
import { WalkupSongSearch } from '@/components/profile/walkup-song-search';
import { BORDER, COLORS, FONTS, RADII } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import type { ItunesTrack } from '@/lib/itunes';
import { emptyProfile, fetchProfile, saveProfile, type Profile, type Trophy } from '@/lib/profile';
import { ROAST_LINES } from '@/lib/roast-lines';
import type { SportTag } from '@/lib/sports';
import { uploadAvatarPhoto, uploadPickThreePhoto } from '@/lib/upload-photo';

const EMPTY_SLOTS: PickThreeSlot[] = [
  { uri: null, caption: '' },
  { uri: null, caption: '' },
  { uri: null, caption: '' },
];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit-mode draft state.
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState<SportTag[]>([]);
  const [legend, setLegend] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [song, setSong] = useState<Profile['walkupSong']>(null);
  const [slots, setSlots] = useState<PickThreeSlot[]>(EMPTY_SLOTS);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const lastRoastIndex = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const fetched = await fetchProfile(userId);
      setProfile(fetched);
    } catch (e) {
      Alert.alert('Could not load your profile', e instanceof Error ? e.message : 'Unknown error.');
      setProfile(emptyProfile(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const startEditing = () => {
    if (!profile) return;
    setName(profile.name);
    setLocation(profile.location);
    setTags(profile.sportTags);
    setLegend(profile.legend);
    setAvatarUri(profile.avatarUrl);
    setSong(profile.walkupSong);
    setTrophies(profile.trophies.map((t) => ({ ...t })));
    const nextSlots: PickThreeSlot[] = [0, 1, 2].map((i) => {
      const item = profile.pickThree[i];
      return item ? { uri: item.url, caption: item.caption } : { uri: null, caption: '' };
    });
    setSlots(nextSlots);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

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

  const handleAddTrophy = (trophy: Omit<Trophy, 'id'>) => {
    setTrophies((prev) => [...prev, { ...trophy, id: generateId() }]);
  };

  const handleRemoveTrophy = (id: string) => {
    setTrophies((prev) => prev.filter((t) => t.id !== id));
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('No access', 'Need photo library access to grab a real photo of you.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled) return;
    setAvatarUri(result.assets[0].uri);
  };

  const handlePickPhoto = async (index: number) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('No access', 'Need photo library access to grab your evidence.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setSlots((prev) => prev.map((slot, i) => (i === index ? { uri, caption: slot.caption } : slot)));
  };

  const handleCaptionChange = (index: number, text: string) => {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, caption: text } : slot)));
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
      setProfile(updated);
      setEditing(false);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Something went sideways.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={COLORS.ink} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Header: avatar, name, edit button */}
        <View style={styles.header}>
          <ProfileAvatar
            name={editing ? name : profile.name}
            photoUri={editing ? avatarUri : profile.avatarUrl}
            editable={editing}
            onPress={handlePickAvatar}
          />
          <View style={styles.headerText}>
            {editing ? (
              <TextInput
                style={styles.nameInput}
                placeholder="your name (or nickname)"
                placeholderTextColor="#8A8378"
                value={name}
                onChangeText={setName}
              />
            ) : (
              <Text style={styles.nameDisplay} numberOfLines={1}>
                {profile.name || 'Nameless legend'}
              </Text>
            )}
          </View>

          {editing ? (
            <View style={styles.editActions}>
              <Pressable onPress={cancelEditing} hitSlop={8} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.editButton} onPress={startEditing}>
              <Text style={styles.editButtonText}>Edit</Text>
            </Pressable>
          )}
        </View>

        <Pressable onPress={signOut} hitSlop={8} style={styles.signOut}>
          <Text style={styles.signOutText}>Log out</Text>
        </Pressable>

        {/* Location */}
        <Section title="location">
          {editing ? (
            <TextInput
              style={styles.input}
              placeholder="what city are you claiming to represent?"
              placeholderTextColor="#8A8378"
              value={location}
              onChangeText={setLocation}
            />
          ) : (
            <Text style={[styles.bodyText, !profile.location && styles.placeholderText]}>
              {profile.location || 'Location unknown (probably local)'}
            </Text>
          )}
        </Section>

        {/* Sport tags */}
        <Section title="what I claim to play">
          <SportTagsField editing={editing} selected={editing ? tags : profile.sportTags} onToggle={toggleTag} />
        </Section>

        {/* My legend */}
        <Section title="my legend">
          {editing ? (
            <View style={styles.legendEditRow}>
              <TextInput
                style={[styles.input, styles.legendInput]}
                placeholder="peaked in 8th grade, still showing up"
                placeholderTextColor="#8A8378"
                value={legend}
                onChangeText={setLegend}
              />
              <Pressable style={styles.roastButton} onPress={handleRoastMe}>
                <Text style={styles.roastButtonText}>🎤 roast me</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.legendText, !profile.legend && styles.placeholderText]}>
              {profile.legend || 'peaked in 8th grade, still showing up'}
            </Text>
          )}
        </Section>

        {/* Walk-up song */}
        <Section title="walk-up song">
          {editing ? (
            <>
              {song ? (
                <View style={styles.selectedSongRow}>
                  <WalkupSongPlayer key={song.previewUrl} song={song} />
                  <Pressable onPress={() => setSong(null)} hitSlop={8}>
                    <Text style={styles.changeSongText}>change song</Text>
                  </Pressable>
                </View>
              ) : (
                <WalkupSongSearch onSelect={handleSelectSong} />
              )}
            </>
          ) : profile.walkupSong ? (
            <WalkupSongPlayer key={profile.walkupSong.previewUrl} song={profile.walkupSong} />
          ) : (
            <Text style={styles.placeholderText}>No walk-up song yet — biggest character flaw, honestly.</Text>
          )}
        </Section>

        {/* Pick your 3 */}
        <Section title="pick your 3">
          {editing ? (
            <PickThreeField editing slots={slots} onPickPhoto={handlePickPhoto} onCaptionChange={handleCaptionChange} />
          ) : (
            <PickThreeField editing={false} items={profile.pickThree} />
          )}
        </Section>

        {/* Trophy case */}
        <Section title="trophy case">
          {editing ? (
            <TrophyCase editing trophies={trophies} onAdd={handleAddTrophy} onRemove={handleRemoveTrophy} />
          ) : (
            <TrophyCase editing={false} trophies={profile.trophies} />
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.cream },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.cream },
  content: { padding: 20, paddingBottom: 48, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  nameDisplay: { fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink },
  nameInput: {
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: FONTS.bodyBold,
    fontSize: 16,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
  },
  editButton: {
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderRadius: RADII.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.mustard,
  },
  editButtonText: { fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancelText: { fontFamily: FONTS.bodyMedium, color: COLORS.ink, opacity: 0.6, fontSize: 13 },
  saveButton: {
    borderRadius: RADII.pill,
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    backgroundColor: COLORS.coral,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 58,
    alignItems: 'center',
  },
  saveButtonText: { fontFamily: FONTS.bodyBold, color: COLORS.white, fontSize: 13 },
  signOut: { alignSelf: 'flex-end', marginTop: 6, marginBottom: 6 },
  signOutText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 12,
    color: COLORS.ink,
    opacity: 0.5,
    textDecorationLine: 'underline',
  },
  section: { marginTop: 26, gap: 8 },
  sectionTitle: { fontFamily: FONTS.display, fontSize: 19, color: COLORS.ink },
  bodyText: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.ink },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    borderRadius: RADII.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
  },
  legendEditRow: { gap: 8 },
  legendInput: { fontStyle: 'italic' },
  roastButton: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.blue,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  roastButtonText: { fontFamily: FONTS.bodyBold, fontSize: 12, color: COLORS.white },
  legendText: { fontFamily: FONTS.body, fontStyle: 'italic', fontSize: 15, color: COLORS.ink },
  placeholderText: { fontFamily: FONTS.body, opacity: 0.55, fontStyle: 'italic', color: COLORS.ink },
  selectedSongRow: { gap: 8 },
  changeSongText: { fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.blue, alignSelf: 'flex-start' },
});
