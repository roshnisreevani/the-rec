# The Rec

A social app for your athletic journey — not your athletic performance.

Built for the casual athlete, not the elite one. Pickup basketball, a new pickleball habit, an office softball league, a friend's first time on a surfboard — moments worth posting, not just PRs. Funny first, impressive second: a self-deprecating highlight is celebrated just as much as a real one. Built around real friend groups and shared history, not strangers, followers, or influencer culture.

## The gap

- **Performance trackers** (Strava, Garmin, Motion) — built around GPS data, splits, and PRs; great for endurance training, intimidating and irrelevant for someone playing two-hand-touch with friends.
- **Serious athlete networks** (PlayersOnly, Sporty, Front Pack) — built around skill level, recruiting, and matchmaking for people who already identify as athletes; earnest in tone, not friend-group-first.
- **General social media** (Instagram, TikTok) — sports content gets buried in an everything-feed, with no structure for tracking who's won the most pickup games this year.

The Rec is a casual, funny, friend-group-centered space that celebrates showing up and trying something new — not just elite performance.

## Who it's for

- **Casual athletes (18–35)** — play pickup or rec-league sports for fun, not a PR; already post this stuff to Stories or a group chat and just need a permanent, organized home for it.
- **Friend groups / squads** — a regular crew (a Sunday basketball run, an office softball team) that wants a shared record of who's won, inside jokes, and a place to talk trash outside a buried group chat.
- **Hobby starters** — just picked up something new (climbing, pickleball, run club) and want to document the journey from complete beginner to "kind of good now," streak-style, where small wins matter more than stats.

## App structure

Four tabs: **Profile** (identity, trophy case), **Groups** (create/join, chat, RSVP), **Feed** (posts + search), **Banter** (dedicated trash-talk threads).

## Current features (Profile tab)

- Email/password auth via Supabase
- Editable profile: name, location, bio ("my legend"), sport tags
- Searchable, multi-select sport tags (135+ activities)
- Real profile photo upload
- Walk-up song — search and 30-second preview playback via the iTunes Search API
- "Pick your 3" — user-uploaded photos with custom captions
- Freeform trophy case — self-awarded badges with custom emoji, title, and subtitle
- "Roast me" — generates a random funny bio starter
- Comic-style visual identity — ink outlines, hand-lettered headers, sticker-style badges

## Planned

- **Groups** — create/join, real-time group chat, RSVP polls ("who's in"), rivalry tracking
- **Feed** — posts, photo/video, sport-specific reactions, search
- **Banter** — dedicated trash-talk threads per group, separate from post comments
- **Rec Check** — dual front/back camera capture with a countdown, for candid game-day moments
- Auto-generated recap cards (joke stats: MVP of Vibes, Most Air Balls)
- Animated splash intro

## Tech stack

- [Expo](https://expo.dev) (React Native), SDK 54, Expo Router
- [Supabase](https://supabase.com) — auth, Postgres database, Storage
- iTunes Search API for walk-up song search/preview

