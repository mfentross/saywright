import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, type IconKey } from '@saywright/player';
import { color, font, tracking } from '../theme/tokens';
import { useBottomPad, useTopPad } from '../theme/layout';
import { goBack } from '../components/ui';
import { voice, type VoiceSession } from '../services/stubs';
import { flow } from '../data/store';

const BARS = [14, 22, 34, 58, 40, 72, 90, 62, 46, 80, 54, 30, 66, 84, 50, 36, 60, 28, 18, 12, 8];

export default function Voice() {
  const top = useTopPad();
  const bottom = useBottomPad(40);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [text, setText] = useState('');
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(14);

  useEffect(() => {
    let alive = true;
    voice.start('en').then((s) => {
      if (!alive) return;
      setSession(s);
      s.onTranscript((t) => setText(t));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);

  // Last clause renders dimmer, like a live transcript that's still settling.
  const split = text.lastIndexOf(', ');
  const settled = split > 0 ? text.slice(0, split + 1) : text;
  const pending = split > 0 ? text.slice(split + 1) : '';
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const finish = async () => {
    const final = (await session?.stop()) ?? text;
    flow.set({ idea: final.replace(/…$/, '.'), fromVoice: true });
    router.replace('/building');
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.dark.bg, paddingTop: top }}>
      <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton icon="close" label="Cancel" onPress={goBack} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: paused ? color.dark.secondary : color.accent }} />
          <Text style={mono(12, color.dark.text)}>
            {paused ? 'Paused' : 'Listening'} · {time}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Language: English"
          style={{ height: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: color.dark.border, justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: font.mono, fontSize: 12, color: color.dark.text }}>EN</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 56, gap: 18 }}>
        <Text style={mono(11, color.dark.secondary)}>You're saying</Text>
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontFamily: font.displayMedium, fontSize: 30, lineHeight: 35, letterSpacing: tracking(-0.02, 30), color: color.dark.text }}
        >
          {settled}
          <Text style={{ color: '#8E8E87' }}>{pending}</Text>
        </Text>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ marginTop: 48, marginHorizontal: 24, height: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}
      >
        {BARS.map((h, i) => (
          <View
            key={i}
            style={{
              width: 6,
              height: paused ? 8 : h,
              borderRadius: 3,
              backgroundColor: !paused && i >= 2 && i <= 17 ? color.accent : '#4A4A45',
            }}
          />
        ))}
      </View>

      <View style={{ marginTop: 44, marginHorizontal: 24, borderWidth: 1, borderColor: '#33332F', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 8 }}>
        <Text style={mono(11, color.dark.secondary)}>Helps Saywright get it right</Text>
        <Text style={{ fontFamily: font.body, fontSize: 15, lineHeight: 21, color: '#D6D6CF' }}>
          Who uses it · what it should remember · when it should notify you
        </Text>
      </View>

      <View style={{ marginTop: 'auto', paddingHorizontal: 28, paddingBottom: bottom, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Labeled label="Type">
          <RoundButton icon="keyboard" label="Type instead" size={56} onPress={() => router.replace('/')} />
        </Labeled>
        <Labeled label={paused ? 'Resume' : 'Pause'}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume listening' : 'Pause listening'}
            onPress={() => {
              if (paused) session?.resume();
              else session?.pause();
              setPaused(!paused);
            }}
            style={{ width: 108, height: 108, borderRadius: 54, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', margin: -10 }}
          >
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={paused ? 'mic' : 'pause'} size={32} color={color.ink} fill={paused ? 'none' : color.ink} />
            </View>
          </Pressable>
        </Labeled>
        <Labeled label="Build it">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done, build it"
            onPress={finish}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: color.dark.text, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="arrowUp" size={22} color={color.ink} strokeWidth={2.2} />
          </Pressable>
        </Labeled>
      </View>
    </View>
  );
}

function mono(size: number, c: string) {
  return { fontFamily: font.mono, fontSize: size, letterSpacing: tracking(0.08, size), textTransform: 'uppercase' as const, color: c };
}

function RoundButton({ icon, label, onPress, size = 44 }: { icon: IconKey; label: string; onPress?: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: color.dark.border, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={20} color={color.dark.text} />
    </Pressable>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ minWidth: 72, alignItems: 'center', gap: 8 }}>
      {children}
      <Text style={{ fontFamily: font.body, fontSize: 12, color: color.dark.tertiary }}>{label}</Text>
    </View>
  );
}
