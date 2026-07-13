// The Rec's brand style — clean, neutral, one accent color used sparingly.
// Applies to Profile, Settings, and Auth. Light/dark values live here;
// components read the active palette via useThemeColors() rather than a
// static import, so everything reacts to the Dark Mode toggle in Settings.

export type ThemeColors = {
  background: string; // page/card surface color
  text: string; // primary text, icons, borders on outlined elements
  textSecondary: string; // secondary/quiet text
  border: string; // hairline borders, dividers
  borderSoft: string; // even quieter dividers (e.g. row separators)
  coral: string; // primary accent ("red") — buttons, active states, highlights,
  // high-energy elements like the 🔥 reaction and "HOT" badges
  blue: string; // secondary accent — informational/connection elements: links,
  // comment counts, the "no way" reaction, anything connections-related
  danger: string; // destructive actions
};

export const LIGHT_COLORS: ThemeColors = {
  background: '#FFFFFF',
  text: '#14141A',
  textSecondary: '#8A8578',
  border: '#DEDCD6',
  borderSoft: '#EEEDEA',
  coral: '#E31C24',
  blue: '#3D5AFE',
  danger: '#D92626',
};

export const DARK_COLORS: ThemeColors = {
  background: '#000000',
  text: '#FFFFFF',
  textSecondary: '#8A8A8A',
  border: '#2A2A2A',
  borderSoft: '#3A3A3A',
  coral: '#E31C24',
  blue: '#3D5AFE',
  danger: '#FF6B5E',
};

export const WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const RADII = {
  sm: 8,
  md: 10,
  lg: 13,
  pill: 999,
} as const;

export const HAIRLINE = 1;

// Coral doesn't change between themes, so text/icons drawn on top of a
// coral-filled element (buttons, the pulsing play button, etc.) should
// always be this fixed white — not the theme's `background`, which flips
// to black in dark mode and would otherwise land black-on-coral there.
export const ON_ACCENT = '#FFFFFF';

// Fixed gold used for "legendary"/standout highlights (the Trophy Case's
// legendary slot, Feed's Post of the Week badge). Theme-independent
// for the same reason as ON_ACCENT above.
export const GOLD = '#D4AF37';

// Fixed near-black "locker room" surface used by Feed's session headers,
// transition cards, and end-of-feed card — these are deliberately dark in
// both light and dark mode (a consistent "tunnel" break between sessions),
// so like ON_ACCENT/GOLD this doesn't come from the theme palette.
export const DARK_SURFACE = '#14141A';
export const ON_DARK_SURFACE = '#FFFFFF';
export const ON_DARK_SURFACE_SECONDARY = '#9A968C';

// Custom brand fonts, loaded in app/_layout.tsx. FONTS.display is the main
// headline font (Space Grotesk — geometric, distinct from the system font,
// used for wordmarks/names/section titles). FONTS.marker is a bold
// handwritten accent font used sparingly for playful moments.
export const FONTS = {
  display: 'Urbanist_700Bold',
  displaySemibold: 'Urbanist_600SemiBold',
  displayMedium: 'Urbanist_500Medium',
  displayRegular: 'Urbanist_400Regular',
  marker: 'PermanentMarker_400Regular',
} as const;
