import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Player } from '@saywright/player';
import { useCurrentSandbox } from '../data/sandbox';
import { color, font } from '../theme/tokens';
import { goBack } from '../components/ui';

/**
 * The generated app, full-bleed. The ONLY Saywright UI is the small ✕ (44px hit area).
 * Long-press the ✕ for "Change something" / "Keep this app".
 */
export default function FullscreenTest() {
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const { sandbox, key } = useCurrentSandbox();
  const top = Math.max(insets.top, 12);

  return (
    <View style={{ flex: 1 }}>
      <Player key={key} sandbox={sandbox} topInset={top} bottomInset={insets.bottom} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Exit test and go back to Saywright"
        accessibilityHint="Long press for more options"
        onPress={() => (menu ? setMenu(false) : exit())}
        onLongPress={() => setMenu(true)}
        hitSlop={4}
        style={{ position: 'absolute', top: top + 2, right: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: 'rgba(20,20,20,0.62)',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
          }}
        >
          <Icon name="close" size={14} color="#FFFFFF" strokeWidth={2.4} />
        </View>
      </Pressable>

      {menu ? (
        <View
          accessibilityViewIsModal
          style={{
            position: 'absolute',
            top: top + 50,
            right: 12,
            backgroundColor: 'rgba(20,20,20,0.94)',
            borderRadius: 18,
            padding: 6,
            minWidth: 210,
          }}
        >
          <MenuItem label="Change something" onPress={() => { setMenu(false); exit(); }} />
          <MenuItem label="Keep this app" onPress={() => { setMenu(false); router.replace('/purchase'); }} />
        </View>
      ) : null}
    </View>
  );
}

function exit() {
  if (router.canGoBack()) goBack();
  else router.replace('/test-drive');
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12 }}>
      <Text style={{ fontFamily: font.medium, fontSize: 15, color: color.dark.text }}>{label}</Text>
    </Pressable>
  );
}
