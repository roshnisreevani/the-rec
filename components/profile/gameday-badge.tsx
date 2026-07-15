import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { GameDayType } from '@/lib/gameday-quiz';

type Props = {
  type: GameDayType;
  size?: number;
};

// Custom badge marks per game-day type — a solid red/blue circle (matching
// the crest avatar's palette) with a simple white glyph cut into it. Deliberately
// hand-drawn rather than a stock icon font, per spec. Coordinates are on a
// 0-100 viewBox so `size` just scales the whole thing.
const RED = '#E31C24';
const BLUE = '#2F6BFF';

const FILL_BY_TYPE: Record<GameDayType, string> = {
  hype_man: RED,
  clutch_gene: BLUE,
  strategist: RED,
  glue_guy: BLUE,
  wildcard: RED,
  silent_assassin: BLUE,
  showboat: RED,
  rookie_energy: BLUE,
};

export function GameDayBadge({ type, size = 20 }: Props) {
  const fill = FILL_BY_TYPE[type];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="42" fill={fill} />
      {renderGlyph(type)}
    </Svg>
  );
}

function renderGlyph(type: GameDayType) {
  switch (type) {
    case 'hype_man':
      return (
        <>
          <Path
            d="M30 38 Q30 30 40 30 L62 30 Q70 30 70 38 L70 52 Q70 60 62 60 L46 60 L36 68 L38 60 Q30 59 30 52 Z"
            fill="#FFFFFF"
          />
          <Circle cx="42" cy="45" r="2.5" fill={FILL_BY_TYPE.hype_man} />
          <Circle cx="50" cy="45" r="2.5" fill={FILL_BY_TYPE.hype_man} />
          <Circle cx="58" cy="45" r="2.5" fill={FILL_BY_TYPE.hype_man} />
        </>
      );
    case 'clutch_gene':
      return (
        <>
          <Rect x="30" y="27" width="40" height="6" rx="3" fill="#FFFFFF" />
          <Path d="M33 33 Q33 47 50 47 Q67 47 67 33" fill="none" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
          <Circle cx="50" cy="62" r="9" fill="#FFFFFF" />
        </>
      );
    case 'strategist':
      return (
        <>
          <Circle cx="50" cy="34" r="7" fill="#FFFFFF" />
          <Path d="M40 44 L60 44 L64 66 L36 66 Z" fill="#FFFFFF" />
          <Rect x="33" y="66" width="34" height="6" rx="3" fill="#FFFFFF" />
        </>
      );
    case 'glue_guy':
      return (
        <Path
          d="M40 23 L58 23 L58 29 Q64 29 64 35 Q64 41 58 41 L58 57 L40 57 L40 47 Q34 47 34 41 Q34 35 40 35 Z"
          fill="#FFFFFF"
        />
      );
    case 'wildcard':
      return (
        <>
          <Rect x="34" y="15" width="32" height="46" rx="5" fill="#FFFFFF" />
          <Path
            d="M50 27 L53 34 L61 34 L54 39 L57 47 L50 42 L43 47 L46 39 L39 34 L47 34 Z"
            fill={FILL_BY_TYPE.wildcard}
            opacity={0.9}
          />
        </>
      );
    case 'silent_assassin':
      return (
        <>
          <Path
            d="M67 20 A22 22 0 1 1 46 23 A16 16 0 1 0 67 20 Z"
            fill="#FFFFFF"
          />
          <Path d="M60 13 L62 18 L67 18 L63 21 L65 26 L60 23 L55 26 L57 21 L53 18 L58 18 Z" fill="#FFFFFF" />
        </>
      );
    case 'showboat':
      return (
        <>
          <Path d="M38 12 L38 22 Q38 36 50 36 Q62 36 62 22 L62 12 Z" fill="#FFFFFF" />
          <Path d="M38 14 Q28 14 28 24 Q28 32 38 30" fill="none" stroke="#FFFFFF" strokeWidth={3} />
          <Path d="M62 14 Q72 14 72 24 Q72 32 62 30" fill="none" stroke="#FFFFFF" strokeWidth={3} />
          <Rect x="46" y="36" width="8" height="8" fill="#FFFFFF" />
          <Rect x="38" y="46" width="24" height="5" rx="2" fill="#FFFFFF" />
        </>
      );
    case 'rookie_energy':
      return (
        <>
          <Path d="M50 72 L50 42" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
          <Path d="M50 44 Q33 44 30 28 Q47 28 50 44 Z" fill="#FFFFFF" />
          <Path d="M50 50 Q67 50 70 34 Q53 34 50 50 Z" fill="#FFFFFF" />
        </>
      );
  }
}
