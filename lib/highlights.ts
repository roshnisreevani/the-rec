import type { SkillLevel } from '@/lib/open-games';
import { supabase } from '@/lib/supabase';
import { uploadHighlightClipVideo } from '@/lib/upload-photo';

// 'roast' and 'critique' are the original two personas; 'hype' and
// 'commentator' were added alongside verdict_score/verdict_text to make the
// AI feel like a personality instead of a neutral analysis tool.
export type HighlightMode = 'roast' | 'critique' | 'hype' | 'commentator';
export type HighlightStatus = 'pending' | 'ready' | 'failed';
export type HighlightVisibility = 'private' | 'profile' | 'feed';

export type HighlightClip = {
  id: string;
  userId: string;
  mode: HighlightMode;
  sport: string | null;
  skillLevel: SkillLevel | null;
  videoUrl: string;
  overallText: string | null;
  verdictScore: number | null;
  verdictText: string | null;
  bestMomentSeconds: number | null;
  status: HighlightStatus;
  errorMessage: string | null;
  visibility: HighlightVisibility;
  createdAt: string;
  archivedAt: string | null;
  /** Start of the user-picked 15s window within the raw uploaded video, in seconds. Null = clip was already <=15s, play/analyze it in full. */
  trimStartSeconds: number | null;
  /** Optional short hint the user wrote ("airballed the free throw") fed directly into the AI prompt. */
  extraContext: string | null;
};

export type HighlightNote = {
  id: string;
  timestampSeconds: number;
  noteText: string;
};

export type HighlightMessage = {
  id: string;
  sender: 'user' | 'ai';
  body: string;
  createdAt: string;
};

type ClipRow = {
  id: string;
  user_id: string;
  mode: HighlightMode;
  sport: string | null;
  skill_level: SkillLevel | null;
  video_url: string;
  overall_text: string | null;
  verdict_score: number | null;
  verdict_text: string | null;
  best_moment_seconds: number | null;
  status: HighlightStatus;
  error_message: string | null;
  visibility: HighlightVisibility;
  created_at: string;
  archived_at: string | null;
  trim_start_seconds: number | null;
  extra_context: string | null;
};

function rowToClip(row: ClipRow): HighlightClip {
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    sport: row.sport,
    skillLevel: row.skill_level,
    videoUrl: row.video_url,
    overallText: row.overall_text,
    verdictScore: row.verdict_score,
    verdictText: row.verdict_text,
    bestMomentSeconds: row.best_moment_seconds,
    status: row.status,
    errorMessage: row.error_message,
    visibility: row.visibility,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    trimStartSeconds: row.trim_start_seconds,
    extraContext: row.extra_context,
  };
}

const CLIP_SELECT =
  'id, user_id, mode, sport, skill_level, video_url, overall_text, verdict_score, verdict_text, best_moment_seconds, status, error_message, visibility, created_at, archived_at, trim_start_seconds, extra_context';

/**
 * Uploads the clip and creates its row (status 'pending'), then fires the
 * analyze-highlight-clip Edge Function and returns immediately — analysis
 * happens async, the caller polls fetchHighlightClip for status to flip.
 */
export async function createHighlightClip(input: {
  userId: string;
  localVideoUri: string;
  mode: HighlightMode;
  sport: string | null;
  skillLevel: SkillLevel | null;
  /** Start of the user-picked 15s trim window, in seconds — omit/null if the picked clip was already <=15s and needs no trim. */
  trimStartSeconds?: number | null;
  /** Optional short hint ("airballed the free throw") passed straight into the AI prompt to disambiguate what the clip/frames alone can't convey. */
  extraContext?: string | null;
}): Promise<string> {
  const videoUrl = await uploadHighlightClipVideo(input.userId, input.localVideoUri);

  const { data, error } = await supabase
    .from('highlight_clips')
    .insert({
      user_id: input.userId,
      mode: input.mode,
      sport: input.sport,
      skill_level: input.skillLevel,
      video_url: videoUrl,
      trim_start_seconds: input.trimStartSeconds ?? null,
      extra_context: input.extraContext?.trim() || null,
    })
    .select('id')
    .single();

  if (error) throw error;
  const clipId = (data as { id: string }).id;

  supabase.functions.invoke('analyze-highlight-clip', { body: { clipId } }).catch((e) => {
    console.warn('[highlights] analyze request failed:', e);
  });

  return clipId;
}

