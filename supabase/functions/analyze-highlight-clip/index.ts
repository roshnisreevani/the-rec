// Supabase Edge Function: analyze-highlight-clip
//
// Watches a short (~15s) clip of someone playing a sport and generates
// either a Roast (funny, low-stakes) or a Critique (real feedback,
// calibrated to self-reported skill level), each as a short overall line
// plus a few timestamped notes the client can use to seek the video to the
// exact moment being talked about — no frame overlays/annotations, Gemini
// can't paint on video, it can only describe it in text tied to a time.
//
// Enforces a soft cap of 4 clip analyses per user per rolling 24h, purely
// to protect the shared free-tier quota (not a monetization gate yet).
//
// Needs GEMINI_API_KEY (same secret as caption-game-photo, reused here).
// Deploy with: npx supabase functions deploy analyze-highlight-clip

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Supabase Storage (and browsers generally) label iPhone videos as
// "video/quicktime", but Gemini's Files API only recognizes "video/mov" as
// the accepted MIME type for that same format — sending the storage label
// as-is was silently getting the file rejected after a full upload + poll
// cycle, which is exactly the "takes forever then fails" pattern seen here.
function toGeminiMimeType(contentType: string): string {
  return contentType === 'video/quicktime' ? 'video/mov' : contentType;
}

/**
 * Uploads video bytes to Gemini's Files API (the recommended path for
 * anything beyond a couple MB — inline base64-in-JSON hits an internal
 * request-size ceiling around 20MB total, which a plain ~15MB phone clip
 * can already brush up against once base64 overhead and JSON wrapping are
 * added). Returns the file's URI once Gemini finishes processing it —
 * videos aren't usable immediately, they go through a brief PROCESSING
 * state first, so this polls until ACTIVE.
 */
