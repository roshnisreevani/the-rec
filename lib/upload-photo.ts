import { File } from 'expo-file-system';

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
