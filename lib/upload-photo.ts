import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

/**
 * Uploads a locally-picked photo (a file:// URI from expo-image-picker) to a
 * Supabase Storage bucket, under a folder named after the user's id (required
 * for the storage RLS policies in supabase/schema.sql to work), and returns
 * the public URL to store on the profile.
 */
async function uploadPhoto(bucket: string, userId: string, localUri: string): Promise<string> {
  const file = new File(localUri);
  const bytes = await file.bytes();

  const extMatch = localUri.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch?.[1] ?? 'jpg').toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export function uploadPickThreePhoto(userId: string, localUri: string): Promise<string> {
  return uploadPhoto('pick-three', userId, localUri);
}

export function uploadAvatarPhoto(userId: string, localUri: string): Promise<string> {
  return uploadPhoto('avatars', userId, localUri);
}

export function uploadMessagePhoto(userId: string, localUri: string): Promise<string> {
  return uploadPhoto('message-media', userId, localUri);
}

export function uploadGamePhoto(userId: string, localUri: string): Promise<string> {
  return uploadPhoto('game-photos', userId, localUri);
}

const BULLETIN_IMAGE_MAX_DIMENSION = 1600;

/**
 * Resizes (only if larger than 1600px on the long edge — never upscales)
 * and compresses a Bulletin image before upload, always normalizing to
 * JPEG so the content type is never a guess (source photos can be HEIC/PNG).
 */
export async function uploadBulletinImage(
  leagueId: string,
  localUri: string,
  sourceWidth: number,
  sourceHeight: number
): Promise<string> {
  const context = ImageManipulator.manipulate(localUri);
  const longestEdge = Math.max(sourceWidth, sourceHeight);
  if (longestEdge > BULLETIN_IMAGE_MAX_DIMENSION) {
    const scale = BULLETIN_IMAGE_MAX_DIMENSION / longestEdge;
    context.resize({ width: Math.round(sourceWidth * scale), height: Math.round(sourceHeight * scale) });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  const file = new File(saved.uri);
  const bytes = await file.bytes();
  const path = `${leagueId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;

  const { error } = await supabase.storage.from('bulletin-images').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from('bulletin-images').getPublicUrl(path);
  return data.publicUrl;
}

/** Uploads a locally-picked short video clip (see uploadPhoto above for the general pattern). */
export async function uploadHighlightClipVideo(userId: string, localUri: string): Promise<string> {
  const file = new File(localUri);
  const bytes = await file.bytes();

  const extMatch = localUri.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch?.[1] ?? 'mov').toLowerCase();
  const contentType = `video/${ext === 'mov' ? 'quicktime' : ext}`;

  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const { error } = await supabase.storage.from('highlight-clips').upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from('highlight-clips').getPublicUrl(path);
  return data.publicUrl;
}
