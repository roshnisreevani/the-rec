import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Video } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { MOCK_GROUPS } from '@/lib/groups-mock';
import { createPost, type MediaType } from '@/lib/posts';

async function pickFeedMedia(): Promise<{ uri: string; type: MediaType } | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('No access', 'Need photo library access to add media to a post.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.7,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const type: MediaType = asset.type === 'video' ? 'video' : 'image';
  return { uri: asset.uri, type };
}

export default function CreatePostScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [media, setMedia] = useState<{ uri: string; type: MediaType } | null>(null);
  const [caption, setCaption] = useState('');
  const [groupId, setGroupId] = useState(MOCK_GROUPS[0]?.id ?? '');
  const [posting, setPosting] = useState(false);

  const handlePickMedia = async () => {
    const picked = await pickFeedMedia();
    if (picked) setMedia(picked);
  };

  const handleCancel = () => {
    router.back();
  };

  const handlePost = async () => {
    if (!userId || !media) return;
    setPosting(true);
    try {
      await createPost({
        authorId: userId,
        groupId,
        caption: caption.trim(),
        localMediaUri: media.uri,
        mediaType: media.type,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not post', e instanceof Error ? e.message : 'Something went sideways.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={handleCancel} hitSlop={8} disabled={posting}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
        <Text style={styles.headerTitle}>New Post</Text>
        <AnimatedPressable
          style={[styles.postButton, (!media || posting) && styles.postButtonDisabled]}
          onPress={handlePost}
          disabled={!media || posting}>
          {posting ? (
            <ActivityIndicator color={ON_ACCENT} size="small" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </AnimatedPressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AnimatedPressable style={styles.mediaBox} onPress={handlePickMedia}>
          {media ? (
            media.type === 'video' ? (
              <View style={styles.videoPreview}>
                <Video size={32} color={colors.textSecondary} strokeWidth={1.75} />
                <Text style={styles.videoPreviewText}>video selected</Text>
              </View>
            ) : (
              <Image source={{ uri: media.uri }} style={styles.mediaImage} />
            )
          ) : (
            <Text style={styles.mediaBoxText}>Tap to add a photo or video</Text>
          )}
        </AnimatedPressable>

        <TextInput
          style={styles.captionInput}
          placeholder="What happened out there?"
          placeholderTextColor={colors.textSecondary}
          value={caption}
          onChangeText={setCaption}
          multiline
        />

        <Text style={styles.sectionLabel}>Which group is this for?</Text>
        <View style={styles.groupRow}>
          {MOCK_GROUPS.map((g) => (
            <AnimatedPressable
              key={g.id}
              style={[styles.groupPill, groupId === g.id && styles.groupPillActive]}
              onPress={() => setGroupId(g.id)}>
              <Text style={[styles.groupPillText, groupId === g.id && styles.groupPillTextActive]}>
                {g.emoji} {g.name}
              </Text>
            </AnimatedPressable>
          ))}
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
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cancelText: { fontSize: 15, color: colors.textSecondary },
    headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    postButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 7,
      minWidth: 58,
      alignItems: 'center',
    },
    postButtonDisabled: { opacity: 0.4 },
    postButtonText: { fontWeight: WEIGHT.bold, color: ON_ACCENT, fontSize: 14 },
    content: { padding: 20, gap: 18, paddingBottom: 60 },
    mediaBox: {
      aspectRatio: 1,
      borderRadius: RADII.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: colors.borderSoft,
    },
    mediaBoxText: { color: colors.textSecondary, fontSize: 14 },
    mediaImage: { width: '100%', height: '100%' },
    videoPreview: { alignItems: 'center', gap: 8 },
    videoPreviewText: { color: colors.textSecondary, fontSize: 13 },
    captionInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      minHeight: 70,
      textAlignVertical: 'top',
      backgroundColor: colors.background,
    },
    sectionLabel: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    groupRow: { gap: 8 },
    groupPill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    groupPillActive: { borderColor: colors.coral, backgroundColor: colors.borderSoft },
    groupPillText: { fontSize: 14, color: colors.text },
    groupPillTextActive: { fontWeight: WEIGHT.semibold },
  });
}
