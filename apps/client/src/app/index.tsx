import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@saywright/player';
import { Body, Card, Chip, ChipRow, H1, IconButton, IconTile, Logo, Mono, PillButton, Row, Screen, SectionLabel, TabBar } from '../components/ui';
import { color, font, space } from '../theme/tokens';
import { draft, starterIdeas } from '../data/mock';
import { flow, useFlow } from '../data/store';
import { loadExample } from '../data/sandbox';

export default function Create() {
  const { idea } = useFlow();
  return (
    <Screen scroll footer={<TabBar />}>
      <Row style={{ paddingHorizontal: space.side, justifyContent: 'space-between' }}>
        <Logo />
        <IconButton icon="person" label="Account" onPress={() => router.push('/account')} />
      </Row>

      <View style={{ paddingHorizontal: space.side, paddingTop: 28, gap: 10 }}>
        <H1 size={38} style={{ lineHeight: 39 }}>
          What app do you need today?
        </H1>
        <Body>Say it or type it in your own words. Saywright builds a working app you can test before you decide to keep it.</Body>
      </View>

      <Card style={{ marginHorizontal: space.side, marginTop: 22, borderRadius: 24, padding: 16, gap: 8 }}>
        <SectionLabel>Your idea</SectionLabel>
        <TextInput
          value={idea}
          onChangeText={(v) => flow.set({ idea: v, fromVoice: false })}
          multiline
          placeholder="e.g. My flatmates and I keep forgetting to water the plants. Remind whoever's turn it is…"
          placeholderTextColor={color.placeholder}
          accessibilityLabel="Your idea"
          style={{ height: 88, fontFamily: font.body, fontSize: 17, lineHeight: 23, color: color.ink, textAlignVertical: 'top', padding: 0 }}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="plus" label="Attach a sketch or screenshot" />
          <Row style={{ gap: 10 }}>
            <PillButton
              label="Speak"
              icon="mic"
              height={56}
              accessibilityLabel="Speak your idea"
              onPress={() => router.push('/voice')}
              style={{ paddingLeft: 16, paddingRight: 20 }}
              textStyle={{ fontSize: 15 }}
            />
            <PillButton
              icon="arrowUp"
              variant="dark"
              height={56}
              accessibilityLabel="Build this app"
              onPress={() => router.push('/building')}
            />
          </Row>
        </Row>
      </Card>

      <View style={{ paddingTop: 24, gap: 10 }}>
        <SectionLabel style={{ paddingHorizontal: space.side }}>Or start from</SectionLabel>
        <ChipRow>
          {starterIdeas.map((s) => (
            <Chip key={s} label={s} onPress={() => flow.set({ idea: `${s}: ` })} />
          ))}
        </ChipRow>
      </View>

      <View style={{ paddingHorizontal: space.side, paddingTop: 24, gap: 10 }}>
        <SectionLabel>Pick up where you left off</SectionLabel>
        <Card
          onPress={() => {
            loadExample('runclub');
            router.push('/test-drive');
          }}
          accessibilityLabel={`${draft.name}, ${draft.status}. Continue`}
          style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <IconTile icon="clock" bg="#2B2B28" fg="#FFFFFF" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>{draft.name}</Text>
            <Mono>{draft.status}</Mono>
          </View>
          <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.ink }}>Continue</Text>
        </Card>
      </View>
    </Screen>
  );
}
