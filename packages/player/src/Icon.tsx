import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ReactElement } from 'react';

/** 24px-viewBox stroke icons. Paths taken from the design handoff. */
const PATHS = {
  back: [<Path key="a" d="M15 5l-7 7 7 7" />],
  chevronRight: [<Path key="a" d="M9 5l7 7-7 7" />],
  mic: [
    <Path key="a" d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />,
    <Path key="b" d="M19 11a7 7 0 0 1-14 0" />,
    <Path key="c" d="M12 18v3" />,
  ],
  micSmall: [
    <Path key="a" d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />,
    <Path key="b" d="M19 11a7 7 0 0 1-14 0" />,
  ],
  droplet: [<Path key="a" d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />],
  check: [<Path key="a" d="M5 12.5l4.5 4.5L19 7" />],
  play: [<Path key="a" d="M8 5.5v13l10-6.5z" />],
  phone: [<Rect key="a" x="6" y="2.5" width="12" height="19" rx="2.5" />, <Path key="b" d="M11 18.5h2" />],
  bag: [
    <Path key="a" d="M4 8h16l-1.2 11a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" />,
    <Path key="b" d="M9 8V6.5a3 3 0 0 1 6 0V8" />,
  ],
  link: [
    <Path key="a" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />,
    <Path key="b" d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  ],
  shield: [<Path key="a" d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />, <Path key="b" d="M9 12l2 2 4-4" />],
  close: [<Path key="a" d="M6 6l12 12M18 6L6 18" />],
  sprout: [
    <Path key="a" d="M12 21V11" />,
    <Path key="b" d="M12 11c0-4 3-6 7-6 0 4-3 6-7 6z" />,
    <Path key="c" d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z" />,
  ],
  plus: [<Path key="a" d="M12 5v14M5 12h14" />],
  calendar: [<Rect key="a" x="4" y="5" width="16" height="15" rx="2" />, <Path key="b" d="M4 10h16M9 3v4M15 3v4" />],
  people: [
    <Circle key="a" cx="9" cy="8" r="3.5" />,
    <Path key="b" d="M2.5 20a6.5 6.5 0 0 1 13 0" />,
    <Path key="c" d="M16 4.5a3.5 3.5 0 0 1 0 7" />,
    <Path key="d" d="M18 14a6.5 6.5 0 0 1 3.5 6" />,
  ],
  share: [
    <Path key="a" d="M12 3v13" />,
    <Path key="b" d="M7 8l5-5 5 5" />,
    <Path key="c" d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />,
  ],
  clock: [<Circle key="a" cx="12" cy="13" r="8" />, <Path key="b" d="M12 9v4l2 2" />, <Path key="c" d="M9 2h6" />],
  book: [<Path key="a" d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />],
  create: [<Circle key="a" cx="12" cy="12" r="9" />, <Path key="b" d="M12 8v8M8 12h8" />],
  grid: [
    <Rect key="a" x="4" y="4" width="7" height="7" rx="1.5" />,
    <Rect key="b" x="13" y="4" width="7" height="7" rx="1.5" />,
    <Rect key="c" x="4" y="13" width="7" height="7" rx="1.5" />,
    <Rect key="d" x="13" y="13" width="7" height="7" rx="1.5" />,
  ],
  person: [<Circle key="a" cx="12" cy="8" r="4" />, <Path key="b" d="M4 21a8 8 0 0 1 16 0" />],
  arrowUp: [<Path key="a" d="M12 19V5" />, <Path key="b" d="M5 12l7-7 7 7" />],
  info: [<Circle key="a" cx="12" cy="12" r="9" />, <Path key="b" d="M12 11v5M12 8h.01" />],
  reset: [<Path key="a" d="M4 12a8 8 0 1 0 2.3-5.6" />, <Path key="b" d="M4 4v4h4" />],
  expand: [
    <Path key="a" d="M14 4h6v6" />,
    <Path key="b" d="M10 20H4v-6" />,
    <Path key="c" d="M20 4l-7 7" />,
    <Path key="d" d="M4 20l7-7" />,
  ],
  keyboard: [
    <Rect key="a" x="3" y="6" width="18" height="12" rx="2" />,
    <Path key="b" d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />,
  ],
  pause: [
    <Rect key="a" x="7" y="6" width="3.5" height="12" rx="1" />,
    <Rect key="b" x="13.5" y="6" width="3.5" height="12" rx="1" />,
  ],
  // Blueprint icons not in the handoff, drawn in the same style.
  list: [<Path key="a" d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />],
  star: [<Path key="a" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />],
  heart: [<Path key="a" d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />],
  home: [<Path key="a" d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />],
  bell: [<Path key="a" d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />, <Path key="b" d="M10 20.5a2 2 0 0 0 4 0" />],
  cart: [
    <Path key="a" d="M3 4h2.5l2.2 11h10.6L20.5 7H6.4" />,
    <Circle key="b" cx="9" cy="19.5" r="1.5" />,
    <Circle key="c" cx="17" cy="19.5" r="1.5" />,
  ],
  dumbbell: [<Path key="a" d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />],
  forward: [<Path key="a" d="M5 12h14M13 6l6 6-6 6" />],
} satisfies Record<string, ReactElement[]>;

export type IconKey = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  color = '#141414',
  strokeWidth = 1.8,
  fill = 'none',
}: {
  name: IconKey;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {PATHS[name]}
    </Svg>
  );
}
