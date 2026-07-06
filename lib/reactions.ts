export type ReactionType = 'fire' | 'respect' | 'no_way' | 'rough';

export type ReactionAccent = 'red' | 'blue' | 'neutral';

export type ReactionMeta = {
  type: ReactionType;
  emoji: string;
  label: string;
  // Which shared accent (see constants/style.ts) this reaction's active state
  // uses. "red" -> colors.coral, "blue" -> colors.blue, "neutral" -> colors.text.
  accent: ReactionAccent;
};

// Order here is the display order of the pills.
export const REACTIONS: ReactionMeta[] = [
  { type: 'fire', emoji: '🔥', label: 'fire', accent: 'red' },
  { type: 'respect', emoji: '👏', label: 'respect', accent: 'neutral' },
  { type: 'no_way', emoji: '😳', label: 'no way', accent: 'blue' },
  { type: 'rough', emoji: '💀', label: "that's rough", accent: 'neutral' },
];

export function reactionMeta(type: ReactionType): ReactionMeta {
  return REACTIONS.find((r) => r.type === type) ?? REACTIONS[0];
}

// A post crossing this many total reactions gets the red "HOT" badge.
export const HOT_THRESHOLD = 25;

// "Post of the Week" looks at total reactions within this rolling window.
export const POST_OF_WEEK_WINDOW_DAYS = 7;
