import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@saywright/player';
import { Card, H1, IconTile, Mono, PillButton, Row, Tag } from '../components/ui';
import { color, font, space } from '../theme/tokens';
import { useBottomPad, useTopPad } from '../theme/layout';
import { storeSteps } from '../data/mock';

export default function Publishing() {
  const top = useTopPad();
  const bottom = useBottomPad(32);
  return (
    <View style={{ flex: 1, backgroundColor: color.ground, paddingTop: top }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={{ paddingHorizontal: space.side, gap: 8 }}>
          <Mono>Thirsty v1</Mono>
          <H1>On its way</H1>
        </View>

        <Card style={{ marginHorizontal: space.side, marginTop: 18, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile icon="droplet" bg="#1F7A4D" fg="#FFFFFF" size={52} radius={15} iconSize={26} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>On your phone</Text>
            <Row style={{ gap: 6 }}>
              <Icon name="check" size={14} color="#1E6A43" strokeWidth={3} />
              <Text style={{ fontFamily: font.semibold, fontSize: 13, color: '#1E6A43' }}>Approved · on home screen</Text>
            </Row>
          </View>
          <PillButton label="Open" variant="dark" height={44} onPress={() => router.push('/fullscreen')} textStyle={{ fontSize: 15 }} style={{ paddingHorizontal: 18 }} />
        </Card>

        <Card style={{ marginHorizontal: space.side, marginTop: 12, borderRadius: 22, padding: 16, gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>App Store & Google Play</Text>
            <Tag tone="accent">In review</Tag>
          </Row>
          <View accessibilityRole="list">
            {storeSteps.map((s, i) => {
              const last = i === storeSteps.length - 1;
              const next = storeSteps[i + 1];
              return (
                <View key={s.title} style={{ flexDirection: 'row', gap: 12 }} accessibilityLabel={`${s.title}, ${s.state === 'done' ? 'done' : s.state === 'current' ? 'in progress' : 'not yet'}`}>
                  <View style={{ width: 22, alignItems: 'center' }}>
                    <StepDot state={s.state} />
                    {!last ? <View style={{ width: 2, height: 22, backgroundColor: next && next.state !== 'todo' ? color.ink : color.control }} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 2, paddingTop: 1 }}>
                    <Text style={{ fontFamily: font.semibold, fontSize: 14, color: s.state === 'todo' ? color.muted : color.ink }}>{s.title}</Text>
                    <Text style={{ fontFamily: font.body, fontSize: 13, color: color.muted }}>{s.desc}</Text>
                  </View>
                  {'edit' in s && s.edit ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Edit store listing"
                      style={{ alignSelf: 'flex-start', height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: color.control, backgroundColor: color.surface, justifyContent: 'center' }}
                    >
                      <Text style={{ fontFamily: font.body, fontSize: 13, color: color.ink }}>Edit</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Card>

        <View style={{ marginHorizontal: space.side, marginTop: 12, paddingHorizontal: 4, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ marginTop: 2 }}>
            <Icon name="info" size={16} color={color.ink} />
          </View>
          <Text style={{ flex: 1, fontFamily: font.body, fontSize: 13, lineHeight: 19, color: color.note }}>
            If a store asks for changes, Saywright fixes and resubmits. You only hear from us if we need a decision.
          </Text>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space.side, paddingBottom: bottom, paddingTop: 8 }}>
        <PillButton label="Done" variant="dark" height={56} full onPress={() => router.replace('/library')} textStyle={{ fontSize: 17 }} />
      </View>
    </View>
  );
}

function StepDot({ state }: { state: 'done' | 'current' | 'todo' }) {
  if (state === 'done') {
    return (
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3} />
      </View>
    );
  }
  if (state === 'current') {
    return (
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent }} />
      </View>
    );
  }
  return <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B9B9B1' }} />;
}
