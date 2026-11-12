import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@saywright/player';
import { Body, goBack, H1, IconButton, Mono, PillButton, Row } from '../components/ui';
import { color, font, space } from '../theme/tokens';
import { useBottomPad, useTopPad } from '../theme/layout';
import { routes, type RouteId } from '../data/mock';
import { flow, useFlow } from '../data/store';
import { delivery } from '../services/stubs';
import { ScrollView } from 'react-native';

export default function Delivery() {
  const top = useTopPad();
  const bottom = useBottomPad(32);
  const { routes: picked } = useFlow();
  const chosen = (Object.keys(picked) as RouteId[]).filter((k) => picked[k]);

  const go = async () => {
    await delivery.request('thirsty', chosen);
    router.push('/publishing');
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.ground, paddingTop: top }}>
      <Row style={{ paddingHorizontal: space.side, justifyContent: 'space-between' }}>
        <IconButton icon="back" label="Back" onPress={goBack} />
        <Mono>Subscribed · Thirsty v1</Mono>
      </Row>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={{ paddingHorizontal: space.side, paddingTop: 20, gap: 10 }}>
          <H1>Where should Thirsty go?</H1>
          <Body>Saywright builds, signs and ships the finished app. Pick one or more.</Body>
        </View>

        <View style={{ paddingHorizontal: space.side, paddingTop: 20, gap: 10 }}>
          {routes.map((r) => {
            const on = picked[r.id];
            return (
              <Pressable
                key={r.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={`${r.name}. ${r.desc}`}
                onPress={() => flow.set({ routes: { ...picked, [r.id]: !on } })}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: on ? 13 : 14,
                  borderRadius: 20,
                  backgroundColor: color.surface,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? color.ink : color.line,
                }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.accent : color.ground }}>
                  <Icon name={r.icon} size={22} color={color.ink} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>{r.name}</Text>
                  <Text style={{ fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.muted }}>{r.desc}</Text>
                </View>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    marginTop: 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? color.ink : color.surface,
                    borderWidth: on ? 0 : 2,
                    borderColor: color.quiet,
                  }}
                >
                  {on ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            marginHorizontal: space.side,
            marginTop: 16,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: '#B9B9B1',
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <View style={{ marginTop: 1 }}>
            <Icon name="shield" size={18} color={color.ink} />
          </View>
          <Text style={{ flex: 1, fontFamily: font.body, fontSize: 13, lineHeight: 19, color: color.note }}>
            Saywright checks every app before it goes live, usually within a day. Then we build, host and update it. For the stores you
            connect your developer accounts once, and we upload it there for you.
          </Text>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space.side, paddingBottom: bottom, paddingTop: 8 }}>
        <PillButton
          label={chosen.length ? 'Get Thirsty' : 'Pick at least one'}
          variant="dark"
          height={56}
          full
          disabled={!chosen.length}
          onPress={go}
          textStyle={{ fontSize: 17 }}
        />
      </View>
    </View>
  );
}
