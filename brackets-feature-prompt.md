# Brackets Feature — Claude Code Implementation Prompt

## Context
This is The Rec, a social app for casual/rec-league athletes. Stack: Expo SDK 54, Expo Router 6 (file-based routing), React Native 0.81, React 19, Supabase (Postgres + Auth + Storage), TypeScript strict mode. Path alias `@/*` maps to repo root.

Read CLAUDE.md fully before starting. Key things to know:
- Every new screen must be added as a `<Stack.Screen>` in `app/_layout.tsx` or it won't be reachable
- RLS policies that check group membership must use `SECURITY DEFINER` helper functions (see `is_group_member`, `is_group_owner` pattern in existing migrations) — never inline subqueries on the same table
- Use `useThemeColors()` from `contexts/theme-context.tsx` for all colors, never hardcoded or static imports
- Use `FONTS` from `constants/style.ts` for typography where other screens already use it
- Use `errorMessage(e, fallback)` from `lib/error-message.ts` for Supabase errors, not `e instanceof Error`
- The group detail screen is `app/group/[id].tsx`. Group members are fetched via `fetchGroupDetail(id, userId)` from `lib/groups.ts` which returns `{ group, members }`. `group.myRole` is `'owner' | 'member'`.
- Migrations go in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`. Next timestamp: `20260724000000`.

---

## Feature: Brackets inside Groups

### What to build
A single-elimination tournament bracket system scoped to a group. Accessible from the group detail screen via a "Brackets" button. Supports creating, viewing, and progressing brackets.

---

## Step 1 — Database migration

Create `supabase/migrations/20260724000000_brackets.sql`:

```sql
-- Brackets: single-elimination tournaments scoped to a group
create table brackets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  created_by uuid not null references profiles(id),
  name text not null,
  sport_tag text,
  description text,
  start_date date,
  seeding text not null default 'random' check (seeding in ('random', 'manual')),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now()
);

-- Each slot in the bracket tree
create table bracket_participants (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references brackets(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  display_name text not null, -- snapshot of name at bracket creation time
  seed int not null,           -- 1-based seed order
  created_at timestamptz not null default now(),
  unique(bracket_id, seed)
);

-- One row per match in the bracket
create table bracket_matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references brackets(id) on delete cascade,
  round int not null,          -- 1 = first round, 2 = second, etc.
  match_index int not null,    -- 0-based position within round
  participant_a_id uuid references bracket_participants(id) on delete set null,
  participant_b_id uuid references bracket_participants(id) on delete set null,
  winner_id uuid references bracket_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(bracket_id, round, match_index)
);

-- RLS
alter table brackets enable row level security;
alter table bracket_participants enable row level security;
alter table bracket_matches enable row level security;

-- Group members can read brackets in their groups
create policy "group members read brackets"
  on brackets for select
  using (is_group_member(auth.uid(), group_id));

-- Group members can create brackets
create policy "group members create brackets"
  on brackets for insert
  with check (is_group_member(auth.uid(), group_id) and auth.uid() = created_by);

-- Creator or group owner can update/delete
create policy "bracket creator or owner can update"
  on brackets for update
  using (auth.uid() = created_by or is_group_owner(auth.uid(), group_id));

create policy "bracket creator or owner can delete"
  on brackets for delete
  using (auth.uid() = created_by or is_group_owner(auth.uid(), group_id));

-- Participants and matches: same group membership gate via bracket join
create policy "group members read participants"
  on bracket_participants for select
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));

create policy "group members insert participants"
  on bracket_participants for insert
  with check (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));

create policy "group members read matches"
  on bracket_matches for select
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));

create policy "group members insert matches"
  on bracket_matches for insert
  with check (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));

create policy "group members update matches"
  on bracket_matches for update
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));
```

Apply this migration via the Supabase dashboard SQL editor (project ref: `dtrjnvbldzyqjtbuceou`) before running the app.

---

## Step 2 — Data layer (`lib/brackets.ts`)

Create `lib/brackets.ts` with the following exports. Use `errorMessage` from `lib/error-message.ts` for all errors.

### Types
```ts
export type BracketStatus = 'active' | 'completed';
export type SeedingMethod = 'random' | 'manual';

export type Bracket = {
  id: string;
  groupId: string;
  createdBy: string;
  name: string;
  sportTag: string | null;
  description: string | null;
  startDate: string | null;
  seeding: SeedingMethod;
  status: BracketStatus;
  createdAt: string;
};

export type BracketParticipant = {
  id: string;
  bracketId: string;
  userId: string | null;
  displayName: string;
  seed: number;
};

export type BracketMatch = {
  id: string;
  bracketId: string;
  round: number;
  matchIndex: number;
  participantA: BracketParticipant | null;
  participantB: BracketParticipant | null;
  winnerId: string | null; // participant id
};

