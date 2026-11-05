import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@saywright/player';
import { Body, H1, IconButton, IconTile, PillButton, Row, SectionLabel } from '../components/ui';
import { color, font, space } from '../theme/tokens';
import { useBottomPad, useTopPad } from '../theme/layout';
import { included, plans } from '../data/mock';
import { flow, useFlow } from '../data/store';
import { payments } from '../services/stubs';

export default function Purchase() {
  const top = useTopPad();
  const bottom = useBottomPad(32);
  const { plan } = useFlow();
  const current = plans.find((p) => p.id === plan) ?? plans[0];

  const start = async () => {
    const r = await payments.subscribe('thirsty', current.id);
    if (r.ok) router.push('/delivery');
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.ground, paddingTop: top }}>
      <Row style={{ paddingHorizontal: space.side, justifyContent: 'flex-end' }}>
        <IconButton icon="close" label="Close" onPress={() => router.replace('/test-drive')} />
      </Row>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
      <View style={{ paddingHorizontal: space.side, paddingTop: 4, gap: 12, alignItems: 'flex-start' }}>
        <IconTile icon="droplet" bg="#1F7A4D" fg="#FFFFFF" size={68} radius={20} iconSize={32} />
        <H1>Keep Thirsty running</H1>
        <Body>Built from your idea, tested by you. Saywright checks it, publishes it and runs it for you.</Body>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Plan" style={{ paddingHorizontal: space.side, paddingTop: 20, gap: 10 }}>
        {plans.map((p) => {
          const on = p.id === plan;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${p.name}, ${p.price}. ${p.desc}`}
              onPress={() => flow.set({ plan: p.id })}
              style={{
                flexDirection: 'row',
                gap: 14,
                alignItems: 'flex-start',
                padding: on ? 15 : 16,
                borderRadius: 20,
                backgroundColor: color.surface,
                borderWidth: on ? 2 : 1,
                borderColor: on ? color.ink : color.line,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  marginTop: 1,
                  borderWidth: on ? 7 : 2,
                  borderColor: on ? color.ink : color.quiet,
                  backgroundColor: on ? color.accent : color.surface,
                }}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>{p.name}</Text>
                  <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>{p.price}</Text>
                </Row>
                <Text style={{ fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.muted }}>{p.desc}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: space.side, paddingTop: 20, gap: 10 }}>
        <SectionLabel>Always included</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 12 }}>
          {included.map((i) => (
            <View key={i} style={{ width: '47%', flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ marginTop: 1 }}>
                <Icon name="check" size={16} color={color.ink} strokeWidth={2.4} />
              </View>
              <Text style={{ flex: 1, fontFamily: font.body, fontSize: 14, lineHeight: 18, color: color.ink }}>{i}</Text>
            </View>
          ))}
        </View>
      </View>

      </ScrollView>

      <View style={{ paddingHorizontal: space.side, paddingTop: 8, paddingBottom: bottom, gap: 12 }}>
        <PillButton label={current.cta} variant="dark" height={56} full onPress={start} textStyle={{ fontSize: 17 }} />
        <Pressable accessibilityRole="button" onPress={() => router.replace('/test-drive')} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.medium, fontSize: 15, color: color.ink, textDecorationLine: 'underline' }}>Not yet, keep testing</Text>
        </Pressable>
        <Text style={{ textAlign: 'center', fontFamily: font.body, fontSize: 13, color: color.muted }}>
          Testing is free. Usage beyond the plan only with your OK, up to a cap you set.
        </Text>
      </View>
    </View>
  );
}