async function uploadToGeminiFiles(
  geminiApiKey: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': contentType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'highlight-clip' } }),
  });
  if (!startRes.ok) throw new Error(`Gemini upload start failed: ${await startRes.text()}`);

  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini did not return an upload URL');

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  });
  if (!uploadRes.ok) throw new Error(`Gemini upload failed: ${await uploadRes.text()}`);

  const fileInfo = await uploadRes.json();
  let file = fileInfo.file as { uri: string; name: string; state: string };

  // Video needs a moment to finish processing server-side before it can be
  // referenced in a generateContent call — poll briefly rather than assume
  // it's ready immediately.
  const deadline = Date.now() + 30000;
  while (file.state === 'PROCESSING' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const statusRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${geminiApiKey}`);
    if (!statusRes.ok) throw new Error('Could not check upload status');
    file = await statusRes.json();
  }

  if (file.state !== 'ACTIVE') throw new Error(`File never became ready (state: ${file.state})`);

  // Known Gemini Files API race condition: the status endpoint reports
  // ACTIVE before the file has actually finished propagating to the serving
  // layer generateContent reads from, so an immediate call can 400 with
  // "invalid argument" even though the file genuinely exists and is fine.
  // A short buffer here — cheap relative to the whole multi-second
  // upload+analysis flow — meaningfully reduces how often that race is hit
  // in the first place, on top of the retry below that catches it if it
  // still happens.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return file.uri;
}

// Gemini's Files API (upload → poll for ACTIVE → generateContent) has a
// structural race condition: Google's own status endpoint can report a file
// ACTIVE before it's actually finished propagating to the separate serving
// layer generateContent reads from, causing intermittent 400s that no amount
// of client-side retry/buffer can fully eliminate — it's a race between two
// systems on Google's side we don't control.
//
// Inline base64 sidesteps this entirely: the video bytes travel inside the
// same generateContent request as the analysis call, as an `inline_data`
// part, instead of a separate uploaded file referenced by URI. There's no
// asynchronous handoff between systems, so there's nothing to race against.
// The tradeoff is Gemini's inline request-size ceiling (~20MB total,
// including JSON overhead) — base64 inflates raw bytes by ~1/3, so this is
// only safe for clips whose raw bytes comfortably clear that ceiling once
// inflated. Every clip in this app is capped to 15s client + server side,
// so in practice nearly every real upload fits inline; INLINE_MAX_BYTES
// leaves headroom for base64 inflation + prompt/schema overhead. Anything
// over that (should be rare) falls back to the Files API path below.
const INLINE_MAX_BYTES = 14 * 1024 * 1024; // ~14MB raw -> ~18.7MB base64'd

// A real 15s phone clip is routinely 15-20MB raw (portrait 1080p+), which
// base64-inflates past Gemini's inline ceiling before it even gets a chance
// — confirmed in production (a 15.7MB clip -> ~21MB base64'd, forced onto
// the Files API path, which then hit the exact propagation race this whole
// rework was meant to avoid). Raising INLINE_MAX_BYTES doesn't fix that,
// since the real ceiling belongs to Gemini, not to us. Instead, shrink the
// clip itself before analysis: Cloudinary's free "fetch" delivery can
// downscale + recompress a remote video URL on the fly, the same way it
// already extracts still frames for Groq below. A 480px-wide, aggressively
// compressed re-encode of a casual 15s pickup-game clip is visually more
// than enough for the AI to describe what happened, and routinely lands
// well under 2-3MB — comfortably inside the inline ceiling essentially
// every time, so the Files API path becomes a true rare-case fallback
// instead of the common case it was accidentally still being for most clips.
// trimStartSeconds comes from the user's drag-a-15s-window pick in
// trim-highlight.tsx (stored on the row, null if the raw upload was already
// <=15s and needed no trim). The raw file itself is never cut — Cloudinary
// does the actual cutting on read via so_/du_ offsets, both here (video fed
// to Gemini) and in buildFramePreviewUrls below (stills fed to Groq), so
// both providers only ever see the window the user actually chose.
function buildCompressedVideoUrl(cloudName: string, videoUrl: string, trimStartSeconds: number | null): string {
  // f_mp4 forces the actual output container to MP4/H.264 — without it,
  // vc_auto only picks a codec but the container itself could still come
  // back as something else (e.g. still MOV), while the code below declares
  // the mime type as 'video/mp4' regardless. That mismatch between the
  // declared mime type and the real bytes is consistent with Gemini
  // rejecting even a tiny, well-under-limit compressed clip with the same
  // 400 INVALID_ARGUMENT — confirmed in production: a 245KB inline request
  // still failed, which rules out size/propagation-race entirely and points
  // at the request itself being malformed.
  const trimPart = trimStartSeconds != null ? `so_${trimStartSeconds},du_15,` : '';
  return `https://res.cloudinary.com/${cloudName}/video/fetch/${trimPart}w_480,c_limit,q_auto:low,vc_auto,f_mp4/${videoUrl}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  // btoa expects a binary string, not raw bytes directly — chunk the
  // conversion so a large Uint8Array doesn't blow the call-stack via
  // String.fromCharCode(...bytes) spreading every byte as an argument.
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

// A 503 ("model overloaded") or 429 (rate limited) is Gemini's shared
// infrastructure being busy at that exact moment — not a problem with the
// request itself, and often clears within a couple seconds. A 400 tied to a
// file_uri part is also treated as transient here: it's the same Files API
// propagation race the buffer in uploadToGeminiFiles targets (status says
// ACTIVE, generateContent still can't see it yet) rather than a genuinely
// malformed request — those are well-documented on Google's own developer
// forums as intermittent, not deterministic. Retrying it costs one extra
// round trip but turns an otherwise-permanent-looking failure into a
// transient one. Any other error (safety block, malformed schema, etc.)
// fails immediately without burning quota on a doomed retry.
// Confirmed via a real 404 response body (not a guess): 'gemini-2.5-flash'
// pinned directly returns "This model models/gemini-2.5-flash is no longer
// available to new users" — this Gemini API key/project was created after
// Google moved new-key access to the Gemini 3 line, so 2.5/2.0 pinned model
// names 404 outright regardless of the video-payload question we were
// chasing. 'gemini-3.6-flash' is the current stable flagship (per Google's
// live models doc as of this deploy); 'gemini-flash-latest' is kept as a
// second attempt since that alias always resolves to whatever's current.
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest'];
const RETRY_DELAY_MS = 2500;

// 429 used to be treated as transient and retried, but Gemini's free tier
// caps at 20 requests/day per model (confirmed via a real RESOURCE_EXHAUSTED
// response) — retrying a quota error just burns more of the same exhausted
// quota and wastes the whole 2-model x2-attempt loop on a guaranteed
// failure. Only 503 (overloaded) and 400 (the old Files API propagation
// race) are worth retrying; 429 should fail straight to Groq instead.
function isRetryableStatus(status: number): boolean {
  return status === 503 || status === 400;
}

async function generateWithFallback(geminiApiKey: string, requestBody: Record<string, unknown>): Promise<unknown> {
  let lastError: Error = new Error('Gemini request failed');

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (res.ok) return res.json();

      const bodyText = await res.text();
      lastError = new Error(`Gemini error (${model}, status ${res.status}): ${bodyText}`);

      if (!isRetryableStatus(res.status)) {
        throw lastError;
      }
      // else: overloaded/rate-limited/file-propagation-race — loop retries
      // this model once more, then the outer loop moves on to the next
      // model in GEMINI_MODELS.
    }
  }

  throw lastError;
}