/**
 * supabase-js's FunctionsHttpError.message is always the generic "Edge
 * Function returned a non-2xx status code" — the actual JSON body we send
 * back (e.g. "Could not analyze this clip: Gemini error: ...", or the daily
 * limit message) sits on error.context, an unread Response object. Reading
 * it here is what makes Alert.alert show the real reason instead of that
 * generic string.
 */
async function functionErrorDetail(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // context wasn't JSON (or already consumed) — fall through to the
      // generic message below rather than throwing over a cosmetic miss.
    }
  }
  return error instanceof Error ? error.message : 'Could not start analysis';
}

/** Re-fires analysis for a clip stuck in 'pending' or that previously 'failed'. */
export async function retryHighlightAnalysis(clipId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.functions.invoke('analyze-highlight-clip', { body: { clipId } });
  if (!error) return { error: null };
  return { error: new Error(await functionErrorDetail(error)) };
}

export async function fetchHighlightClip(clipId: string): Promise<HighlightClip | null> {
  const { data, error } = await supabase.from('highlight_clips').select(CLIP_SELECT).eq('id', clipId).maybeSingle();
  if (error) throw error;
  return data ? rowToClip(data as unknown as ClipRow) : null;
}

/** Active (non-archived) clips only — archived ones live in fetchArchivedHighlightClips. */
export async function fetchMyHighlightClips(userId: string): Promise<HighlightClip[]> {
  const { data, error } = await supabase
    .from('highlight_clips')
    .select(CLIP_SELECT)
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ClipRow[]).map(rowToClip);
}

export async function fetchArchivedHighlightClips(userId: string): Promise<HighlightClip[]> {
  const { data, error } = await supabase
    .from('highlight_clips')
    .select(CLIP_SELECT)
    .eq('user_id', userId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ClipRow[]).map(rowToClip);
}

/** Moves a clip to Archive — same soft-delete pattern as Feed posts, so nothing is lost by accident. */
export async function archiveHighlightClip(clipId: string): Promise<void> {
  const { error } = await supabase
    .from('highlight_clips')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', clipId);
  if (error) throw error;
}

export async function unarchiveHighlightClip(clipId: string): Promise<void> {
  const { error } = await supabase.from('highlight_clips').update({ archived_at: null }).eq('id', clipId);
  if (error) throw error;
}

export async function fetchHighlightNotes(clipId: string): Promise<HighlightNote[]> {
  const { data, error } = await supabase
    .from('highlight_clip_notes')
    .select('id, timestamp_seconds, note_text')
    .eq('clip_id', clipId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ id: string; timestamp_seconds: number; note_text: string }>).map(
    (row) => ({ id: row.id, timestampSeconds: row.timestamp_seconds, noteText: row.note_text })
  );
}

export async function fetchHighlightMessages(clipId: string): Promise<HighlightMessage[]> {
  const { data, error } = await supabase
    .from('highlight_clip_messages')
    .select('id, sender, body, created_at')
    .eq('clip_id', clipId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ id: string; sender: 'user' | 'ai'; body: string; created_at: string }>).map(
    (row) => ({ id: row.id, sender: row.sender, body: row.body, createdAt: row.created_at })
  );
}

/**
 * Sends a message and returns the AI's reply — the Edge Function stores both
 * sides. Pass quotedNote when the user tapped a specific note to reply to —
 * it gets woven into the stored bubble and into what the AI sees, so the
 * reply actually answers about that point.
 */
