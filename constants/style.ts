// The Rec's brand style — a scrappy, hand-lettered "locker room notebook" look.
// Used by the Profile tab (and anything else that wants to match it going forward).

export const COLORS = {
  cream: '#F6F0E4',
  ink: '#1C1A17',
  coral: '#FF5A36',
  mustard: '#F2B705',
  blue: '#3D5AFE',
  white: '#FFFFFF',
} as const;

// Rotation used for things like trophy stickers, so accents don't feel random.
export const ACCENT_ROTATION = [COLORS.coral, COLORS.mustard, COLORS.blue] as const;

// Text color that stays readable on top of a given accent fill.
export function textOnAccent(accent: string): string {
  return accent === COLORS.mustard ? COLORS.ink : COLORS.white;
}

export const FONTS = {
  // Hand-lettered display font for section headers / big moments.
  display: 'PermanentMarker_400Regular',
  // Body/UI font.
  body: 'SpaceGrotesk_400Regular',
  bodyMedium: 'SpaceGrotesk_500Medium',
  bodyBold: 'SpaceGrotesk_700Bold',
} as const;

export const RADII = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const BORDER = {
  width: 2.5,
  color: COLORS.ink,
} as const;