// ---- Cross-provider fallback: Groq (free tier) on extracted still frames ----
//
// If Gemini's entire retry/model chain above still fails (not just a single
// flaky call, but the whole provider being down or quota-exhausted), this is
// the last resort so the clip doesn't just die. Groq doesn't take video, so
// instead of the real clip it reasons from a handful of still frames pulled
// via Cloudinary's free "fetch" transformation (no ffmpeg needed on our
// side — Cloudinary decodes the remote video URL and returns a frame at a
// given timestamp as a plain image URL). Both are genuinely free ongoing
// tiers, not trial credits, so this costs $0 even though it's a second
// full provider.
// "Too many images" earlier turned out to be one limit, but the real
// recurring blocker is Groq's free-tier TOKENS-PER-MINUTE cap (8000 TPM on
// this model) — "Request too large ... Requested 8579" means the request
// itself was accepted, it just costs more vision tokens than the per-minute
// budget allows. Vision token cost scales with image pixel count, so this
// isn't fixed by JPEG quality/compression (that only shrinks file size, not
// the tokenizer's patch count) — it has to be fixed by shrinking pixel
// dimensions and cutting frame count. 2 frames at 384px comfortably clears
// the 8000 TPM budget with room for the text prompt alongside it.
const FRAME_OFFSETS_SECONDS = [3, 10];
const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b';

function buildFramePreviewUrls(cloudName: string, videoUrl: string, trimStartSeconds: number | null): string[] {
  const base = trimStartSeconds ?? 0;
  return FRAME_OFFSETS_SECONDS.map(
    (offset) =>
      `https://res.cloudinary.com/${cloudName}/video/fetch/so_${base + offset},w_384,c_limit,f_jpg,q_auto:low/${videoUrl}`
  );
}

// Fires all frame requests now (in parallel with the Gemini attempt, not
// after it fails) so if Groq does end up being needed, the frames are
// already generated/cached at Cloudinary's edge instead of adding cold-start
// latency on top of an already-failed Gemini attempt. Best-effort: a failed
// warm-up doesn't throw, since the actual Groq call will just re-fetch.
async function warmFramePreviews(frameUrls: string[]): Promise<void> {
  await Promise.allSettled(frameUrls.map((url) => fetch(url, { method: 'GET' })));
}

