import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Field, RecordValue, Sandbox, Screen, Value } from '@saywright/blueprint';
import { Icon } from './Icon';
import { BlockView, type BlockContext } from './blocks';
import { FieldEditor } from './editors';
import { PLAYER_FONTS } from './fonts';
import { makeStyles, type Styles } from './styles';

export { PLAYER_FONTS } from './fonts';

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
  /** Extra top space on screens without a header, for host controls (the fullscreen ✕). */
  chromeTop?: number;
}

type RunOpts = { collection?: string; itemId?: string; form?: Record<string, RecordValue> };

function defaultsFor(sc: Screen): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(sc.state ?? {}).map(([k, st]) => [k, st.default ?? (st.type === 'bool' ? false : st.type === 'number' ? 0 : '')]),
  );
}

/**
 * Renders a blueprint as a working app, against the sandbox (sample data only).
 * The player has no access to the host app's session, storage or network:
 * everything it can do goes through the sandbox it is given.
 */
export function Player({ sandbox, density = 'regular', topInset = 0, bottomInset = 0, banner, chromeTop = 0 }: PlayerProps) {
  const state = useSyncExternalStore(sandbox.subscribe, sandbox.getState, sandbox.getState);
  const bp = sandbox.blueprint;
  const t = bp.theme;
  const tabs = bp.screens.filter((sc) => (sc.kind ?? 'tab') === 'tab');
  const [tabId, setTabId] = useState(tabs[0]!.id);
  /** Open detail screens, top last. */
  const [stack, setStack] = useState<Array<{ screen: string; collection: string; itemId: string }>>([]);
  const [ui, setUiState] = useState<Record<string, Record<string, Value>>>(() => Object.fromEntries(bp.screens.map((sc) => [sc.id, defaultsFor(sc)])));
  const [formAction, setFormAction] = useState<{ action: string; opts?: RunOpts } | null>(null);
  const [confirm, setConfirm] = useState<{ action: string; opts?: RunOpts; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const compact = density === 'compact';
  const s = useMemo(() => makeStyles(t, compact), [t, compact]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const top = stack[stack.length - 1];
  const screen = (top ? bp.screens.find((sc) => sc.id === top.screen) : null) ?? tabs.find((sc) => sc.id === tabId) ?? tabs[0]!;
  const item = top ? (sandbox.rows(top.collection).find((r) => String(r.id) === top.itemId) ?? null) : null;
  // The record was removed (e.g. "Delete"): leave the detail screen.
  useEffect(() => {
    if (top && !item) setStack((st) => st.slice(0, -1));
  }, [top, item]);

  const execute = (action: string, o?: RunOpts) => {
    const r = sandbox.run(action, o);
    if (!r.ok) {
      setToast('Something went wrong in this test.');
      return;
    }
    if (r.toast) setToast(r.toast);
    if (r.back) setStack((st) => st.slice(0, -1));
    if (r.navigate) {
      setStack([]);
      setTabId(r.navigate);
    }
  };

  const run = (action: string, o?: RunOpts) => {
    const def = bp.actions[action];
    if (!def) return;
    if (def.form && !o?.form) return setFormAction({ action, opts: o });
    if (def.confirm) {
      const itemRow = o?.collection && o.itemId ? sandbox.rows(o.collection).find((r) => String(r.id) === o.itemId) : undefined;
      return setConfirm({ action, opts: o, text: sandbox.text(def.confirm, itemRow ? { item: itemRow } : {}) });
    }
    execute(action, o);
  };

  const ctx: BlockContext = {
    sandbox,
    theme: t,
    s,
    compact,
    topInset,
    screenTitle: screen.title,
    viewAs: state.viewAs,
    ui: ui[screen.id] ?? {},
    setUi: (name, v) => setUiState((all) => ({ ...all, [screen.id]: { ...(all[screen.id] ?? {}), [name]: v } })),
    item,
    collection: top?.collection ?? null,
    hasBack: !!top && !compact,
    run,
    open: (sc, collection, itemId) => setStack((st) => [...st, { screen: sc, collection, itemId }]),
  };

  const notice = state.notices[state.notices.length - 1];
  const addButton = screen.blocks.find((b) => b.type === 'addButton');
  const heroFirst = screen.blocks[0]?.type === 'hero' && !compact;
  const onDetail = !!top;

  return (
    <View style={s.root}>
      {banner}
      <ScrollView
        key={`${screen.id}-${top?.itemId ?? ''}`}
        style={s.flex}
        contentContainerStyle={{ paddingBottom: compact ? 12 : 120, paddingTop: heroFirst ? 0 : topInset + Math.max(chromeTop, onDetail && !compact ? 52 : 0) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {screen.blocks.map((b, i) => (
          <BlockView key={`${screen.id}-${i}`} block={b} c={ctx} />
        ))}
      </ScrollView>

      {onDetail ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => setStack((st) => st.slice(0, -1))}
          style={[s.back, { top: compact ? 6 : topInset + 6, backgroundColor: heroFirst ? 'rgba(255,255,255,0.18)' : t.surface }]}
        >
          <Icon name="back" size={20} color={heroFirst ? t.onPrimary : t.ink} />
        </Pressable>
      ) : null}

      {addButton && addButton.type === 'addButton' && !compact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addButton.label}
          onPress={() => run(addButton.action, item && top ? { collection: top.collection, itemId: top.itemId } : undefined)}
          style={[s.fab, { bottom: (onDetail ? 24 : 104) + Math.max(0, bottomInset - 22) }]}
        >
          <Icon name="plus" size={26} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
      ) : null}

      {!onDetail ? (
        <View style={[s.tabs, !compact && { paddingBottom: Math.max(22, bottomInset) }]} accessibilityRole="tablist">
          {tabs.map((sc) => {
            const active = sc.id === screen.id;
            return (
              <Pressable key={sc.id} accessibilityRole="tab" accessibilityState={{ selected: active }} aria-selected={active} onPress={() => setTabId(sc.id)} style={s.tab}>
                {compact ? null : <Icon name={sc.icon} size={22} color={active ? t.primary : t.muted} />}
                <Text style={[s.tabLabel, active && s.tabLabelActive]} numberOfLines={1}>
                  {sc.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {toast ? (
        <View pointerEvents="none" style={[s.toast, { bottom: (onDetail ? 24 : 92) + Math.max(0, bottomInset - 22) }]} accessibilityLiveRegion="polite">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

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

      {confirm ? (
        <View style={s.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirm(null)} accessibilityLabel="Cancel" />
          <View style={s.sheet} accessibilityViewIsModal>
            <Text style={s.sheetTitle} accessibilityRole="header">
              {confirm.text}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => setConfirm(null)} style={[s.sheetSubmit, { flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }]}>
                <Text style={[s.cardButtonText, { color: t.ink }]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const c = confirm;
                  setConfirm(null);
                  execute(c.action, c.opts);
                }}
                style={[s.sheetSubmit, { flex: 1 }]}
              >
                <Text style={s.cardButtonText}>Yes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {formAction ? (
        <FormSheet
          sandbox={sandbox}
          action={formAction.action}
          s={s}
          viewAs={state.viewAs}
          onClose={() => setFormAction(null)}
          onSubmit={(values) => {
            const f = formAction;
            setFormAction(null);
            execute(f.action, { ...f.opts, form: values });
          }}
        />
      ) : null}
    </View>
  );
}

function initialValue(f: Field): RecordValue {
  if (f.type === 'bool') return false;
  if (f.type === 'date') return Date.now();
  if (f.type === 'number') return f.min ?? null;
  if (f.type === 'choice') return f.options?.[0] ?? null;
  return '';
}

function FormSheet({
  sandbox,
  action,
  s,
  viewAs,
  onClose,
  onSubmit,
}: {
  sandbox: Sandbox;
  action: string;
  s: Styles;
  viewAs: string;
  onClose: () => void;
  onSubmit: (values: Record<string, RecordValue>) => void;
}) {
  const form = sandbox.blueprint.actions[action]!.form!;
  const t = sandbox.blueprint.theme;
  const [values, setValues] = useState<Record<string, RecordValue>>(() =>
    Object.fromEntries(Object.entries(form.fields).map(([k, f]) => [k, f.type === 'member' ? viewAs : initialValue(f)])),
  );
  const missing = Object.entries(form.fields).some(([k, f]) => f.required && (values[k] === null || String(values[k]).trim() === ''));
  return (
    <View style={s.sheetBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { maxHeight: '88%' }]} accessibilityViewIsModal>
        <Text style={s.sheetTitle} accessibilityRole="header">
          {form.title}
        </Text>
        <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
          {Object.entries(form.fields).map(([k, f]) => (
            <FieldEditor
              key={k}
              field={f}
              label={f.label}
              value={values[k] ?? null}
              onChange={(v) => setValues((cur) => ({ ...cur, [k]: v }))}
              theme={t}
              people={sandbox.blueprint.sample.people}
              meId={viewAs}
            />
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: missing }}
          disabled={missing}
          onPress={() => onSubmit(values)}
          style={[s.sheetSubmit, missing && { opacity: 0.4 }]}
        >
          <Text style={s.cardButtonText}>{form.submit}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Keep the font names exported from here for existing imports.
export const FONTS = PLAYER_FONTS;
