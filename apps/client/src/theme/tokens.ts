/** Saywright design tokens (docs/HANDOFF.md). Generated apps use their own blueprint theme. */
export const color = {
  ground: '#EFEFEA',
  surface: '#FFFFFF',
  ink: '#141414',
  line: '#DADAD3',
  divider: '#E6E6E0',
  control: '#D4D4CC',
  muted: '#55554F',
  mutedMono: '#5C5C57',
  placeholder: '#6B6B65',
  note: '#3E3E3A',
  quiet: '#9A9A93',
  accent: '#FF4F12',
  amber: '#FFB000',
  green: '#7CDB5B',
  dark: {
    bg: '#141414',
    text: '#F4F4EF',
    secondary: '#9A9A93',
    tertiary: '#B4B4AD',
    border: '#3A3A36',
  },
} as const;

/** Font family names as loaded in src/app/_layout.tsx. */
export const font = {
  display: 'BricolageGrotesque_700Bold',
  displayMedium: 'BricolageGrotesque_500Medium',
  body: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export const space = { side: 20 } as const;

export const radius = { card: 20, cardLarge: 24, tile: 12, tileLarge: 15, pill: 999 } as const;

/** Letter spacing in px from em, since React Native takes absolute values. */
export const tracking = (em: number, size: number) => em * size;