async function generateWithGroq(
  groqApiKey: string,
  frameUrls: string[],
  prompt: string
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      // NOT using response_format: { type: 'json_object' } here — confirmed
      // in production this breaks when combined with image inputs on this
      // model: Groq returned "Failed to validate JSON... json_validate_failed"
      // with an EMPTY failed_generation, meaning strict JSON mode caused the
      // model to produce nothing parseable at all for a vision request. The
      // RESPONSE_CONTRACT text below already instructs the model to reply
      // with pure JSON; the jsonStart/jsonEnd brace-slicing on the response
      // (see the caller) handles any stray text around it without needing
      // the API to enforce the format itself.
      temperature: 0.9,
      // qwen3.6-27b is a reasoning model — without being told to skip it, it
      // spends its output budget writing a <think>...</think> trace before
      // ever getting to the actual answer. Confirmed in production: a
      // stored response was the raw text "<think>\nThe user wants a JSON
      // response..." cut off mid-thought at the old 1024-token cap, with no
      // JSON ever produced. reasoning_effort: 'none' turns that off at the
      // model level (Groq's documented way to disable it for this model
      // family); the token cap is also raised as a second safety margin in
      // case the model still emits some reasoning despite the flag.
      reasoning_effort: 'none',
      max_completion_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${prompt}\n\nRespond with ONLY the final JSON object — no <think> tags, no reasoning, no explanation before or after it.\n\n(${frameUrls.length} still frames from the clip, not full video/audio.)`,
            },
            ...frameUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq fallback error: ${await res.text()}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq fallback');
  return text;
}

// Shared JSON contract every persona responds in — a verdict (score + punchy
// one-liner, like a judge on a panel show) and a best-moment timestamp (the
// single best/funniest instant in the clip) sit alongside the original
// overall/notes shape, so the client can show a headline verdict instead of
// only a bulleted list.
const RESPONSE_CONTRACT = `Respond with ONLY valid JSON, no markdown fences, matching exactly:
{"sport": "string", "overall": "one short sentence, max 100 chars", "verdict_score": number (0-10), "verdict_text": "one punchy quotable one-liner verdict, max 90 chars", "best_moment_seconds": number (the single best/funniest/most notable instant in the clip), "notes": [{"timestamp_seconds": number, "text": "string"}]}
Include 4-6 notes, each tied to a genuinely different moment in the clip (0 to clip length in seconds) — do not repeat the same point twice in different words.`;

// Builds a short "here's what you told them last time" addendum so the AI
// can callback/reference past clips instead of every analysis starting from
// zero — makes repeat use feel like an ongoing bit instead of a one-off.
function callbackLine(pastLines: string[]): string {
  if (pastLines.length === 0) return '';
  return `\n\nFor context, here's what you said about this person's last ${pastLines.length} clip(s), oldest first — if it fits naturally, you can briefly callback/reference one (improvement, a repeated habit, a running joke), but don't force it: ${pastLines.map((l, i) => `(${i + 1}) "${l}"`).join(' ')}`;
}

