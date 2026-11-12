import { useEffect, useRef, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { isTruthy, toText, type Block, type RecordValue, type Sandbox, type Theme, type Value } from '@saywright/blueprint';
import { Icon } from './Icon';
import { FieldEditor, Segmented } from './editors';
import { PLAYER_FONTS as F } from './fonts';
import type { Styles } from './styles';

export interface BlockContext {
  sandbox: Sandbox;
  theme: Theme;
  s: Styles;
  compact: boolean;
  topInset: number;
  screenTitle: string;
  viewAs: string;
  /** Screen-local UI state (ui.<name>). */
  ui: Record<string, Value>;
  setUi: (name: string, v: Value) => void;
  /** Detail screens: the record shown. */
  item: Record<string, Value> | null;
  collection: string | null;
  /** Hero blocks render as the first thing on a screen with a back button. */
  hasBack: boolean;
  run: (action: string, o?: { collection?: string; itemId?: string }) => void;
  open: (screen: string, collection: string, itemId: string) => void;
}

const DAY = 86_400_000;
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function locals(c: BlockContext, extra: Record<string, Value> = {}): Record<string, Value> {
  return { ui: c.ui, ...(c.item ? { item: c.item } : {}), ...extra };
}
const txt = (c: BlockContext, tpl: string | undefined, extra?: Record<string, Value>) => (tpl ? c.sandbox.text(tpl, locals(c, extra)) : '');
const val = (c: BlockContext, src: string | undefined, extra?: Record<string, Value>) => (src ? c.sandbox.value(src, locals(c, extra)) : null);
const num = (v: Value) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

function sortRows<T>(rows: T[], key: (r: T) => Value): T[] {
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y);
    return num(x) - num(y);
  });
}

