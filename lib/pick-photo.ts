import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import type { MediaType } from '@/lib/posts';

export type PickedMedia = { uri: string; type: MediaType };
export type PickedImage = { uri: string; width: number; height: number };

function toPickedMedia(result: ImagePicker.ImagePickerResult): PickedMedia | null {
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' };
}

/**
 * Photo-or-video variant of pickPhoto below, same camera/library Alert flow
 * and permission handling — used by post composers (feed and group posts).
 */
export function pickMedia(): Promise<PickedMedia | null> {
  return new Promise((resolve) => {
    Alert.alert('Add photo or video', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      {
        text: 'Take Photo or Video',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('No access', 'Need camera access to capture media.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.7,
          });
          resolve(toPickedMedia(result));
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('No access', 'Need photo library access to choose media.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.7,
          });
          resolve(toPickedMedia(result));
        },
      },
    ]);
  });
}

// Clips that come back longer than 15s no longer get flat-out rejected —
// instead the caller (create-highlight.tsx) routes them to a trim screen
// where the user drags a 15s window over the clip, the same way iOS Photos
// lets you trim a video. Anything genuinely absurd (a multi-minute recorded
// match) is still rejected outright rather than handed to the trim UI,
// since that's clearly not someone trying to select a highlight moment and
// would mean downloading/scrubbing a huge file on-device for nothing.
const ABSOLUTE_MAX_CLIP_SECONDS = 10 * 60;
export const TARGET_CLIP_SECONDS = 15;

function rejectIfAbsurd(asset: ImagePicker.ImagePickerAsset): boolean {
  const durationMs = asset.duration ?? 0;
  if (durationMs > ABSOLUTE_MAX_CLIP_SECONDS * 1000) {
    Alert.alert('Clip is way too long', 'Pick something closer to a single highlight moment, not a full recording.');
    return false;
  }
  return true;
}

export type PickedVideoClip = { uri: string; durationSeconds: number };

/**
 * Video-only picker for Highlights. Returns the picked clip's duration
 * alongside its URI so the caller can decide whether it needs trimming
 * (anything over TARGET_CLIP_SECONDS) — this picker itself no longer
 * enforces the 15s cap, it just guards against wildly oversized files.
 */
export function pickVideoClip(): Promise<PickedVideoClip | null> {
  return new Promise((resolve) => {
    Alert.alert('Add a clip', 'Pick a moment — you can trim it to 15 seconds next.', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      {
        text: 'Record',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('No access', 'Need camera access to record a clip.');
            resolve(null);
            return;
          }
          // 60s ceiling on recording (not TARGET_CLIP_SECONDS) so users can
          // record a natural take and trim the best 15s out of it afterward
          // instead of having to nail the exact moment live.
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['videos'],
            videoMaxDuration: 60,
            quality: 0.7,
          });
          if (result.canceled) {
            resolve(null);
            return;
          }
          const asset = result.assets[0];
          resolve(rejectIfAbsurd(asset) ? { uri: asset.uri, durationSeconds: (asset.duration ?? 0) / 1000 } : null);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('No access', 'Need photo library access to choose a clip.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
            quality: 0.7,
          });
          if (result.canceled) {
            resolve(null);
            return;
          }
          const asset = result.assets[0];
          resolve(rejectIfAbsurd(asset) ? { uri: asset.uri, durationSeconds: (asset.duration ?? 0) / 1000 } : null);
        },
      },
    ]);
  });
}

/**
 * Shared "add a photo" flow used by the avatar and Pick Your 3 pickers.
 * Offers camera or library, handles permissions for both, and resolves with
 * a local file:// URI (or null if the user backed out).
 */
export function pickPhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert('Add a photo', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      {
        text: 'Take Photo',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('No access', 'Need camera access to take a photo.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
          });
          resolve(result.canceled ? null : result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('No access', 'Need photo library access to choose a photo.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
          });
          resolve(result.canceled ? null : result.assets[0].uri);
        },
      },
    ]);
  });
}

/**
 * Freeform (no forced crop aspect) image picker for banner-style attachments
 * like a Bulletin post's image — returns the source dimensions too so the
 * caller can resize proportionally instead of guessing.
 */
export function pickImage(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    Alert.alert('Add a photo', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      {
        text: 'Take Photo',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('No access', 'Need camera access to take a photo.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
          if (result.canceled) {
            resolve(null);
            return;
          }
          const asset = result.assets[0];
          resolve({ uri: asset.uri, width: asset.width, height: asset.height });
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('No access', 'Need photo library access to choose a photo.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
          if (result.canceled) {
            resolve(null);
            return;
          }
          const asset = result.assets[0];
          resolve({ uri: asset.uri, width: asset.width, height: asset.height });
        },
      },
    ]);
  });
}
