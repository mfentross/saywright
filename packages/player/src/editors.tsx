import { useRef, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import type { Field, RecordValue, Theme } from '@saywright/blueprint';
import { Icon } from './Icon';
import { PLAYER_FONTS as F } from './fonts';

/**
 * Field editors for blueprint fields, in plain React Native (no native add-ons), so
 * they behave the same on iOS, Android and web. Each is a labelled, accessible control.
 */

export interface EditorProps {
  field: Field;
  label: string;
  value: RecordValue;
  onChange: (v: RecordValue) => void;
  theme: Theme;
  people: Array<{ id: string; name: string; color: string }>;
  meId: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function FieldEditor(p: EditorProps) {
  const { field } = p;
  switch (field.type) {
    case 'bool':
      return <SwitchRow {...p} />;
    case 'number':
      if (field.editor === 'rating') return <Rating {...p} />;
      if (field.editor === 'slider' && field.min !== undefined && field.max !== undefined) return <Slider {...p} />;
      return <Stepper {...p} />;
    case 'date':
      return <DateEditor {...p} />;
    case 'choice':
      return <Choice {...p} options={field.options ?? []} />;
    case 'member':
      return <Choice {...p} options={p.people.map((x) => x.id)} labelOf={(id) => (id === p.meId ? 'You' : (p.people.find((x) => x.id === id)?.name ?? id))} />;
    default:
      return <TextEditor {...p} multiline={field.type === 'longText'} />;
  }
}

function Label({ text, theme, right }: { text: string; theme: Theme; right?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: F.medium, fontSize: 14, color: theme.muted }}>{text}</Text>
      {right ? <Text style={{ fontFamily: F.semibold, fontSize: 14, color: theme.ink }}>{right}</Text> : null}
    </View>
  );
}

function TextEditor({ label, value, onChange, theme, multiline }: EditorProps & { multiline?: boolean }) {
  const [text, setText] = useState(String(value ?? ''));
  return (
    <View style={{ gap: 6 }}>
      <Label text={label} theme={theme} />
      <TextInput
        value={text}
        onChangeText={(v) => {
          const next = v.slice(0, multiline ? 2000 : 200);
          setText(next);
          onChange(next);
        }}
        multiline={multiline}
        accessibilityLabel={label}
        style={{
          minHeight: multiline ? 96 : 48,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.line,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          fontFamily: F.body,
          fontSize: 16,
          color: theme.ink,
          backgroundColor: theme.background,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function SwitchRow({ label, value, onChange, theme }: EditorProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: theme.ink }}>{label}</Text>
      <Switch
        value={!!value}
        onValueChange={(v) => onChange(v)}
        accessibilityLabel={label}
        trackColor={{ true: theme.primary, false: theme.line }}
        thumbColor={theme.surface}
      />
    </View>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

function Stepper({ field, label, value, onChange, theme }: EditorProps) {
  const n = typeof value === 'number' ? value : 0;
  const step = field.step ?? 1;
  const clamp = (v: number) => Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, v));
  const btn = (icon: 'minus' | 'plus', delta: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a11y} ${label}`}
      onPress={() => onChange(clamp(Math.round((n + delta) * 1000) / 1000))}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.line, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface }}
    >
      <Icon name={icon} size={18} color={theme.ink} strokeWidth={2.2} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: theme.ink }}>{label}</Text>
      {btn('minus', -step, 'Decrease')}
      <Text accessibilityLiveRegion="polite" style={{ minWidth: 44, textAlign: 'center', fontFamily: F.semibold, fontSize: 17, color: theme.ink }}>
        {fmt(n)}
      </Text>
      {btn('plus', step, 'Increase')}
    </View>
  );
}

function Slider({ field, label, value, onChange, theme }: EditorProps) {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? 1;
  const [width, setWidth] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const n = live ?? (typeof value === 'number' ? value : min);
  const frac = max > min ? (n - min) / (max - min) : 0;
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  const at = (x: number) => snap(min + (Math.max(0, Math.min(width, x)) / Math.max(1, width)) * (max - min));
  const startX = useRef(0);
  return (
    <View style={{ gap: 8 }}>
      <Label text={label} theme={theme} right={fmt(n)} />
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: n }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(snap(n + (e.nativeEvent.actionName === 'increment' ? step : -step)))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          startX.current = e.nativeEvent.locationX;
          setLive(at(e.nativeEvent.locationX));
        }}
        onResponderMove={(e) => setLive(at(e.nativeEvent.locationX))}
        onResponderRelease={() => {
          if (live !== null) onChange(live);
          setLive(null);
        }}
        style={{ height: 44, justifyContent: 'center' }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.line }}>
          <View style={{ width: `${frac * 100}%`, height: 6, borderRadius: 3, backgroundColor: theme.primary }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: Math.max(0, frac * width - 12),
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.surface,
            borderWidth: 2,
            borderColor: theme.primary,
          }}
        />
      </View>
    </View>
  );
}

function Rating({ field, label, value, onChange, theme }: EditorProps) {
  const max = Math.min(10, field.max ?? 5);
  const n = typeof value === 'number' ? value : 0;
  return (
    <View style={{ gap: 6 }}>
      <Label text={label} theme={theme} />
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ checked: n === v }}
            aria-checked={n === v}
            accessibilityLabel={`${v} of ${max}`}
            onPress={() => onChange(v)}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="star" size={28} color={theme.primary} fill={v <= n ? theme.primary : 'none'} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DateEditor({ label, value, onChange, theme }: EditorProps) {
  const d = new Date(typeof value === 'number' ? value : Date.now());
  const shift = (days: number) => {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    onChange(next.getTime());
  };
  const today = () => {
    const t = new Date();
    t.setHours(d.getHours(), d.getMinutes(), 0, 0);
    onChange(t.getTime());
  };
  const small = (text: string, onPress: () => void, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={{ minWidth: 44, height: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: theme.line, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface }}
    >
      <Text style={{ fontFamily: F.semibold, fontSize: 15, color: theme.ink }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <Label text={label} theme={theme} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {small('‹', () => shift(-1), `${label}: previous day`)}
        <Text accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center', fontFamily: F.semibold, fontSize: 16, color: theme.ink }}>
          {`${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`}
        </Text>
        {small('›', () => shift(1), `${label}: next day`)}
        {small('Today', today, `${label}: today`)}
      </View>
    </View>
  );
}

function Choice({ label, value, onChange, theme, options, labelOf }: EditorProps & { options: string[]; labelOf?: (v: string) => string }) {
  return (
    <View style={{ gap: 6 }}>
      <Label text={label} theme={theme} />
      <Segmented options={options} value={value === null ? null : String(value)} onChange={onChange} theme={theme} labelOf={labelOf} a11y={label} />
    </View>
  );
}

export function Segmented({
  options,
  value,
  onChange,
  theme,
  labelOf = (v) => v,
  a11y,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  theme: Theme;
  labelOf?: (v: string) => string;
  a11y: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={a11y} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() => onChange(o)}
            style={{
              minHeight: 40,
              paddingHorizontal: 14,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: on ? theme.primary : theme.line,
              backgroundColor: on ? theme.primary : theme.surface,
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: on ? F.semibold : F.body, fontSize: 14, color: on ? theme.onPrimary : theme.ink }}>{labelOf(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
