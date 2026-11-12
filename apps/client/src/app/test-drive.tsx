import { useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Player } from '@saywright/player';
import { Chip, ChipRow, Footer, IconButton, Row, Tag, TopBar } from '../components/ui';
import { InputBar } from '../components/InputBar';
import { useCurrentSandbox } from '../data/sandbox';
import { changeSuggestions } from '../data/mock';
import { color, font, space } from '../theme/tokens';
import { useTopPad } from '../theme/layout';
import { PillButton } from '../components/ui';
import { useChange } from '../data/useChange';
import { useFlow } from '../data/store';

export default function TestDrive() {
  const top = useTopPad();
  const { sandbox: sb, key } = useCurrentSandbox();
  const state = useSyncExternalStore(sb.subscribe, sb.getState, sb.getState);
  const people = sb.blueprint.sample.people;
  const viewing = people.find((p) => p.id === state.viewAs);
  const nextPerson = people[(people.findIndex((p) => p.id === state.viewAs) + 1) % people.length]!;
  const daysAhead = Math.round(state.clockOffset / 86_400_000);
  const change = useChange();
  const { project } = useFlow();
  const changing = change.status === 'changing';

  return (
    <View style={{ flex: 1, backgroundColor: color.ground, paddingTop: top }}>
      <TopBar
        backLabel="Back to builder"
        onBack={() => router.replace('/building')}
        title={sb.blueprint.name}
        subtitle={<Tag>{`Test drive · v${project?.version ?? 1}`}</Tag>}
        right={<IconButton icon="reset" label="Reset test data" onPress={() => sb.reset()} />}
      />

      {/* Inline preview: the real app, rendered from its blueprint in the sandbox */}
      <View
        style={{
          marginTop: 16,
          marginHorizontal: space.side,
          height: 432,
          borderWidth: 6,
          borderColor: color.ink,
          borderRadius: 34,
          overflow: 'hidden',
          backgroundColor: sb.blueprint.theme.background,
        }}
      >
        <Player
          key={key}
          sandbox={sb}
          density="compact"
          banner={
            <Text style={{ backgroundColor: '#DDEBD6', color: '#1E4D33', fontFamily: font.mono, fontSize: 11, textAlign: 'center', paddingVertical: 7 }}>
              Sample data · nothing is saved
            </Text>
          }
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Test fullscreen"
          onPress={() => router.push('/fullscreen')}
          style={{ position: 'absolute', top: 34, right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="expand" size={16} color="#FFFFFF" strokeWidth={2} />
          </View>
        </Pressable>
      </View>

      {/* Sandbox tools: look at the app as someone else, or skip ahead in time */}
      <Row style={{ marginHorizontal: space.side, marginTop: 10, gap: 8, justifyContent: 'center' }}>
        <SandboxTool
          label={`Viewing as ${viewing?.id === sb.blueprint.sample.me ? 'you' : viewing?.name}`}
          a11y={`Viewing as ${viewing?.name}. Switch to ${nextPerson.name}`}
          onPress={() => sb.setViewAs(nextPerson.id)}
        />
        <SandboxTool
          label={daysAhead ? `Skip a day · +${daysAhead}d` : 'Skip a day'}
          a11y="Skip ahead one day to test reminders"
          onPress={() => sb.advance(86_400_000)}
        />
      </Row>

      <View style={{ paddingTop: 12, gap: 10 }}>
        <View style={{ paddingHorizontal: space.side }}>
          <InputBar placeholder={changing ? 'Changing…' : 'Tell Saywright what to change…'} onSubmit={(t) => !changing && change.request(t)} />
        </View>
        <ChipRow>
          {changeSuggestions.map((c) => (
            <Chip key={c} label={c} height={40} transparent onPress={() => !changing && change.request(c)} />
          ))}
        </ChipRow>
      </View>

      {change.step || change.message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            marginHorizontal: space.side,
            marginTop: 10,
            fontFamily: change.status === 'done' ? font.semibold : font.body,
            fontSize: 14,
            lineHeight: 20,
            color: change.status === 'done' ? '#1E6A43' : color.ink,
          }}
        >
          {change.step ? `${change.step}…` : change.message}
        </Text>
      ) : null}

      <View style={{ flex: 1 }} />
      <Footer style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text style={{ fontFamily: font.body, fontSize: 13, color: color.muted }}>Like it?</Text>
          <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>Keep it from €4.99 / month</Text>
        </View>
        <PillButton label="Keep this app" onPress={() => router.push('/purchase')} />
      </Footer>
    </View>
  );
}

function SandboxTool({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: pressed ? color.divider : 'transparent',
        justifyContent: 'center',
      })}
    >
      <Text style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: color.mutedMono }}>{label}</Text>
    </Pressable>
  );
}
