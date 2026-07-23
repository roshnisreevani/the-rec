I'm working on an Edge Function called `analyze-highlight-clip` in a Supabase-backed Expo/React Native app ("The Rec"). File: `supabase/functions/analyze-highlight-clip/index.ts`.

**What it does:** Users upload a short (~15s) clip of themselves playing a casual sport. The function analyzes it in one of four personas (Roast, Hype, Commentator, Critique) and returns a short overall verdict + timestamped notes as JSON, stored in the `highlight_clips` / `highlight_clip_notes` tables.

**Architecture:** Gemini (primary, analyzes the actual video via inline base64 or Files API) and Groq (secondary, analyzes 2 still frames extracted via Cloudinary) run CONCURRENTLY via `Promise.allSettled`. Whichever succeeds first is used, Gemini preferred if both succeed. This exists because Gemini's video ingestion has been unreliable in production (see below).

**Known issues / history:**
1. Gemini's Files API has a documented propagation race (status says ACTIVE before the file is actually readable by generateContent), causing intermittent 400 INVALID_ARGUMENT. Mitigated with a buffer + retry, not fully fixed.
2. Switched to inline base64 for clips under ~14MB to avoid the Files API race entirely. Even so, Gemini has still 400'd unconditionally across every payload variant tried (Files API, inline, tiny 245KB compressed clips) — currently suspected to be an account/API-key-level restriction on video input for this specific Gemini key, not something fixable from request-payload changes. This is unresolved.
3. Groq free tier has an 8000 TPM (tokens-per-minute) limit; vision token cost scales with image pixel count, not JPEG compression. Fixed by using only 2 frames at 384px width.
4. Groq's `response_format: { type: 'json_object' }` (strict JSON mode) is broken when combined with image inputs on the `qwen/qwen3.6-27b` model — it silently returns an empty, unparseable response. Just fixed (deployed as v34) by removing `response_format` and relying on prompt instructions + brace-slicing to extract JSON from the raw response. NOT YET CONFIRMED WORKING — needs a real test + DB check.

**How I debug this:** Screenshots the user sends are frequently stale/cached and NOT reliable. Always verify via direct Supabase SQL query instead:
```sql
select id, mode, status, error_message, created_at from highlight_clips order by created_at desc limit 3;
```
`error_message` is stored up to 1000 chars (widened from 300, since combined Gemini+Groq error messages were getting truncated mid-sentence and hiding the real cause).

**Where things stand:** v34 just deployed with the Groq JSON-mode fix. Next step is to have the user submit a test clip, then check the DB directly (not a screenshot) to confirm whether Groq now succeeds and the feature works end-to-end via the Gemini+Groq concurrent fallback. Gemini's underlying video-ingestion 400 is a known, currently-unresolved limitation that repeated payload/format changes haven't fixed — treat further attempts at that specific problem with skepticism unless there's new evidence.

Supabase project ref: `dtrjnvbldzyqjtbuceou`.
