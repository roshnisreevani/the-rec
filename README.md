# Pinnied

A social app for your athletic journey — not your athletic performance.

Built for the casual athlete, not the elite one. Pickup basketball, a new pickleball habit, an office softball league, a friend's first time on a surfboard — moments worth posting, not just PRs. Funny first, impressive second: a self-deprecating highlight is celebrated just as much as a real one. Built around real friend groups and shared history, not strangers, followers, or influencer culture.

## The gap

- **Performance trackers** (Strava, Garmin, Motion) — built around GPS data, splits, and PRs; great for endurance training, intimidating and irrelevant for someone playing two-hand-touch with friends.
- **Serious athlete networks** (PlayersOnly, Sporty, Front Pack) — built around skill level, recruiting, and matchmaking for people who already identify as athletes; earnest in tone, not friend-group-first.
- **General social media** (Instagram, TikTok) — sports content gets buried in an everything-feed, with no structure for tracking who's won the most pickup games this year.

Pinnied is a casual, funny, friend-group-centered space that celebrates showing up and trying something new — not just elite performance.

## Who it's for

- **Casual athletes (18–35)** — play pickup or rec-league sports for fun, not a PR; already post this stuff to Stories or a group chat and just need a permanent, organized home for it.
- **Friend groups / squads** — a regular crew (a Sunday basketball run, an office softball team) that wants a shared record of who's won, inside jokes, and a place to talk trash outside a buried group chat.
- **Hobby starters** — just picked up something new (climbing, pickleball, run club) and want to document the journey from complete beginner to "kind of good now," streak-style, where small wins matter more than stats.

## App structure

Five tabs: **Profile** (identity, upcoming games, game-day type, AI Highlights), **Groups** (create/join, chat, RSVP, brackets, Open Games), a center **+** button (create a post), **Feed** (posts from people you follow), **Banter** (group + DM chat, trash-talk).

## Current features

**Profile**
- Email/password auth via Supabase, with email verification
- Editable profile: name, location, bio ("my legend"), sport tags (135+ activities, searchable multi-select)
- Real profile photo upload
- "Pick your 3" photos (with captions), and a Featured tab of posts promoted from Archive — switchable via a tab toggle on your own profile
- Upcoming — next RSVP'd game/event pulled across all your groups, plus a full My Schedule view
- Game-day type — a short quiz that assigns a personality-style archetype
- AI Highlights — upload a short clip and get AI commentary in one of four personas (Roast, Hype, Commentator, Critique), a score/verdict, timestamped notes you can tap to seek the video, and a private follow-up chat with the AI about your clip
- "Roast me" — generates a random funny bio starter
- Comic-style visual identity — ink outlines, hand-lettered headers, sticker-style badges

**Groups**
- Create/join groups, invites, group chat
- Brackets for group tournaments
- Discover — browse and join Open Games near you (location-based), with waitlists, approval requests, a game-day thread, and a post-game photo recap

**Feed**
- Post photos or videos, with sport tags and optional self-rating
- Reactions and comments, reshare, save posts, and manual archive (soft-delete to a private Archive, not permanent)
- Posts also age out of Feed into Archive on their own after a couple of days (each author's 2 most recent always stay visible); if your Following feed would otherwise look empty, a couple of naturally-aged-out posts are pulled back in so it doesn't feel dead
- Share an AI Highlight clip to Feed as a "trading card" post with its persona badge and score
- Report and block, for a safe space to post in

**Banter**
- Group and 1:1 chat, with reactions, replies/quoting, pinned messages, voice notes, image attachments, custom chat name/icon, and read receipts

**Safety & account**
- Report/block available on posts, comments, messages, game photos, and AI Highlights
- In-app account deletion
- Full privacy policy and terms of service, in-app

## Planned

- Auto-generated recap cards (joke stats: MVP of Vibes, Most Air Balls)
- Animated splash intro
- Rec Check — dual front/back camera capture with a countdown, for candid game-day moments

## Tech stack

- [Expo](https://expo.dev) (React Native), SDK 54, Expo Router
- [Supabase](https://supabase.com) — auth, Postgres database, Storage, Edge Functions
- [Google Gemini API](https://ai.google.dev) — AI Highlights commentary and chat
