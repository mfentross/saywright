import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  isTruthy,
  type Block,
  type Sandbox,
  type Theme,
  type Value,
  type RecordValue,
} from '@saywright/blueprint';
import { Icon } from './Icon';

/** Font family names; the host app loads these (see apps/client/src/theme/fonts.ts). */
export const PLAYER_FONTS = {
  display: 'BricolageGrotesque_700Bold',
  body: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
} as const;

export type Density = 'regular' | 'compact';

export interface PlayerProps {
  sandbox: Sandbox;
  /** "regular" = the app as installed; "compact" = the inline preview in Test drive. */
  density?: Density;
  /** Space reserved at the top (status bar / host chrome). */
  topInset?: number;
  /** Space reserved at the bottom (home indicator). */
  bottomInset?: number;
  /** Rendered above the app content, e.g. the "Sample data" strip. */
  banner?: ReactNode;
}

/**
 * Renders a blueprint as a working app, against the sandbox (sample data only).
 * The player has no access to the host app's session, storage or network:
 * everything it can do goes through the sandbox it is given.
 */
export function Player({ sandbox, density = 'regular', topInset = 0, bottomInset = 0, banner }: PlayerProps) {
  const state = useSyncExternalStore(sandbox.subscribe, sandbox.getState, sandbox.getState);
  const bp = sandbox.blueprint;
  const t = bp.theme;
  const [screenId, setScreenId] = useState(bp.screens[0]!.id);
  const [formAction, setFormAction] = useState<string | null>(null);
  const screen = bp.screens.find((s) => s.id === screenId) ?? bp.screens[0]!;
  const compact = density === 'compact';
  const s = useMemo(() => makeStyles(t, compact), [t, compact]);

  const run = (action: string, o?: { collection?: string; itemId?: string; form?: Record<string, RecordValue> }) => {
    if (bp.actions[action]?.form && !o?.form) {
      setFormAction(action);
      return;
    }
    const r = sandbox.run(action, o);
    if (r.ok && r.navigate) setScreenId(r.navigate);
  };

  const notice = state.notices[state.notices.length - 1];
  const addButton = screen.blocks.find((b) => b.type === 'addButton');
  const heroFirst = screen.blocks[0]?.type === 'hero' && !compact;

  return (
    <View style={s.root}>
      {banner}
      <ScrollView
        style={s.flex}
        contentContainerStyle={{ paddingBottom: compact ? 12 : 120, paddingTop: heroFirst ? 0 : topInset }}
        showsVerticalScrollIndicator={false}
      >
        {screen.blocks.map((b, i) => (
          <BlockView
            key={`${screen.id}-${i}`}
            block={b}
            sandbox={sandbox}
            s={s}
            compact={compact}
            topInset={topInset}
            screenTitle={screen.title}
            run={run}
            viewAs={state.viewAs}
          />
        ))}
      </ScrollView>

      {addButton && addButton.type === 'addButton' && !compact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addButton.label}
          onPress={() => run(addButton.action)}
          style={[s.fab, { bottom: 104 + Math.max(0, bottomInset - 22) }]}
        >
          <Icon name="plus" size={26} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <View style={[s.tabs, !compact && { paddingBottom: Math.max(22, bottomInset) }]} accessibilityRole="tablist">
        {bp.screens.map((sc) => {
          const active = sc.id === screen.id;
          return (
            <Pressable
              key={sc.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setScreenId(sc.id)}
              style={s.tab}
            >
              {compact ? null : <Icon name={sc.icon} size={22} color={active ? t.primary : t.muted} />}
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{sc.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {notice ? (
        <Pressable
          onPress={() => sandbox.dismissNotice(notice.id)}
          style={[s.notice, { top: topInset + 8 }]}
          accessibilityRole="alert"
          accessibilityLabel={`Notification: ${notice.text}. Tap to dismiss.`}
        >
          <View style={s.noticeIcon}>
            <Icon name="bell" size={16} color={t.onPrimary} />
          </View>
          <View style={s.flex}>
            <Text style={s.noticeApp}>
              {bp.name} · to {notice.to === state.viewAs ? 'you' : sandbox.host().memberName(notice.to)}
            </Text>
            <Text style={s.noticeText}>{notice.text}</Text>
          </View>
        </Pressable>
      ) : null}

      {formAction ? (
        <FormSheet
          sandbox={sandbox}
          action={formAction}
          s={s}
          onClose={() => setFormAction(null)}
          onSubmit={(values) => {
            setFormAction(null);
            run(formAction, { form: values });
          }}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- blocks

type Styles = ReturnType<typeof makeStyles>;

function BlockView({
  block,
  sandbox,
  s,
  compact,
  topInset,
  screenTitle,
  run,
  viewAs,
}: {
  block: Block;
  sandbox: Sandbox;
  s: Styles;
  compact: boolean;
  topInset: number;
  screenTitle: string;
  run: (action: string, o?: { collection?: string; itemId?: string }) => void;
  viewAs: string;
}) {
  const t = sandbox.blueprint.theme;
  switch (block.type) {
    case 'hero': {
      const title = sandbox.text(block.title);
      if (compact) {
        return (
          <View style={s.compactHeader}>
            <Text style={s.compactTitle} accessibilityRole="header">
              {screenTitle}
            </Text>
            <Text style={s.compactSubtitle}>{title === screenTitle ? sandbox.text(block.eyebrow ?? '') : title}</Text>
          </View>
        );
      }
      return (
        <View style={[s.hero, { paddingTop: Math.max(60, topInset + 8) }]}>
          <View style={{ gap: 2 }}>
            {block.eyebrow ? <Text style={s.heroEyebrow}>{sandbox.text(block.eyebrow)}</Text> : null}
            <Text style={s.heroTitle} accessibilityRole="header">
              {title}
            </Text>
          </View>
          {block.people ? (
            <View style={s.heroCard}>
              <Avatars sandbox={sandbox} viewAs={viewAs} ring={t.primary} />
              <Text style={s.heroCardText}>{sandbox.text(block.people.text)}</Text>
            </View>
          ) : null}
        </View>
      );
    }
    case 'section':
      return compact ? null : <Text style={s.section}>{sandbox.text(block.text)}</Text>;
    case 'text':
      return <Text style={[s.text, block.tone === 'muted' && { color: t.muted }]}>{sandbox.text(block.text)}</Text>;
    case 'list': {
      let rows = sandbox.rows(block.collection);
      if (block.where) rows = rows.filter((item) => isTruthy(sandbox.value(block.where!, { item })));
      if (block.sortBy) {
        const key = (item: Record<string, Value>) => sandbox.value(block.sortBy!, { item });
        rows = [...rows].sort((a, b) => Number(key(a) ?? 0) - Number(key(b) ?? 0));
      }
      if (!rows.length && block.empty) return <Text style={[s.text, { color: t.muted }]}>{sandbox.text(block.empty)}</Text>;
      return (
        <View style={s.list}>
          {rows.map((item) => {
            const btn = block.item.button;
            const showBtn = btn && (!btn.visible || isTruthy(sandbox.value(btn.visible, { item })));
            const title = sandbox.text(block.item.title, { item });
            return (
              <View key={String(item.id)} style={s.card}>
                {block.item.icon ? (
                  <View style={s.cardIcon}>
                    <Icon name={block.item.icon} size={compact ? 20 : 24} color={t.primary} />
                  </View>
                ) : null}
                <View style={s.cardBody}>
                  <Text style={s.cardTitle}>{title}</Text>
                  {block.item.subtitle ? <Text style={s.cardSubtitle}>{sandbox.text(block.item.subtitle, { item })}</Text> : null}
                </View>
                {showBtn && btn ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${sandbox.text(btn.label, { item })}: ${title}`}
                    onPress={() => run(btn.action, { collection: block.collection, itemId: String(item.id) })}
                    style={({ pressed }) => [s.cardButton, pressed && { opacity: 0.85 }]}
                  >
                    {btn.icon && !compact ? <Icon name={btn.icon} size={16} color={t.onPrimary} strokeWidth={2.6} /> : null}
                    <Text style={s.cardButtonText}>{sandbox.text(btn.label, { item })}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      );
    }
    case 'people': {
      const people = sandbox.blueprint.sample.people;
      return (
        <View style={s.list}>
          {people.map((p) => {
            const person = { id: p.id, name: p.name };
            return (
              <View key={p.id} style={s.card}>
                <View style={[s.avatarLarge, { backgroundColor: p.color }]}>
                  <Text style={s.avatarText}>{p.id === viewAs ? 'You' : p.name.slice(0, 1)}</Text>
                </View>
                <View style={s.cardBody}>
                  <Text style={s.cardTitle}>{p.id === viewAs ? `${p.name} (you)` : p.name}</Text>
                  {block.subtitle ? <Text style={s.cardSubtitle}>{sandbox.text(block.subtitle, { person })}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      );
    }
    case 'addButton':
      return null;
  }
}

function Avatars({ sandbox, viewAs, ring }: { sandbox: Sandbox; viewAs: string; ring: string }) {
  const people = sandbox.blueprint.sample.people;
  const ordered = [...people.filter((p) => p.id !== viewAs), ...people.filter((p) => p.id === viewAs)];
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={`${people.length} people`}>
      {ordered.map((p, i) => (
        <View
          key={p.id}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: p.color,
            borderWidth: 2,
            borderColor: ring,
            marginLeft: i === 0 ? 0 : -8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: PLAYER_FONTS.semibold, fontSize: 13, color: sandbox.blueprint.theme.ink }}>
            {p.id === viewAs ? 'You' : p.name.slice(0, 1)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FormSheet({
  sandbox,
  action,
  s,
  onClose,
  onSubmit,
}: {
  sandbox: Sandbox;
  action: string;
  s: Styles;
  onClose: () => void;
  onSubmit: (values: Record<string, RecordValue>) => void;
}) {
  const form = sandbox.blueprint.actions[action]!.form!;
  const [values, setValues] = useState<Record<string, string>>({});
  const missing = Object.entries(form.fields).some(([k, f]) => f.required && !values[k]?.trim());
  const submit = () => {
    const out: Record<string, RecordValue> = {};
    for (const [k, f] of Object.entries(form.fields)) {
      const raw = values[k]?.trim() ?? '';
      out[k] = f.type === 'number' ? (raw === '' ? null : Number(raw.replace(',', '.')) || null) : raw;
    }
    onSubmit(out);
  };
  return (
    <View style={s.sheetBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={s.sheet} accessibilityViewIsModal>
        <Text style={s.sheetTitle} accessibilityRole="header">
          {form.title}
        </Text>
        {Object.entries(form.fields).map(([k, f]) => (
          <View key={k} style={{ gap: 6 }}>
            <Text style={s.sheetLabel}>{f.label}</Text>
            <TextInput
              value={values[k] ?? ''}
              onChangeText={(v) => setValues((cur) => ({ ...cur, [k]: v.slice(0, 200) }))}
              keyboardType={f.type === 'number' ? 'numeric' : 'default'}
              style={s.sheetInput}
              accessibilityLabel={f.label}
              maxLength={200}
            />
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: missing }}
          disabled={missing}
          onPress={submit}
          style={[s.sheetSubmit, missing && { opacity: 0.4 }]}
        >
          <Text style={s.cardButtonText}>{form.submit}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- styles

function makeStyles(t: Theme, compact: boolean) {
  const F = PLAYER_FONTS;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background, overflow: 'hidden' },
    flex: { flex: 1 },
    hero: {
      backgroundColor: t.primary,
      paddingHorizontal: 20,
      paddingBottom: 24,
      gap: 16,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroEyebrow: { fontFamily: F.body, fontSize: 14, color: mix(t.onPrimary, t.primary, 0.78) },
    heroTitle: { fontFamily: F.display, fontSize: 32, letterSpacing: -0.64, color: t.onPrimary },
    heroCard: {
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    heroCardText: { flex: 1, fontFamily: F.body, fontSize: 14, lineHeight: 19, color: t.onPrimary },
    compactHeader: { paddingTop: 16, paddingHorizontal: 16, gap: 2 },
    compactTitle: { fontFamily: F.display, fontSize: 26, letterSpacing: -0.52, color: t.ink },
    compactSubtitle: { fontFamily: F.body, fontSize: 13, color: t.muted },
    section: {
      fontFamily: F.semibold,
      fontSize: 13,
      color: t.muted,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 0,
    },
    text: { fontFamily: F.body, fontSize: 15, color: t.ink, paddingHorizontal: 20, paddingTop: 12 },
    list: { paddingHorizontal: compact ? 12 : 16, paddingTop: compact ? 12 : 10, gap: compact ? 8 : 10 },
    card: {
      backgroundColor: t.surface,
      borderRadius: compact ? 16 : 20,
      paddingVertical: compact ? 10 : 12,
      paddingRight: compact ? 10 : 12,
      paddingLeft: compact ? 12 : 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: compact ? 10 : 12,
    },
    cardIcon: {
      width: compact ? 38 : 48,
      height: compact ? 38 : 48,
      borderRadius: compact ? 12 : 14,
      backgroundColor: t.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, minWidth: 0, gap: compact ? 2 : 3 },
    cardTitle: { fontFamily: F.semibold, fontSize: compact ? 15 : 17, color: t.ink },
    cardSubtitle: { fontFamily: F.body, fontSize: compact ? 12 : 13, color: t.muted },
    cardButton: {
      height: compact ? 36 : 44,
      paddingHorizontal: compact ? 12 : 16,
      borderRadius: compact ? 18 : 22,
      backgroundColor: t.primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cardButtonText: { fontFamily: F.semibold, fontSize: compact ? 13 : 14, color: t.onPrimary },
    avatarLarge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: F.semibold, fontSize: 15, color: t.ink },
    fab: {
      position: 'absolute',
      right: 20,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: t.ink,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: t.ink,
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    tabs: {
      flexDirection: 'row',
      backgroundColor: t.surface,
      borderTopWidth: 1,
      borderTopColor: t.line,
      paddingTop: compact ? 8 : 6,
      paddingBottom: compact ? 10 : 22,
      paddingHorizontal: compact ? 0 : 8,
    },
    tab: {
      flex: 1,
      height: compact ? undefined : 52,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: compact ? 20 : 44,
    },
    tabLabel: { fontFamily: F.body, fontSize: 11, color: t.muted },
    tabLabelActive: { fontFamily: F.semibold, color: t.primary },
    notice: {
      position: 'absolute',
      left: 10,
      right: 10,
      backgroundColor: 'rgba(20,20,20,0.92)',
      borderRadius: 18,
      padding: 12,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    noticeIcon: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: t.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeApp: { fontFamily: F.semibold, fontSize: 12, color: '#B4B4AD' },
    noticeText: { fontFamily: F.body, fontSize: 14, color: '#F4F4EF' },
    sheetBackdrop: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 32,
      gap: 14,
    },
    sheetTitle: { fontFamily: F.display, fontSize: 22, letterSpacing: -0.44, color: t.ink },
    sheetLabel: { fontFamily: F.medium, fontSize: 14, color: t.muted },
    sheetInput: {
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.line,
      paddingHorizontal: 14,
      fontFamily: F.body,
      fontSize: 16,
      color: t.ink,
      backgroundColor: t.background,
    },
    sheetSubmit: {
      height: 52,
      borderRadius: 26,
      backgroundColor: t.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
  });
}

/** Blend two hex colors (used for subtle text on the primary color). */
function mix(a: string, b: string, w: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v * w + pb[i]! * (1 - w))).join(',')})`;
}
