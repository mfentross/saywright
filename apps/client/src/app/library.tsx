import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@saywright/player';
import { H1, IconTile, Mono, PillButton, Row, Screen, SectionLabel, TabBar } from '../components/ui';
import { color, font, space } from '../theme/tokens';
import { library } from '../data/mock';

export default function Library() {
  return (
    <Screen scroll footer={<TabBar />}>
      <Row style={{ paddingHorizontal: space.side, justifyContent: 'space-between' }}>
        <H1>My apps</H1>
        <PillButton icon="plus" variant="dark" height={44} accessibilityLabel="Create a new app" onPress={() => router.replace('/')} />
      </Row>

      {/* Success banner */}
      <View style={{ marginHorizontal: space.side, marginTop: 18, backgroundColor: color.ink, borderRadius: 22, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={16} color={color.ink} strokeWidth={3} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 17, color: color.dark.text }}>Thirsty is live</Text>
            <Text style={{ fontFamily: font.body, fontSize: 14, lineHeight: 20, color: '#C9C9C2' }}>
              It's on your home screen. App Store and Google Play review is under way, so invite your flatmates now.
            </Text>
          </View>
        </View>
        <Row style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: color.dark.text, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Icon name="share" size={16} color={color.ink} strokeWidth={2} />
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>Invite flatmates</Text>
          </Pressable>
          <PillButton label="Open" variant="darkOutline" height={44} onPress={() => router.push('/fullscreen')} textStyle={{ fontSize: 15, fontFamily: font.medium }} style={{ paddingHorizontal: 18 }} />
        </Row>
      </View>

      <View style={{ paddingHorizontal: space.side, paddingTop: 22, gap: 10 }}>
        <SectionLabel>Live</SectionLabel>
        <Group>
          {library.live.map((a, i) => (
            <AppRow key={a.name} first={i === 0} onPress={() => router.push('/test-drive')} label={`${a.name}, ${a.status}`}>
              <IconTile icon={a.icon} bg={a.bg} fg={a.fg} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>{a.name}</Text>
                <Mono>{a.status}</Mono>
              </View>
              <Icon name="chevronRight" size={18} color={color.mutedMono} />
            </AppRow>
          ))}
        </Group>
      </View>

      <View style={{ paddingHorizontal: space.side, paddingTop: 22, gap: 10 }}>
        <SectionLabel>Testing & building</SectionLabel>
        <Group>
          <AppRow first onPress={() => router.push('/test-drive')} label="Gym timer, Testing · v2. Test">
            <IconTile icon="clock" bg="#2B2B28" fg="#FFFFFF" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>Gym timer</Text>
              <Mono>Testing · v2</Mono>
            </View>
            <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.ink }}>Test</Text>
          </AppRow>
          <AppRow onPress={() => router.push('/building')} label="Recipe box, building">
            <IconTile icon="book" bg={color.divider} fg={color.ink} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>Recipe box</Text>
              <View style={{ height: 5, borderRadius: 3, backgroundColor: color.divider, overflow: 'hidden' }}>
                <View style={{ width: '60%', height: 5, borderRadius: 3, backgroundColor: color.accent }} />
              </View>
            </View>
            <Mono>Building</Mono>
          </AppRow>
        </Group>
      </View>
    </Screen>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: 20, overflow: 'hidden' }}>{children}</View>;
}

function AppRow({ children, first, onPress, label }: { children: ReactNode; first?: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: color.divider,
        backgroundColor: pressed ? '#F7F7F3' : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );
}