export async function sendHighlightMessage(clipId: string, message: string, quotedNote?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('highlight-clip-chat', {
    body: { clipId, message, quotedNote },
  });
  if (error) throw new Error(await functionErrorDetail(error));
  return (data as { reply: string }).reply;
}

/** Keep-private / post-to-profile. Feed sharing goes through shareHighlightToFeed instead — it needs a user-reviewed caption, not just a visibility flip. */
export async function setHighlightVisibility(
  clip: HighlightClip,
  visibility: Exclude<HighlightVisibility, 'feed'>,
  _authorId: string
): Promise<void> {
  const { error } = await supabase.from('highlight_clips').update({ visibility }).eq('id', clip.id);
  if (error) throw error;
}

/**
 * Posts a highlight to Feed as a "trading card" post — the caption is
 * whatever the user reviewed/edited (defaults to the AI verdict, but they
 * can rewrite it entirely before this is ever called), and the post carries
 * ai_mode/ai_verdict_score/highlight_clip_id so PostCard/SessionPostCard can
 * render the card treatment and deep-link back to the full highlight.
 * Optionally scopes the post to a specific group's feed via groupId.
 */
export async function shareHighlightToFeed(
  clip: HighlightClip,
  authorId: string,
  caption: string,
  groupId?: string | null
): Promise<void> {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert({
      author_id: authorId,
      group_id: groupId ?? null,
      sport_tag: clip.sport,
      caption: caption.trim() || (clip.verdictText ?? clip.overallText ?? 'Check this out'),
      media_url: clip.videoUrl,
      media_type: 'video',
      ai_mode: clip.mode,
      ai_verdict_score: clip.verdictScore,
      highlight_clip_id: clip.id,
    })
    .select('id')
    .single();
  if (postError) throw postError;

  const { error } = await supabase
    .from('highlight_clips')
    .update({ visibility: 'feed', shared_post_id: (post as { id: string }).id })
    .eq('id', clip.id);
  if (error) throw error;
}

export async function deleteHighlightClip(clipId: string): Promise<void> {
  const { error } = await supabase.from('highlight_clips').delete().eq('id', clipId);
  if (error) throw error;
}

/**
 * "Group roast" layer — reactions + comments on a highlight itself, separate
 * from the owner's private AI chat. RLS (can_engage_with_highlight) only
 * allows this once the clip's visibility is 'profile' or 'feed', so a
 * private clip stays private.
 */
export type HighlightReaction = { id: string; userId: string; emoji: string };
export type HighlightComment = { id: string; userId: string; body: string; createdAt: string };

export async function fetchHighlightReactions(clipId: string): Promise<HighlightReaction[]> {
  const { data, error } = await supabase.from('highlight_reactions').select('id, user_id, emoji').eq('clip_id', clipId);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; user_id: string; emoji: string }>).map((r) => ({
    id: r.id,
    userId: r.user_id,
    emoji: r.emoji,
  }));
}

export async function toggleHighlightReaction(clipId: string, userId: string, emoji: string, active: boolean): Promise<void> {
  if (active) {
    const { error } = await supabase.from('highlight_reactions').insert({ clip_id: clipId, user_id: userId, emoji });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('highlight_reactions')
      .delete()
      .eq('clip_id', clipId)
      .eq('user_id', userId)
      .eq('emoji', emoji);
    if (error) throw error;
  }
}

export async function fetchHighlightComments(clipId: string): Promise<HighlightComment[]> {
  const { data, error } = await supabase
    .from('highlight_comments')
    .select('id, user_id, body, created_at')
    .eq('clip_id', clipId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; user_id: string; body: string; created_at: string }>).map((c) => ({
    id: c.id,
    userId: c.user_id,
    body: c.body,
    createdAt: c.created_at,
  }));
}

export async function addHighlightComment(clipId: string, userId: string, body: string): Promise<void> {
  const { error } = await supabase.from('highlight_comments').insert({ clip_id: clipId, user_id: userId, body });
  if (error) throw error;
}
