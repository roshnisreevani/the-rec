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
  return file.uri;
}

// A 503 ("model overloaded") or 429 (rate limited) is Gemini's shared
// infrastructure being busy at that exact moment — not a problem with the
// request itself, and often clears within a couple seconds. Rather than
// failing the clip outright on the first one, this retries the same model
// once, then falls back to gemini-flash-lite-latest (a separate serving
// pool with its own, larger free-tier quota) before giving up entirely.
// Any other error (bad request, malformed response, etc.) fails immediately
// without burning quota on a doomed retry — that kind of error will fail
// identically on every model/attempt.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const RETRY_DELAY_MS = 1500;

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
      lastError = new Error(`Gemini error (${model}): ${bodyText}`);

      if (res.status !== 503 && res.status !== 429) {
        throw lastError;
      }
      // else: overloaded/rate-limited — loop retries this model once more,
      // then the outer loop moves on to the next model in GEMINI_MODELS.
    }
  }

  throw lastError;
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

function promptFor(mode: string, sport: string | null, skillLevel: string | null, callback: string): string {
  const sportLine = sport
    ? `The sport is ${sport}.`
    : `Figure out what sport/activity this is from the clip and include it as "sport" in your response.`;

  if (mode === 'roast') {
    return `You are watching a ~15 second clip of a friend playing a casual pickup sport (think office softball, weekend pickup basketball, a friend's first surf session) — never professional sports. ${sportLine}

Write a funny, warm, self-deprecating ROAST — like a friend ribbing another friend over text, never mean-spirited, never about their body, always about the play itself. Keep it SIMPLE: everyday words, short punchy sentences, no fancy vocabulary or elaborate metaphors ("majestic", "championship level", "gravity is undefeated" — too much). Think one quick, obvious joke a friend would actually text, not a written bit. verdict_score is a joking "grade" out of 10 (low scores are part of the bit, not an insult) and verdict_text is the punchline that goes with it.${callback}

${RESPONSE_CONTRACT}`;
  }

  if (mode === 'hype') {
    return `You are watching a ~15 second clip of a friend playing a casual pickup sport. ${sportLine}

You are their biggest, most over-the-top HYPE MAN — a sneaker-commercial voiceover crossed with a friend who's had too much Gatorade. Treat every clip like it's the game-winning play, even if it's a beer-league free throw. Big energy, short exclamations, simple words shouted with confidence, zero actual criticism. verdict_score should basically always be high (7-10) — the bit is being delusionally hyped regardless of what actually happened — and verdict_text is a single triumphant tagline.${callback}

${RESPONSE_CONTRACT}`;
  }

  if (mode === 'commentator') {
    return `You are watching a ~15 second clip of a friend playing a casual pickup sport. ${sportLine}

Write it like a live TV sports commentator doing play-by-play on a recreational game as if it were a championship final — dramatic, breathless, slightly absurd given the low stakes, but never mean. Simple words, short punchy sentences, present tense, like you're calling it live. verdict_score is your "post-game rating" and verdict_text is a single dramatic closing line, like a sign-off.${callback}

${RESPONSE_CONTRACT}`;
  }

  const skillLine = skillLevel
    ? `They describe their own skill level as: ${skillLevel}.`
    : `You don't know their skill level, so keep feedback broadly encouraging.`;

  return `You are watching a ~15 second clip of someone playing a casual pickup sport. ${sportLine} ${skillLine}

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
    .select('id, user_id, mode, sport, skill_level, video_url')
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
    .gte('created_at', since);

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
    const fileUri = await uploadToGeminiFiles(geminiApiKey, bytes, contentType);

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
      callbackLine(pastLines)
    );

    const geminiData = (await generateWithFallback(geminiApiKey, {
      contents: [{ parts: [{ text: prompt }, { file_data: { mime_type: contentType, file_uri: fileUri } }] }],
      // gemini-flash-latest (and flash-lite) spend part of their output
      // budget on internal reasoning before writing the actual answer —
      // with maxOutputTokens too low, thinking alone can eat the whole
      // budget and leave zero tokens for the real response (finishReason
      // MAX_TOKENS, empty text), which looked like a total failure
      // regardless of clip content. thinkingBudget: 0 turns reasoning off
      // for this straightforward classification/description task, and the
      // token ceiling is raised as a second safety margin.
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.9,
        responseMimeType: 'application/json',
        // Relying on the prompt alone to produce well-formed JSON left
        // us exposed to Gemini emitting an unescaped quote/control
        // character inside a text field (broke JSON.parse partway
        // through a string, e.g. "Expected ',' or '}'..."). responseSchema
        // makes the API itself constrain and escape output to match this
        // shape, which is a structural guarantee instead of a prompt hint.
        responseSchema: {
          type: 'OBJECT',
          properties: {
            sport: { type: 'STRING' },
            overall: { type: 'STRING' },
            verdict_score: { type: 'NUMBER' },
            verdict_text: { type: 'STRING' },
            best_moment_seconds: { type: 'NUMBER' },
            notes: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  timestamp_seconds: { type: 'NUMBER' },
                  text: { type: 'STRING' },
                },
                required: ['timestamp_seconds', 'text'],
              },
            },
          },
          required: ['overall', 'notes', 'verdict_score', 'verdict_text'],
        },
        thinkingConfig: { thinkingBudget: 0 },
      },
    })) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    const candidate = geminiData?.candidates?.[0];
    const rawText: string | undefined = candidate?.content?.parts?.[0]?.text;
    if (!rawText) {
      // No text at all usually means Gemini stopped for a reason other than
      // finishing normally (e.g. safety filters on the video content) —
      // finishReason (STOP / SAFETY / RECITATION / MAX_TOKENS / OTHER) tells
      // us which, surfacing it beats a bare "empty response".
      const finishReason = candidate?.finishReason ?? 'UNKNOWN';
      const promptBlock = geminiData?.promptFeedback?.blockReason;
      throw new Error(`Empty response from Gemini (finishReason: ${finishReason}${promptBlock ? `, blocked: ${promptBlock}` : ''})`);
    }

    // responseMimeType: 'application/json' usually means pure JSON back, but
    // Gemini occasionally still tacks on trailing text after the object (or
    // a leading preamble) — slicing to the outermost braces is more robust
    // than assuming the whole string is exactly the JSON payload.
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      // Include a slice of the actual text and finishReason so we can see
      // whether Gemini refused/truncated instead of guessing blind again.
      const finishReason = candidate?.finishReason ?? 'UNKNOWN';
      throw new Error(
        `No JSON object found in Gemini response (finishReason: ${finishReason}). Raw: ${rawText.slice(0, 180)}`
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
    const fullMessage = `Could not analyze this clip: ${detail}`.slice(0, 300);
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
