import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_500Medium, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { color } from '../theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* On wide web screens, keep the phone-sized layout centered. */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#E3E3DD' : color.ground, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }}>
            <Stack.Screen name="voice" options={{ animation: 'fade', contentStyle: { backgroundColor: color.dark.bg } }} />
            <Stack.Screen name="fullscreen" options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
          </Stack>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
