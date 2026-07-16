import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';

/**
 * Uploads a locally-recorded voice note (a file:// URI from expo-audio) to
 * the voice-notes bucket, under a folder named after the user's id (same
 * "own folder" RLS pattern as lib/upload-photo.ts), and returns the public
 * URL to store on the message.
 */
export async function uploadVoiceNote(userId: string, localUri: string): Promise<string> {
  const file = new File(localUri);
  const bytes = await file.bytes();

  const extMatch = localUri.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch?.[1] ?? 'm4a').toLowerCase();
  const contentType = ext === 'caf' ? 'audio/x-caf' : ext === 'wav' ? 'audio/wav' : 'audio/m4a';

  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const { error } = await supabase.storage.from('voice-notes').upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('voice-notes').getPublicUrl(path);
  return data.publicUrl;
}