export type BracketDetail = {
  bracket: Bracket;
  participants: BracketParticipant[];
  matches: BracketMatch[];
  rounds: number; // total rounds = ceil(log2(participants.length))
};
```

### Functions to implement

**`fetchGroupBrackets(groupId: string): Promise<Bracket[]>`**
Fetch all brackets for the group, ordered by `created_at desc`.

**`fetchBracketDetail(bracketId: string): Promise<BracketDetail | null>`**
Fetch bracket + all participants + all matches. Assemble into `BracketDetail`.

**`createBracket(input: { groupId, createdBy, name, sportTag, description, startDate, seeding, participantIds: string[], participantNames: string[] }): Promise<string>`**
- Insert the bracket row
- If seeding is `'random'`, shuffle `participantIds` randomly before assigning seeds
- If `'manual'`, use the order as provided
- Insert bracket_participants rows (seed = index + 1)
- Generate the full single-elimination match tree:
  - Round 1 has `Math.ceil(participants.length / 2)` matches
  - Pair seeds: [1 vs last, 2 vs second-last, ...] (standard bracket seeding)
  - Insert all bracket_matches rows for all rounds upfront (later rounds have null participants until winners advance)
- Return the new bracket id

**`reportMatchWinner(matchId: string, winnerId: string): Promise<void>`**
- Set `winner_id` on the match
- Find the next round's match where this winner should advance, set them as participant_a or participant_b
- If this was the final match, set bracket status to `'completed'`

---

## Step 3 — Screens and components

### `app/group/brackets/[groupId].tsx` — Bracket list screen

- Header: "Brackets" title + back chevron
- "Create Bracket" button (coral, top right or prominent below header) — visible to all members
- Two sections: **Active** and **Completed** (only show section if it has items)
- Each bracket shown as a card: name, sport tag if set, start date if set, participant count, status badge
- Tap a bracket card → navigate to `app/group/brackets/detail/[bracketId].tsx`
- Empty state: friendly message like "No brackets yet — start one!"

### `app/group/brackets/create/[groupId].tsx` — Create bracket screen

Multi-step form or single scrollable form with these fields:
1. **Bracket name** (required text input)
2. **Sport / activity** (optional — reuse `SportPickerField` from `components/create-post/sport-picker-field.tsx`)
3. **Description** (optional multiline text input)
4. **Start date** (optional — simple text input formatted as YYYY-MM-DD, or a date picker if one is already in the project)
5. **Participants** — show a list of all current group members with checkboxes. At least 2 must be selected. Show member avatars using `InitialsAvatar` from `components/profile/initials-avatar.tsx`.
6. **Seeding method** — two pill buttons: "Random" and "Manual". If Manual is selected, show a drag-to-reorder list of selected participants (or numbered inputs if reorder is complex — keep it simple).
7. **Create** button — disabled until name + 2+ participants selected

On submit: call `createBracket(...)`, navigate to the detail screen on success.

### `app/group/brackets/detail/[bracketId].tsx` — Bracket detail / viewer

- Header: bracket name + back chevron
- Show bracket metadata: sport, description, start date, participant count
- **Bracket tree visualization**: render rounds as columns scrolling horizontally. Each match is a card showing participant A vs participant B, with the winner highlighted. Keep it simple — a `ScrollView` with `horizontal` containing round columns.
- Match card: two rows (participant A, participant B). Tapping a match opens a bottom sheet or `Alert` to select the winner (only if no winner yet and user is a group member). After selecting, call `reportMatchWinner`.
- When bracket is completed, show a "🏆 Champion" banner with the winner's name.

---

## Step 4 — Wire the Brackets button into the group detail screen

In `app/group/[id].tsx`:
- Import a `Trophy` icon (already imported from `lucide-react-native` in this file)
- Add a "Brackets" button/row in the group action buttons section (near where the Invite, Banter, Events buttons live)
- On press: `router.push(`/group/brackets/${id}`)`

---

## Step 5 — Register all new routes in `app/_layout.tsx`

Add these `<Stack.Screen>` entries inside the signed-in `<Stack.Protected>` group:
```tsx
<Stack.Screen name="group/brackets/[groupId]" options={{ headerShown: false }} />
<Stack.Screen name="group/brackets/create/[groupId]" options={{ headerShown: false }} />
<Stack.Screen name="group/brackets/detail/[bracketId]" options={{ headerShown: false }} />
```

---

## Style guidelines
- Follow the existing visual pattern from `app/group/[id].tsx` and `app/group/invite/[id].tsx` — `SafeAreaView`, `ScrollView`, card-style sections with `borderWidth: 1, borderColor: colors.border, borderRadius: RADII.lg`
- Use `colors.coral` for primary actions, `RADII.pill` for pill buttons, `RADII.md` for cards
- `WEIGHT.bold` / `WEIGHT.semibold` for headings (or `FONTS.displaySemibold` where Urbanist is used)
- All colors from `useThemeColors()` — dark mode must work

## Do not
- Add a test suite (none exists)
- Use `e instanceof Error` for Supabase errors — use `errorMessage(e, fallback)`
- Hardcode colors
- Skip registering screens in `_layout.tsx`
