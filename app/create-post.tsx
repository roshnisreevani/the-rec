import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Video } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { SportPickerField } from '@/components/create-post/sport-picker-field';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { type SportTag } from '@/lib/sports';
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

// Particle burst setup — fixed directions spread evenly in a circle.
const PARTICLE_COUNT = 10;
const PARTICLE_EMOJIS = ['🔥', '⚡', '💥', '⭐', '🎉', '🔥', '⚡', '💥', '⭐', '🎉'];
const PARTICLE_VECTORS = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
  const radius = 150 + (i % 3) * 25;
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
});

function triggerCelebration(
  shakeX: Animated.Value,
  rotate: Animated.Value,
  scale: Animated.Value,
  flash: Animated.Value,
  stamp: Animated.Value,
  particles: Animated.Value[]
) {
  // Long, escalating haptic barrage — feels like a countdown to an explosion.
  const haptics = [0, 30, 60, 90, 130, 170, 220, 280, 350, 430];
  haptics.forEach((delay) => {
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), delay);
  });
  setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 500);

  shakeX.setValue(0);
  rotate.setValue(0);
  scale.setValue(1);
  flash.setValue(0);
  stamp.setValue(0);
  particles.forEach((p) => p.setValue(0));

  Animated.parallel([
    // Big, long, violent shake that takes a while to fully calm down.
    Animated.sequence(
      [40, -42, 38, -36, 32, -30, 26, -22, 18, -15, 12, -9, 7, -5, 3, -2, 1, 0].map((v) =>
        Animated.timing(shakeX, { toValue: v, duration: 45, useNativeDriver: true })
      )
    ),
    // Wide rotational wobble.
    Animated.sequence(
      [-2.2, 2.4, -2, 1.8, -1.4, 1, -0.7, 0.4, -0.2, 0].map((v) =>
        Animated.timing(rotate, { toValue: v, duration: 70, useNativeDriver: true })
      )
    ),
    // Big outward punch with an overshoot bounce back.
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.22, duration: 110, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 2.5, tension: 100, useNativeDriver: true }),
    ]),
    // Full-screen color flash — quick bright pulse.
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]),
    // "POSTED!" stamp: punch in, hold, fade out.
    Animated.sequence([
      Animated.timing(stamp, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(stamp, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]),
    // Particle burst — each flies outward and fades.
    Animated.stagger(
      15,
      particles.map((p) =>
        Animated.timing(p, { toValue: 1, duration: 750, useNativeDriver: true })
      )
    ),
  ]).start();
}

export default function CreatePostScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [media, setMedia] = useState<{ uri: string; type: MediaType } | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [sportTag, setSportTag] = useState<SportTag | null>(null);

  const shakeX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const stamp = useRef(new Animated.Value(0)).current;
  const particles = useRef(PARTICLE_VECTORS.map(() => new Animated.Value(0))).current;

  const handlePickMedia = async () => {
    const picked = await pickFeedMedia();
    if (picked) setMedia(picked);
  };

  const handleCancel = () => {
    router.back();
  };

  const handlePost = async () => {
    if (!userId || !media) return;

    triggerCelebration(shakeX, rotate, scale, flash, stamp, particles);

    setPosting(true);
    try {
      await createPost({
        authorId: userId,
        sportTag,
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

  const rotateDeg = rotate.interpolate({ inputRange: [-3, 3], outputRange: ['-6deg', '6deg'] });
  const flashOpacity = flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });
  const stampScale = stamp.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

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

      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX: shakeX }, { rotate: rotateDeg }, { scale }],
        }}>
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

          <SportPickerField value={sportTag} onChange={setSportTag} />

          <TextInput
            style={styles.captionInput}
            placeholder="What happened out there?"
            placeholderTextColor={colors.textSecondary}
            value={caption}
            onChangeText={setCaption}
            multiline
          />

        </ScrollView>
      </Animated.View>

      {/* Full-screen flash pulse */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flashOverlay, { backgroundColor: colors.coral, opacity: flashOpacity }]}
      />

      {/* Particle burst, centered on screen */}
      <View pointerEvents="none" style={styles.particleLayer}>
        {particles.map((p, i) => {
          const { dx, dy } = PARTICLE_VECTORS[i];
          const translateX = p.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
          const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
          const opacity = p.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
          const particleScale = p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.3, 0.8] });
          return (
            <Animated.Text
              key={i}
              style={[
                styles.particle,
                { opacity, transform: [{ translateX }, { translateY }, { scale: particleScale }] },
              ]}>
              {PARTICLE_EMOJIS[i]}
            </Animated.Text>
          );
        })}
      </View>

      {/* "POSTED!" stamp */}
      <View pointerEvents="none" style={styles.stampLayer}>
        <Animated.Text
          style={[
            styles.stampText,
            { color: colors.coral, opacity: stamp, transform: [{ scale: stampScale }] },
          ]}>
          POSTED! 🎉
        </Animated.Text>
      </View>
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
    flashOverlay: { ...StyleSheet.absoluteFillObject },
    particleLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    particle: { position: 'absolute', fontSize: 28 },
    stampLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stampText: { fontSize: 32, fontWeight: WEIGHT.bold },
  });
}