function promptFor(
  mode: string,
  sport: string | null,
  skillLevel: string | null,
  callback: string,
  extraContext: string | null
): string {
  const sportLine = sport
    ? `The sport is ${sport}.`
    : `Figure out what sport/activity this is from the clip and include it as "sport" in your response.`;

  // Straight from the uploader, not inferred — this is the single most
  // reliable signal available when Groq ends up carrying the analysis
  // (only 2 still frames, no motion, no audio) and something like "he
  // airballed it" or "first time surfing" can't be read off a still image
  // at all. Worded as ground truth, not a suggestion, so it isn't
  // second-guessed against what the frames/video seem to show.
  const contextLine = extraContext
    ? ` The person who uploaded this told you directly: "${extraContext}" — treat that as true and build on it, don't contradict it.`
    : '';

  if (mode === 'roast') {
    return `You are watching a ~15 second clip of a friend playing a casual pickup sport (think office softball, weekend pickup basketball, a friend's first surf session) — never professional sports. ${sportLine}${contextLine}

Write a funny, warm, self-deprecating ROAST — like a friend ribbing another friend over text, never mean-spirited, never about their body, always about the play itself. Keep it SIMPLE: everyday words, short punchy sentences, no fancy vocabulary or elaborate metaphors ("majestic", "championship level", "gravity is undefeated" — too much). Think one quick, obvious joke a friend would actually text, not a written bit. verdict_score is a joking "grade" out of 10 (low scores are part of the bit, not an insult) and verdict_text is the punchline that goes with it.${callback}

${RESPONSE_CONTRACT}`;
  }

  if (mode === 'hype') {
    return `You are watching a ~15 second clip of a friend playing a casual pickup sport. ${sportLine}${contextLine}

You are their biggest, most over-the-top HYPE MAN — a sneaker-commercial voiceover crossed with a friend who's had too much Gatorade. Treat every clip like it's the game-winning play, even if it's a beer-league free throw. Big energy, short exclamations, simple words shouted with confidence, zero actual criticism. verdict_score should basically always be high (7-10) — the bit is being delusionally hyped regardless of what actually happened — and verdict_text is a single triumphant tagline.${callback}

${RESPONSE_CONTRACT}`;
  }

  if (mode === 'commentator') {
    return `You are watching a ~15 second clip of a friend playing a casual pickup sport. ${sportLine}${contextLine}

Write it like a live TV sports commentator doing play-by-play on a recreational game as if it were a championship final — dramatic, breathless, slightly absurd given the low stakes, but never mean. Simple words, short punchy sentences, present tense, like you're calling it live. verdict_score is your "post-game rating" and verdict_text is a single dramatic closing line, like a sign-off.${callback}

${RESPONSE_CONTRACT}`;
  }

  const skillLine = skillLevel
    ? `They describe their own skill level as: ${skillLevel}.`
    : `You don't know their skill level, so keep feedback broadly encouraging.`;

  return `You are watching a ~15 second clip of someone playing a casual pickup sport. ${sportLine} ${skillLine}${contextLine}

Write a real, useful CRITIQUE — specific, kind, and calibrated to their level: encouragement-first and simple for a beginner, sharper and more technical for a competitive player. Keep it SIMPLE and understandable: everyday words, short sentences, no jargon unless it's a basic term any casual player would already know. Never harsh, never generic ("keep practicing"), always tied to something you can actually see in the clip. verdict_score is a genuine skill-execution rating out of 10 for what's shown in this specific clip, and verdict_text is your one-line bottom-line takeaway.${callback}

${RESPONSE_CONTRACT}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
  }

  let clipId: string | undefined;
  try {
    const body = await req.json();
    clipId = body.clipId;
  } catch {
    // fall through
  }
  if (!clipId) {
    return new Response(JSON.stringify({ error: 'clipId is required' }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') as string;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  // Both optional — if either is missing, the Groq fallback path is simply
  // skipped and behavior is identical to before (Gemini-only). This is
  // deliberate so deploying this doesn't require both secrets to already
  // exist; it degrades gracefully rather than failing to boot.
  const groqApiKey = Deno.env.get('GROQ_API_KEY');
  const cloudinaryCloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');

  if (!geminiApiKey) {
    return new Response(JSON.stringify({ error: 'Highlights isn\'t configured yet (missing GEMINI_API_KEY).' }), {
      status: 500,
    });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Could not verify caller' }), { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: clip, error: clipError } = await adminClient
    .from('highlight_clips')
    .select('id, user_id, mode, sport, skill_level, video_url, trim_start_seconds, extra_context')
    .eq('id', clipId)
    .maybeSingle();

  if (clipError || !clip || clip.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Clip not found' }), { status: 404 });
  }

  // Soft daily cap: protects the shared free-tier quota, not a monetization
  // gate (that's a later, separate decision). Counts this clip too, so "2
  // free a day" means this can be at most the 2nd clip in the last 24h.
  //
  const DAILY_CAP = 4;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await adminClient
    .from('highlight_clips')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
    // Clips that failed (Gemini 503/429, bad upload, etc.) never actually
    // completed an analysis — counting them against the cap means a run of
    // shared-infra hiccups can lock a user out for 24h despite them getting
    // zero real usage out of it. Only clips that succeeded or are actively
    // in flight count toward the quota.
    .neq('status', 'failed');

  if ((count ?? 0) > DAILY_CAP) {
    await adminClient
      .from('highlight_clips')
      .update({ status: 'failed', error_message: "You've hit today's free limit (4 clips/day). Try again tomorrow." })
      .eq('id', clipId);
    return new Response(JSON.stringify({ error: 'Daily limit reached' }), { status: 429 });
  }

  try {
    const videoRes = await fetch(clip.video_url as string);
    if (!videoRes.ok) throw new Error('Could not fetch video');

    // Still worth a sanity cap against genuinely absurd uploads (a full
    // recorded match, not a highlight clip) — the Files API itself handles
    // up to 2GB, so this is just a "that's clearly not a highlight" guard,
    // not a technical necessity like the old inline-base64 limit was.
    const contentLength = Number(videoRes.headers.get('content-length') ?? 0);
    const MAX_BYTES = 150 * 1024 * 1024;
    if (contentLength > MAX_BYTES) {
      await adminClient
        .from('highlight_clips')
        .update({ status: 'failed', error_message: 'That clip is too long/large — try a shorter one (~15s).' })
        .eq('id', clipId);
      return new Response(JSON.stringify({ error: 'Clip too large' }), { status: 413 });
    }

    const rawContentType = videoRes.headers.get('content-type') ?? 'video/mp4';
    const contentType = toGeminiMimeType(rawContentType);
    const bytes = new Uint8Array(await videoRes.arrayBuffer());

    const trimStartSeconds = clip.trim_start_seconds as number | null;
    const frameUrls = cloudinaryCloudName
      ? buildFramePreviewUrls(cloudinaryCloudName, clip.video_url as string, trimStartSeconds)
      : [];

    // Gemini gets a downscaled/recompressed re-encode instead of the raw
    // upload whenever Cloudinary is configured — see the comment above
    // buildCompressedVideoUrl for why (raw phone clips routinely blow past
    // the inline base64 ceiling, forcing the flaky Files API path). Falls
    // back to the original bytes if Cloudinary isn't configured or the
    // fetch itself fails, so this never turns into a hard dependency.
    let geminiBytes = bytes;
    let geminiContentType = contentType;
    if (cloudinaryCloudName) {
      try {
        const compressedRes = await fetch(
          buildCompressedVideoUrl(cloudinaryCloudName, clip.video_url as string, trimStartSeconds)
        );
        if (compressedRes.ok) {
          geminiBytes = new Uint8Array(await compressedRes.arrayBuffer());
          // Trust Cloudinary's actual returned header over hardcoding
          // 'video/mp4' — a declared mime type that doesn't match the real
          // container was the likely cause of a 400 even on a tiny,
          // well-under-limit compressed clip (see comment on
          // buildCompressedVideoUrl). f_mp4 in the URL should make this
          // consistently 'video/mp4' now, but reading it directly removes
          // any chance of the two silently drifting apart again.
          geminiContentType = toGeminiMimeType(compressedRes.headers.get('content-type') ?? 'video/mp4');
        }
      } catch (compressErr) {
        console.error('[analyze-highlight-clip] Video compression via Cloudinary failed, using original:', compressErr);
      }
    }

    // Callback memory: pull the last 3 ready clips (any persona) for this
    // user so the prompt can reference past verdicts/notes if it's natural.
    const { data: pastClips } = await adminClient
      .from('highlight_clips')
      .select('verdict_text, overall_text')
      .eq('user_id', user.id)
      .eq('status', 'ready')
      .neq('id', clipId)
      .order('created_at', { ascending: false })
      .limit(3);
    const pastLines = ((pastClips ?? []) as { verdict_text: string | null; overall_text: string | null }[])
      .map((c) => c.verdict_text ?? c.overall_text)
      .filter((t): t is string => !!t)
      .reverse();

    const prompt = promptFor(
      clip.mode as string,
      clip.sport as string | null,
      clip.skill_level as string | null,
      callbackLine(pastLines),
      clip.extra_context as string | null
    );

    let rawText: string | undefined;
    let finishReasonForError = 'UNKNOWN';
    let promptBlockForError: string | undefined;

    // Groq and Gemini now run CONCURRENTLY instead of one-then-the-other —
    // both requests fire at the same time, and whichever comes back with a
    // usable answer wins, preferring Gemini's result when it succeeds
    // (reasons over the real video, not just a couple of still frames) and
    // falling back to Groq's when Gemini doesn't. This is strictly better
    // than the old sequential order on both axes: latency (no longer paying
    // for Groq's full round trip before Gemini even starts) and reliability
    // (Gemini's video ingestion has 400'd INVALID_ARGUMENT consistently in
    // production across three separate fix attempts — Files API
    // buffer/retry, inline base64, forced MP4/H.264 re-encode — including on
    // a tiny 245KB inline payload that rules out size/format as the cause,
    // so it can't be trusted alone; Groq has demonstrably worked, so it's
    // the safety net running in parallel rather than only after Gemini
    // fails).
    const geminiAttempt = (async (): Promise<string> => {
      const useInline = geminiBytes.byteLength <= INLINE_MAX_BYTES;
      // Logged so a failure shows exactly which path was taken and how big
      // the clip actually was.
      console.log(
        `[analyze-highlight-clip] path=${useInline ? 'inline' : 'files-api'} bytes=${geminiBytes.byteLength} (original=${bytes.byteLength}) contentType=${geminiContentType}`
      );
      const videoPart = useInline
        ? { inline_data: { mime_type: geminiContentType, data: bytesToBase64(geminiBytes) } }
        : {
            file_data: {
              mime_type: geminiContentType,
              file_uri: await uploadToGeminiFiles(geminiApiKey, geminiBytes, geminiContentType),
            },
          };

      const geminiData = (await generateWithFallback(geminiApiKey, {
        // Video part first, text second — matches the ordering used in
        // Google's own multimodal examples. Also, as a diagnostic pass
        // against the unconditional 400 INVALID_ARGUMENT (confirmed via DB
        // to have no `details` array, i.e. Google isn't naming a specific
        // bad field), responseSchema/responseMimeType/thinkingConfig are
        // temporarily removed below so this is the simplest possible video
        // request Gemini can receive — video + prompt, nothing else. If
        // this succeeds where the schema'd version failed, the schema+video
        // combination was the incompatibility and structured output can be
        // reintroduced deliberately; if it still 400s, the schema was never
        // the cause and the search moves to API key/project video access.
        contents: [{ role: 'user', parts: [videoPart, { text: prompt }] }],
      })) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        promptFeedback?: { blockReason?: string };
      };
      const candidate = geminiData?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      finishReasonForError = candidate?.finishReason ?? 'UNKNOWN';
      promptBlockForError = geminiData?.promptFeedback?.blockReason;

      if (!text) {
        throw new Error(
          `Empty response from Gemini (finishReason: ${finishReasonForError}${promptBlockForError ? `, blocked: ${promptBlockForError}` : ''}) [path=${useInline ? 'inline' : 'files-api'}, bytes=${geminiBytes.byteLength}]`
        );
      }
      return text;
    })();

    const groqAttempt: Promise<string> =
      groqApiKey && frameUrls.length > 0
        ? generateWithGroq(groqApiKey, frameUrls, prompt)
        : Promise.reject(new Error('Groq not configured'));

    const [geminiResult, groqResult] = await Promise.allSettled([geminiAttempt, groqAttempt]);

    let winningProvider: 'gemini' | 'groq' | null = null;
    if (geminiResult.status === 'fulfilled') {
      rawText = geminiResult.value;
      winningProvider = 'gemini';
    } else if (groqResult.status === 'fulfilled') {
      rawText = groqResult.value;
      winningProvider = 'groq';
      console.error(
        '[analyze-highlight-clip] Gemini failed, using Groq result instead:',
        geminiResult.reason
      );
    }

    if (!rawText) {
      // Both providers failed — surface both errors together so the real
      // cause of each is visible instead of guessing blind.
      const geminiDetail = geminiResult.status === 'rejected' ? String(geminiResult.reason) : 'unknown error';
      const groqDetail = groqResult.status === 'rejected' ? String(groqResult.reason) : 'unknown error';
      throw new Error(`Gemini failed (${geminiDetail}); Groq also failed (${groqDetail})`);
    }

    // responseMimeType: 'application/json' usually means pure JSON back, but
    // Gemini occasionally still tacks on trailing text after the object (or
    // a leading preamble) — slicing to the outermost braces is more robust
    // than assuming the whole string is exactly the JSON payload.
    // Safety net alongside reasoning_effort: 'none' on the Groq call above —
    // if a reasoning trace still leaks through for any reason, strip a
    // complete <think>...</think> block before hunting for JSON braces so a
    // stray reasoning block doesn't get mistaken for the answer.
    rawText = rawText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();

    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      // Include a slice of the actual text and finishReason so we can see
      // whether the provider refused/truncated instead of guessing blind
      // again. finishReasonForError stays 'UNKNOWN' when this came from the
      // Groq fallback path, since that path doesn't have the concept.
      throw new Error(
        `No JSON object found in AI response (finishReason: ${finishReasonForError}). Raw: ${rawText.slice(0, 180)}`
      );
    }
    let parsed: {
      sport?: string;
      overall?: string;
      verdict_score?: number;
      verdict_text?: string;
      best_moment_seconds?: number;
      notes?: Array<{ timestamp_seconds: number; text: string }>;
    };
    try {
      parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
    } catch (parseErr) {
      const parseDetail = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`JSON parse failed (${parseDetail}). Raw: ${rawText.slice(0, 300)}`);
    }

    if (!parsed.overall || !Array.isArray(parsed.notes)) throw new Error('Malformed response from Gemini');

    const clampedScore =
      typeof parsed.verdict_score === 'number' ? Math.max(0, Math.min(10, Math.round(parsed.verdict_score))) : null;

    await adminClient
      .from('highlight_clips')
      .update({
        status: 'ready',
        overall_text: parsed.overall.slice(0, 200),
        sport: clip.sport ?? parsed.sport ?? null,
        verdict_score: clampedScore,
        verdict_text: parsed.verdict_text ? parsed.verdict_text.slice(0, 150) : null,
        best_moment_seconds: typeof parsed.best_moment_seconds === 'number' ? parsed.best_moment_seconds : null,
        error_message: null,
        ai_provider: winningProvider,
      })
      .eq('id', clipId);

    const noteRows = parsed.notes.slice(0, 6).map((n, i) => ({
      clip_id: clipId,
      timestamp_seconds: n.timestamp_seconds ?? 0,
      note_text: (n.text ?? '').slice(0, 200),
      sort_order: i,
    }));
    if (noteRows.length > 0) {
      await adminClient.from('highlight_clip_notes').insert(noteRows);
    }

    return new Response(JSON.stringify({ status: 'ready' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    // Widened from 300 to 1000 — the combined "Gemini failed (...); Groq
    // also failed (...)" message was getting cut off mid-Groq-error, which
    // hid the actual root cause of Groq's failure and made debugging blind.
    const fullMessage = `Could not analyze this clip: ${detail}`.slice(0, 1000);
    await adminClient
      .from('highlight_clips')
      .update({ status: 'failed', error_message: fullMessage })
      .eq('id', clipId);
    console.error('[analyze-highlight-clip]', e);
    // Returning the same detailed message the DB row got (not a generic
    // "Could not analyze this clip") so the client's retry Alert can show
    // the real reason (e.g. Gemini overloaded) without a second round trip.
    return new Response(JSON.stringify({ error: fullMessage }), { status: 500 });
  }
});