export function BlockView({ block, c }: { block: Block; c: BlockContext }) {
  const { s, theme: t, compact } = c;
  switch (block.type) {
    // ------------------------------------------------------------ display
    case 'hero': {
      const title = txt(c, block.title);
      if (compact) {
        return (
          <View style={s.compactHeader}>
            <Text style={s.compactTitle} accessibilityRole="header">
              {c.item ? title : c.screenTitle}
            </Text>
            <Text style={s.compactSubtitle}>{c.item ? txt(c, block.eyebrow) : title === c.screenTitle ? txt(c, block.eyebrow) : title}</Text>
          </View>
        );
      }
      return (
        <View style={[s.hero, { paddingTop: Math.max(60, c.topInset + 8) + (c.hasBack ? 36 : 0) }]}>
          <View style={{ gap: 2 }}>
            {block.eyebrow ? <Text style={s.heroEyebrow}>{txt(c, block.eyebrow)}</Text> : null}
            <Text style={s.heroTitle} accessibilityRole="header">
              {title}
            </Text>
          </View>
          {block.people ? (
            <View style={s.heroCard}>
              <Avatars c={c} />
              <Text style={s.heroCardText}>{txt(c, block.people.text)}</Text>
            </View>
          ) : null}
        </View>
      );
    }
    case 'section':
      return compact ? null : <Text style={s.section}>{txt(c, block.text)}</Text>;
    case 'text': {
      const size = block.size === 'large' ? 20 : block.size === 'small' ? 13 : 15;
      return (
        <Text
          style={[
            s.text,
            { fontSize: size, lineHeight: size * 1.4, fontFamily: block.size === 'large' ? F.semibold : F.body },
            block.tone === 'muted' && { color: t.muted },
            block.tone === 'primary' && { color: t.primary },
            block.tone === 'danger' && { color: '#B3261E' },
          ]}
        >
          {txt(c, block.text)}
        </Text>
      );
    }
    case 'card': {
      if (block.visible && !isTruthy(val(c, block.visible))) return null;
      const primary = block.tone === 'primary';
      const danger = block.tone === 'danger';
      const bg = primary ? t.primary : danger ? '#FDECEA' : t.surface;
      const fg = primary ? t.onPrimary : danger ? '#7A1A14' : t.ink;
      return (
        <View style={[s.blockPad, { paddingTop: 12 }]}>
          <View style={{ backgroundColor: bg, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            {block.icon ? <Icon name={block.icon} size={22} color={fg} /> : null}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 15, color: fg }}>{txt(c, block.title)}</Text>
              {block.text ? <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: fg, opacity: 0.85 }}>{txt(c, block.text)}</Text> : null}
            </View>
          </View>
        </View>
      );
    }
    case 'stats':
      return (
        <View style={[s.blockPad, { paddingTop: 12, flexDirection: 'row', gap: 8 }]}>
          {block.items.map((it, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: t.surface, borderRadius: 16, padding: compact ? 10 : 12, gap: 4 }}>
              {it.icon && !compact ? <Icon name={it.icon} size={18} color={t.primary} /> : null}
              <Text style={{ fontFamily: F.display, fontSize: compact ? 18 : 22, color: t.ink }} numberOfLines={1}>
                {txt(c, it.value)}
              </Text>
              <Text style={{ fontFamily: F.body, fontSize: 12, color: t.muted }} numberOfLines={2}>
                {txt(c, it.label)}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'progress': {
      const v = Math.max(0, Math.min(1, num(val(c, block.value))));
      const label = txt(c, block.label);
      const caption = txt(c, block.caption);
      const a11y = `${label}: ${Math.round(v * 100)}%`;
      if (block.style === 'ring') {
        const r = 34;
        const circ = 2 * Math.PI * r;
        return (
          <View style={[s.blockPad, { paddingTop: 12 }]}>
            <View style={{ backgroundColor: t.surface, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }} accessible accessibilityLabel={a11y}>
              <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={80} height={80} viewBox="0 0 80 80" style={{ position: 'absolute' }}>
                  <Circle cx={40} cy={40} r={r} stroke={t.line} strokeWidth={8} fill="none" />
                  <Circle cx={40} cy={40} r={r} stroke={t.primary} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={`${circ * v} ${circ}`} transform="rotate(-90 40 40)" />
                </Svg>
                <Text style={{ fontFamily: F.semibold, fontSize: 16, color: t.ink }}>{Math.round(v * 100)}%</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.ink }}>{label}</Text>
                {caption ? <Text style={{ fontFamily: F.body, fontSize: 13, color: t.muted }}>{caption}</Text> : null}
              </View>
            </View>
          </View>
        );
      }
      return (
        <View style={[s.blockPad, { paddingTop: 12, gap: 6 }]} accessible accessibilityLabel={a11y}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.ink }}>{label}</Text>
            <Text style={{ fontFamily: F.semibold, fontSize: 14, color: t.ink }}>{Math.round(v * 100)}%</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.line, overflow: 'hidden' }}>
            <View style={{ width: `${v * 100}%`, height: 8, borderRadius: 4, backgroundColor: t.primary }} />
          </View>
          {caption ? <Text style={{ fontFamily: F.body, fontSize: 13, color: t.muted }}>{caption}</Text> : null}
        </View>
      );
    }
    case 'chart':
      return <Chart block={block} c={c} />;
    case 'calendar':
      return <Calendar block={block} c={c} />;
    case 'illustration':
      return (
        <View style={[s.blockPad, { paddingTop: 16, alignItems: 'center', gap: 8 }]}>
          <Text style={{ fontSize: compact ? 40 : 56 }} accessibilityElementsHidden importantForAccessibility="no">
            {block.emoji}
          </Text>
          {block.text ? <Text style={{ textAlign: 'center', fontFamily: F.body, fontSize: 15, lineHeight: 21, color: t.muted }}>{txt(c, block.text)}</Text> : null}
        </View>
      );
    case 'divider':
      return <View style={{ height: 1, backgroundColor: t.line, marginHorizontal: 20, marginTop: 16 }} />;
    case 'timer':
      return <Timer block={block} c={c} />;

    // ------------------------------------------------------------ data
    case 'list':
      return <List block={block} c={c} />;
    case 'people': {
      const people = c.sandbox.blueprint.sample.people.map((p) => ({ ...p, person: { id: p.id, name: p.name } as Value }));
      const ordered = block.sortBy ? sortRows(people, (p) => val(c, block.sortBy, { person: p.person })) : people;
      return (
        <View style={s.list}>
          {ordered.map((p, i) => (
            <View key={p.id} style={s.card}>
              {block.sortBy ? <Text style={{ width: 18, fontFamily: F.semibold, fontSize: 14, color: t.muted }}>{i + 1}</Text> : null}
              <View style={[s.avatarLarge, { backgroundColor: p.color }]}>
                <Text style={s.avatarText}>{p.id === c.viewAs ? 'You' : p.name.slice(0, 1)}</Text>
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardTitle}>{p.id === c.viewAs ? `${p.name} (you)` : p.name}</Text>
                {block.subtitle ? <Text style={s.cardSubtitle}>{txt(c, block.subtitle, { person: p.person })}</Text> : null}
              </View>
              {block.badge ? <Badge text={txt(c, block.badge, { person: p.person })} c={c} /> : null}
            </View>
          ))}
        </View>
      );
    }

    // ------------------------------------------------------------ inputs
    case 'search':
      return (
        <View style={[s.blockPad, { paddingTop: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.line, paddingHorizontal: 12, height: 44 }}>
            <Icon name="search" size={18} color={t.muted} />
            <TextInput
              value={String(c.ui[block.state] ?? '')}
              onChangeText={(v) => c.setUi(block.state, v.slice(0, 60))}
              placeholder={block.placeholder ?? 'Search'}
              placeholderTextColor={t.muted}
              accessibilityLabel={block.placeholder ?? 'Search'}
              style={{ flex: 1, height: 42, fontFamily: F.body, fontSize: 15, color: t.ink }}
            />
          </View>
        </View>
      );
    case 'segmented':
      return (
        <View style={[s.blockPad, { paddingTop: 12 }]}>
          <Segmented options={block.options} value={String(c.ui[block.state] ?? block.options[0])} onChange={(v) => c.setUi(block.state, v)} theme={t} a11y="Filter" />
        </View>
      );
    case 'toggle': {
      const label = txt(c, block.label);
      return (
        <View style={[s.blockPad, { paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }]}>
          <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: t.ink }}>{label}</Text>
          <Switch value={!!c.ui[block.state]} onValueChange={(v) => c.setUi(block.state, v)} accessibilityLabel={label} trackColor={{ true: t.primary, false: t.line }} thumbColor={t.surface} />
        </View>
      );
    }
    case 'field': {
      if (!c.item || !c.collection) return null;
      const field = c.sandbox.blueprint.collections[c.collection]?.fields[block.field];
      if (!field) return null;
      const itemId = String(c.item.id);
      return (
        <View style={[s.blockPad, { paddingTop: 12 }]}>
          <FieldEditor
            key={`${itemId}-${block.field}`}
            field={field}
            label={txt(c, block.label) || field.label || block.field}
            value={(c.item[block.field] ?? null) as RecordValue}
            onChange={(v) => c.sandbox.setField(c.collection!, itemId, block.field, v)}
            theme={t}
            people={c.sandbox.blueprint.sample.people}
            meId={c.viewAs}
          />
        </View>
      );
    }

    // ------------------------------------------------------------ actions
    case 'buttons':
      return (
        <View style={[s.blockPad, { paddingTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
          {block.items
            .filter((b) => !b.visible || isTruthy(val(c, b.visible)))
            .map((b, i) => {
              const style = b.style ?? 'primary';
              const bg = style === 'primary' ? t.primary : style === 'danger' ? '#B3261E' : t.surface;
              const fg = style === 'secondary' ? t.ink : '#FFFFFF';
              const label = txt(c, b.label);
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => c.run(b.action, c.item && c.collection ? { collection: c.collection, itemId: String(c.item.id) } : undefined)}
                  style={({ pressed }) => ({
                    flexGrow: 1,
                    minHeight: 48,
                    paddingHorizontal: 18,
                    borderRadius: 24,
                    backgroundColor: bg,
                    borderWidth: style === 'secondary' ? 1 : 0,
                    borderColor: t.line,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {b.icon ? <Icon name={b.icon} size={18} color={fg} /> : null}
                  <Text style={{ fontFamily: F.semibold, fontSize: 15, color: fg }}>{label}</Text>
                </Pressable>
              );
            })}
        </View>
      );
    case 'addButton':
      return null; // rendered by the shell as a floating button
  }
}

function Badge({ text, c }: { text: string; c: BlockContext }) {
  if (!text) return null;
  return (
    <Text style={{ fontFamily: F.semibold, fontSize: 12, color: c.theme.primary, backgroundColor: c.theme.tint, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' }}>
      {text}
    </Text>
  );
}

function Avatars({ c }: { c: BlockContext }) {
  const people = c.sandbox.blueprint.sample.people;
  const ordered = [...people.filter((p) => p.id !== c.viewAs), ...people.filter((p) => p.id === c.viewAs)];
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={`${people.length} people`}>
      {ordered.map((p, i) => (
        <View
          key={p.id}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.color, borderWidth: 2, borderColor: c.theme.primary, marginLeft: i === 0 ? 0 : -8, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: c.theme.ink }}>{p.id === c.viewAs ? 'You' : p.name.slice(0, 1)}</Text>
        </View>
      ))}
    </View>
  );
}

function List({ block, c }: { block: Extract<Block, { type: 'list' }>; c: BlockContext }) {
  const { s, theme: t, compact } = c;
  let rows = c.sandbox.rows(block.collection);
  if (block.where) rows = rows.filter((item) => isTruthy(val(c, block.where, { item })));
  if (block.sortBy) rows = sortRows(rows, (item) => val(c, block.sortBy, { item }));
  if (!rows.length && block.empty) return <Text style={[s.text, { color: t.muted }]}>{txt(c, block.empty)}</Text>;
  const grid = block.layout === 'grid';
  return (
    <View style={[s.list, grid && { flexDirection: 'row', flexWrap: 'wrap' }]}>
      {rows.map((item) => {
        const id = String(item.id);
        const btn = block.item.button;
        const showBtn = btn && (!btn.visible || isTruthy(val(c, btn.visible, { item })));
        const title = txt(c, block.item.title, { item });
        const checked = block.item.check ? !!item[block.item.check] : false;
        const body = (
          <>
            {block.item.check ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                aria-checked={checked}
                accessibilityLabel={title}
                onPress={() => c.sandbox.toggle(block.collection, id, block.item.check!)}
                hitSlop={6}
                style={{ width: 28, height: 28, borderRadius: 8, borderWidth: checked ? 0 : 2, borderColor: t.muted, backgroundColor: checked ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}
              >
                {checked ? <Icon name="check" size={16} color={t.onPrimary} strokeWidth={3} /> : null}
              </Pressable>
            ) : block.item.icon ? (
              <View style={s.cardIcon}>
                <Icon name={block.item.icon} size={compact ? 20 : 24} color={t.primary} />
              </View>
            ) : null}
            <View style={s.cardBody}>
              <Text style={[s.cardTitle, checked && { textDecorationLine: 'line-through', color: t.muted }]} numberOfLines={grid ? 2 : undefined}>
                {title}
              </Text>
              {block.item.subtitle ? <Text style={s.cardSubtitle}>{txt(c, block.item.subtitle, { item })}</Text> : null}
            </View>
            {block.item.badge && !grid ? <Badge text={txt(c, block.item.badge, { item })} c={c} /> : null}
            {showBtn && btn ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${txt(c, btn.label, { item })}: ${title}`}
                onPress={() => c.run(btn.action, { collection: block.collection, itemId: id })}
                style={({ pressed }) => [s.cardButton, pressed && { opacity: 0.85 }]}
              >
                {btn.icon && !compact ? <Icon name={btn.icon} size={16} color={t.onPrimary} strokeWidth={2.6} /> : null}
                <Text style={s.cardButtonText}>{txt(c, btn.label, { item })}</Text>
              </Pressable>
            ) : null}
            {block.item.open && !showBtn ? <Icon name="chevronRight" size={18} color={t.muted} /> : null}
          </>
        );
        const cardStyle = [s.card, grid && { width: '48%' as const, flexDirection: 'column' as const, alignItems: 'flex-start' as const }];
        return block.item.open ? (
          <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={() => c.open(block.item.open!, block.collection, id)} style={({ pressed }) => [...cardStyle, pressed && { opacity: 0.9 }]}>
            {body}
          </Pressable>
        ) : (
          <View key={id} style={cardStyle}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

function Chart({ block, c }: { block: Extract<Block, { type: 'chart' }>; c: BlockContext }) {
  const { s, theme: t } = c;
  const source: Array<Record<string, Value>> =
    block.of === 'people' ? c.sandbox.blueprint.sample.people.map((p) => ({ person: { id: p.id, name: p.id === c.viewAs ? 'You' : p.name } })) : c.sandbox.rows(block.of).map((item) => ({ item }));
  let rows = source;
  if (block.where) rows = rows.filter((r) => isTruthy(val(c, block.where, r)));
  if (block.sortBy) rows = sortRows(rows, (r) => val(c, block.sortBy, r));
  const points = rows.slice(0, block.max ?? 12).map((r) => ({ label: toText(val(c, block.label, r)), value: num(val(c, block.value, r)) }));
  const top = Math.max(1, ...points.map((p) => p.value));
  const title = txt(c, block.title);
  const summary = `${title ? `${title}: ` : ''}${points.map((p) => `${p.label} ${Math.round(p.value * 10) / 10}`).join(', ')}`;
  return (
    <View style={[s.blockPad, { paddingTop: 12 }]}>
      <View style={{ backgroundColor: t.surface, borderRadius: 18, padding: 14, gap: 10 }} accessible accessibilityLabel={summary}>
        {title ? <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.ink }}>{title}</Text> : null}
        {block.kind === 'bar' ? (
          points.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ width: 72, fontFamily: F.body, fontSize: 13, color: t.muted }} numberOfLines={1}>
                {p.label}
              </Text>
              <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: t.tint, overflow: 'hidden' }}>
                <View style={{ width: `${(p.value / top) * 100}%`, height: 14, borderRadius: 7, backgroundColor: t.primary }} />
              </View>
              <Text style={{ width: 40, textAlign: 'right', fontFamily: F.semibold, fontSize: 13, color: t.ink }}>{Math.round(p.value * 10) / 10}</Text>
            </View>
          ))
        ) : (
          <LineChart points={points} top={top} theme={t} />
        )}
      </View>
    </View>
  );
}

function LineChart({ points, top, theme: t }: { points: Array<{ label: string; value: number }>; top: number; theme: Theme }) {
  const [w, setW] = useState(0);
  const h = 90;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const coords = points.map((p, i) => `${i * step},${h - (p.value / top) * (h - 8) - 4}`).join(' ');
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ gap: 6 }}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          <Polyline points={coords} fill="none" stroke={t.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <Circle key={i} cx={i * step} cy={h - (p.value / top) * (h - 8) - 4} r={4} fill={t.primary} />
          ))}
        </Svg>
      ) : (
        <View style={{ height: h }} />
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {points.map((p, i) => (
          <Text key={i} style={{ fontFamily: F.body, fontSize: 11, color: t.muted }} numberOfLines={1}>
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Calendar({ block, c }: { block: Extract<Block, { type: 'calendar' }>; c: BlockContext }) {
  const { s, theme: t } = c;
  const now = c.sandbox.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let rows = c.sandbox.rows(block.collection);
  if (block.where) rows = rows.filter((item) => isTruthy(val(c, block.where, { item })));
  const counts = new Map<number, number>();
  for (const item of rows) {
    const d = val(c, block.date, { item });
    if (typeof d !== 'number') continue;
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    counts.set(day.getTime(), (counts.get(day.getTime()) ?? 0) + 1);
  }
  let days: Date[];
  if ((block.range ?? 'week') === 'week') {
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
    days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY));
  } else {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const start = new Date(first.getTime() - ((first.getDay() + 6) % 7) * DAY);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const cells = Math.ceil((((first.getDay() + 6) % 7) + last) / 7) * 7;
    days = Array.from({ length: cells }, (_, i) => new Date(start.getTime() + i * DAY));
  }
  const title = txt(c, block.title);
  return (
    <View style={[s.blockPad, { paddingTop: 12 }]}>
      <View style={{ backgroundColor: t.surface, borderRadius: 18, padding: 12, gap: 8 }}>
        {title ? <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.ink }}>{title}</Text> : null}
        <View style={{ flexDirection: 'row' }}>
          {WEEK.map((d, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: F.body, fontSize: 11, color: t.muted }}>
              {d}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {days.map((d) => {
            const n = counts.get(d.getTime()) ?? 0;
            const isToday = d.getTime() === today.getTime();
            const outside = block.range === 'month' && d.getMonth() !== today.getMonth();
            return (
              <View key={d.getTime()} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }} accessible accessibilityLabel={`${d.toDateString()}: ${n}`}>
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? t.primary : 'transparent' }}>
                  <Text style={{ fontFamily: isToday ? F.semibold : F.body, fontSize: 14, color: isToday ? t.onPrimary : outside ? t.line : t.ink }}>{d.getDate()}</Text>
                </View>
                <View style={{ height: 6, flexDirection: 'row', gap: 2, marginTop: 2 }}>
                  {Array.from({ length: Math.min(3, n) }, (_, i) => (
                    <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.primary }} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Timer({ block, c }: { block: Extract<Block, { type: 'timer' }>; c: BlockContext }) {
  const { s, theme: t } = c;
  const total = Math.max(1, Math.min(86_400, Math.round(num(val(c, block.seconds)))));
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    if (left === 0 && running && !done.current) {
      done.current = true;
      setRunning(false);
      if (block.onDone) c.run(block.onDone, c.item && c.collection ? { collection: c.collection, itemId: String(c.item.id) } : undefined);
    }
  }, [left, running]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const reset = () => {
    setRunning(false);
    setLeft(total);
    done.current = false;
  };
  const btn = (label: string, onPress: () => void, primary: boolean) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? t.primary : t.surface, borderWidth: primary ? 0 : 1, borderColor: t.line }}
    >
      <Text style={{ fontFamily: F.semibold, fontSize: 15, color: primary ? t.onPrimary : t.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[s.blockPad, { paddingTop: 12 }]}>
      <View style={{ backgroundColor: t.surface, borderRadius: 18, padding: 16, gap: 14, alignItems: 'stretch' }}>
        {block.label ? <Text style={{ textAlign: 'center', fontFamily: F.semibold, fontSize: 15, color: t.muted }}>{txt(c, block.label)}</Text> : null}
        <Text accessibilityRole="timer" accessibilityLiveRegion="polite" style={{ textAlign: 'center', fontFamily: F.display, fontSize: c.compact ? 40 : 56, color: t.ink, fontVariant: ['tabular-nums'] }}>
          {mm}:{ss}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {btn(running ? 'Pause' : left === 0 ? 'Again' : 'Start', () => (left === 0 ? (reset(), setRunning(true)) : setRunning(!running)), true)}
          {btn('Reset', reset, false)}
        </View>
      </View>
    </View>
  );
}
