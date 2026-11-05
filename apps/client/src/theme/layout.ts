import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Top padding for screens: ~52px in the design (status bar + 8). */
export function useTopPad(extra = 8) {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'web') return 24;
  return Math.max(insets.top, 20) + extra;
}

export function useBottomPad(min = 20) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, min);
}
