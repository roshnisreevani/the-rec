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

// videoMaxDuration only reliably trims freshly-recorded video on most
// devices — picking an existing video from the library can slip past it
// entirely, which is how a multi-minute recorded match clip once got all
// the way to the analyze function and crashed it (out of memory trying to
// hold the whole thing at once). This is the actual enforcement point.
const MAX_CLIP_SECONDS = 20;

function checkClipLength(asset: ImagePicker.ImagePickerAsset): boolean {
  const durationMs = asset.duration ?? 0;
  if (durationMs > MAX_CLIP_SECONDS * 1000) {
    Alert.alert(
      'Clip is too long',
      `Keep it to about ${MAX_CLIP_SECONDS} seconds — try trimming it first or picking a shorter moment.`
    );
    return false;
  }
  return true;
}

/**
 * Video-only picker for Highlights — caps recording/selection at 15s so
 * clips stay quick to analyze and match the "short highlight" vibe rather
 * than a full recorded game.
 */
export function pickVideoClip(): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert('Add a clip', 'Keep it to about 15 seconds.', [
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
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['videos'],
            videoMaxDuration: 15,
            quality: 0.7,
          });
          if (result.canceled) {
            resolve(null);
            return;
          }
          resolve(checkClipLength(result.assets[0]) ? result.assets[0].uri : null);
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
            videoMaxDuration: 15,
            quality: 0.7,
          });
          if (result.canceled) {
            resolve(null);
            return;
          }
          resolve(checkClipLength(result.assets[0]) ? result.assets[0].uri : null);
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
