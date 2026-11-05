import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@saywright/player';
import { Card, Chip, goBack, IconButton, IconTile, Mono, PillButton, Row } from '../components/ui';
import { InputBar } from '../components/InputBar';
import { color, font, space, tracking } from '../theme/tokens';
import { useBottomPad, useTopPad } from '../theme/layout';
import { frequencyOptions, plan, sampleIdea } from '../data/mock';
import { flow, useFlow } from '../data/store';

export default function Building() {
  const top = useTopPad();
  const bottom = useBottomPad(32);
  const { idea, frequency } = useFlow();
  const prompt = idea.trim() || sampleIdea;
  const lastStep = plan.steps.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: color.ground, paddingTop: top }}>
      <Row style={{ paddingHorizontal: space.side, gap: 12 }}>
        <IconButton icon="back" label="Back" onPress={goBack} />
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: font.semibold, fontSize: 17, color: color.ink }}>New app</Text>
          <Mono>Building · step 4 of 4</Mono>
        </View>
      </Row>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.side, paddingTop: 18, paddingBottom: 16, gap: 12 }}>
        {/* The user's prompt */}
        <View
          style={{
            alignSelf: 'flex-end',
            maxWidth: 290,
            backgroundColor: color.ink,
            borderRadius: 20,
            borderBottomRightRadius: 6,
            paddingVertical: 12,
            paddingHorizontal: 14,
            gap: 8,
          }}
        >
          <Text style={{ fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.dark.text }}>{prompt}</Text>
          <Row style={{ gap: 6 }}>
            <Icon name="micSmall" size={12} color={color.dark.tertiary} strokeWidth={2} />
            <Text style={{ fontFamily: font.mono, fontSize: 11, color: color.dark.tertiary }}>Voice · 0:14</Text>
          </Row>
        </View>

        {/* The generated plan */}
        <Card style={{ borderRadius: 24, padding: 16, gap: 14 }}>
          <Row style={{ gap: 12 }}>
            <IconTile icon="droplet" bg="#1F7A4D" fg="#FFFFFF" size={48} radius={14} iconSize={24} />
            <View style={{ gap: 2 }}>
              <Text style={{ fontFamily: font.display, fontSize: 22, letterSpacing: tracking(-0.02, 22), color: color.ink }}>{plan.name}</Text>
              <Text style={{ fontFamily: font.body, fontSize: 14, color: color.muted }}>{plan.tagline}</Text>
            </View>
          </Row>

          <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: color.divider, paddingTop: 12 }}>
            {plan.rows.map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', gap: 12 }}>
                <Text style={{ width: 92, fontFamily: font.mono, fontSize: 12, color: color.mutedMono, paddingTop: 2 }}>{r.label}</Text>
                <Text style={{ flex: 1, fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.ink }}>{r.value}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: color.divider, paddingTop: 12 }} accessibilityLabel="Build progress">
            {plan.steps.map((s, i) => {
              const current = i === lastStep;
              return (
                <Row key={s} style={{ gap: 10 }}>
                  {current ? (
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color.accent, borderTopColor: color.ink }} />
                  ) : (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  )}
                  <Text style={{ fontFamily: current ? font.semibold : font.body, fontSize: 14, color: color.ink }}>{s}</Text>
                </Row>
              );
            })}
            <View style={{ height: 6, borderRadius: 3, backgroundColor: color.divider, marginTop: 4, overflow: 'hidden' }}>
              <View style={{ width: '85%', height: 6, borderRadius: 3, backgroundColor: color.accent }} />
            </View>
          </View>
        </Card>

        {/* Clarifying question */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.ink }}>
            <Text style={{ fontFamily: font.semibold }}>Quick question:</Text> how often should it remind?
          </Text>
          <Row style={{ gap: 8, flexWrap: 'wrap' }}>
            {frequencyOptions.map((o) => (
              <Chip key={o.id} label={o.label} selected={frequency === o.id} onPress={() => flow.set({ frequency: o.id })} />
            ))}
          </Row>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space.side, paddingBottom: bottom, paddingTop: 8, gap: 12 }}>
        <PillButton label="Open test drive" icon="play" variant="dark" full onPress={() => router.push('/fullscreen')} />
        <InputBar placeholder="Change something…" />
      </View>
    </View>
  );
}
