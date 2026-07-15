// Game-day type quiz: a short, low-stakes personality quiz shown on Profile
// in place of the old Pick Your 3 photo grid. Deliberately not about athletic
// skill — every question is about how someone shows up in a group/rec
// setting, so it works for a brand-new user with zero games played and zero
// friends on the app yet. Two questions (1 and 4) are explicitly game-day
// scenarios; the rest are broader so non-players (organizers, first-timers,
// spectators) get a real result too.

export type GameDayType =
  | 'hype_man'
  | 'clutch_gene'
  | 'strategist'
  | 'glue_guy'
  | 'wildcard'
  | 'silent_assassin'
  | 'showboat'
  | 'rookie_energy';

export type GameDayTypeInfo = {
  type: GameDayType;
  label: string;
  description: string;
  icon: string; // Tabler icon name, sans "ti-" prefix
};

export const GAME_DAY_TYPES: Record<GameDayType, GameDayTypeInfo> = {
  hype_man: {
    type: 'hype_man',
    label: 'The Hype Man',
    description: 'Loud energy, keeps everyone’s spirits up no matter the score.',
    icon: 'bolt',
  },
  clutch_gene: {
    type: 'clutch_gene',
    label: 'The Clutch Gene',
    description: 'Wants the ball — or the moment — when it actually matters.',
    icon: 'target',
  },
  strategist: {
    type: 'strategist',
    label: 'The Strategist',
    description: 'Always thinking two steps ahead and organizing the details.',
    icon: 'chess-knight',
  },
  glue_guy: {
    type: 'glue_guy',
    label: 'The Glue Guy',
    description: 'Does the stuff nobody notices but every team needs.',
    icon: 'users',
  },
  wildcard: {
    type: 'wildcard',
    label: 'The Wildcard',
    description: 'Unpredictable, a little chaotic, genuinely fun to have around.',
    icon: 'dice-5',
  },
  silent_assassin: {
    type: 'silent_assassin',
    label: 'The Silent Assassin',
    description: 'Quiet, gets it done, lets the results do the talking.',
    icon: 'moon',
  },
  showboat: {
    type: 'showboat',
    label: 'The Showboat',
    description: 'Lives for the highlight-reel moment and isn’t shy about it.',
    icon: 'star',
  },
  rookie_energy: {
    type: 'rookie_energy',
    label: 'Rookie Energy',
    description: 'All in, still learning, and having the most fun out there.',
    icon: 'sparkles',
  },
};

export type QuizOption = {
  label: string;
  type: GameDayType;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: QuizOption[];
};

export const GAME_DAY_QUIZ: QuizQuestion[] = [
  {
    id: 'final_minute',
    prompt: 'Down by 2, final minute. What are you doing?',
    options: [
      { label: 'Calling for the ball', type: 'clutch_gene' },
      { label: 'Setting up the perfect play', type: 'strategist' },
      { label: 'Hyping the team up', type: 'hype_man' },
      { label: 'Trying something nobody expects', type: 'wildcard' },
    ],
  },
  {
    id: 'group_chat_logistics',
    prompt: 'Group chat blows up about game day logistics. You’re the one who:',
    options: [
      { label: 'Organizes the details', type: 'strategist' },
      { label: 'Hypes everyone to show up', type: 'hype_man' },
      { label: 'Shows up whenever, low-key', type: 'silent_assassin' },
      { label: 'Jokes around and derails it a little', type: 'wildcard' },
    ],
  },
  {
    id: 'nervous_teammate',
    prompt: 'Someone’s nervous before their first time playing with the group. You:',
    options: [
      { label: 'Hype them up, loudly', type: 'hype_man' },
      { label: 'Quietly reassure them one-on-one', type: 'glue_guy' },
      { label: 'Give them a tip or game plan', type: 'strategist' },
      { label: 'Tell them not to overthink it', type: 'wildcard' },
    ],
  },
  {
    id: 'missed_shot',
    prompt: 'Teammate misses an easy shot. You:',
    options: [
      { label: 'Yell "get it next time!"', type: 'hype_man' },
      { label: 'Quietly cover for them next play', type: 'glue_guy' },
      { label: 'Replay it, analyzing what went wrong', type: 'strategist' },
      { label: 'Laugh it off, no big deal', type: 'wildcard' },
    ],
  },
  {
    id: 'step_up',
    prompt: 'Your turn to step up — a big play, organizing the next hangout, or just showing up when no one else will:',
    options: [
      { label: 'You want the pressure', type: 'clutch_gene' },
      { label: 'You do it quietly, no fuss', type: 'silent_assassin' },
      { label: 'You rally others to help', type: 'hype_man' },
      { label: 'You plan it out carefully first', type: 'strategist' },
    ],
  },
  {
    id: 'new_to_group',
    prompt: 'You’re new to a group. Your instinct:',
    options: [
      { label: 'Jump in and learn as you go', type: 'rookie_energy' },
      { label: 'Hang back and observe first', type: 'silent_assassin' },
      { label: 'Crack jokes to fit in', type: 'wildcard' },
      { label: 'Find one person to team up with', type: 'glue_guy' },
    ],
  },
  {
    id: 'what_people_want',
    prompt: 'What do people usually come to you for?',
    options: [
      { label: 'Energy', type: 'hype_man' },
      { label: 'The plan', type: 'strategist' },
      { label: 'A laugh', type: 'showboat' },
      { label: 'Reliability', type: 'glue_guy' },
    ],
  },
];

/**
 * Tallies picked types and returns the most-frequent one. Ties break by
 * whichever type was picked first in question order, so the result always
 * reflects the earliest strong signal rather than an arbitrary object-key
 * order.
 */
export function scoreQuiz(answers: GameDayType[]): GameDayType {
  const counts = new Map<GameDayType, number>();
  const firstSeenOrder: GameDayType[] = [];

  for (const type of answers) {
    if (!counts.has(type)) firstSeenOrder.push(type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  let best: GameDayType = firstSeenOrder[0] ?? 'rookie_energy';
  let bestCount = 0;
  for (const type of firstSeenOrder) {
    const count = counts.get(type) ?? 0;
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}
