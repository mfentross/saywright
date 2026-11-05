import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { Icon, type IconKey } from '@saywright/player';
import { color, font, space, tracking } from '../theme/tokens';
import { useBottomPad, useTopPad } from '../theme/layout';

// ---------------------------------------------------------------- layout

export function Screen({
  children,
  scroll = false,
  dark = false,
  footer,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  dark?: boolean;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const top = useTopPad();
  const bg = dark ? color.dark.bg : color.ground;
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingTop: top, paddingBottom: 24 }, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingTop: top }, style]}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {body}
      {footer}
    </View>
  );
}

/** Bottom bar area with the safe-area inset (CTA bars). */
export function Footer({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const bottom = useBottomPad(30);
  return (
    <View
      style={[
        {
          backgroundColor: color.surface,
          borderTopWidth: 1,
          borderTopColor: color.line,
          paddingTop: 14,
          paddingHorizontal: space.side,
          paddingBottom: bottom,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

// ---------------------------------------------------------------- type

export function H1({ children, style, size = 34 }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number }) {
  return (
    <Text
      accessibilityRole="header"
      style={[
        { fontFamily: font.display, fontSize: size, lineHeight: size * 1.04, letterSpacing: tracking(-0.03, size), color: color.ink },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.muted }, style]}>{children}</Text>;
}

/** Uppercase mono section label. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      style={[
        {
          fontFamily: font.mono,
          fontSize: 11,
          letterSpacing: tracking(0.08, 11),
          textTransform: 'uppercase',
          color: color.mutedMono,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Mono({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: font.mono, fontSize: 12, color: color.mutedMono }, style]}>{children}</Text>;
}

/** Small uppercase tag, e.g. "Test drive · v1" or "In review". */
export function Tag({ children, tone = 'dark' }: { children: ReactNode; tone?: 'dark' | 'accent' }) {
  return (
    <Text
      style={{
        fontFamily: font.mono,
        fontSize: 11,
        letterSpacing: tracking(0.06, 11),
        textTransform: 'uppercase',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: tone === 'dark' ? color.ink : color.accent,
        color: tone === 'dark' ? '#FFFFFF' : color.ink,
      }}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------- controls

type PillVariant = 'accent' | 'dark' | 'outline' | 'ghost' | 'darkOutline';

const pillColors: Record<PillVariant, { bg: string; fg: string; border?: string }> = {
  accent: { bg: color.accent, fg: color.ink },
  dark: { bg: color.ink, fg: '#FFFFFF' },
  outline: { bg: color.surface, fg: color.ink, border: color.control },
  ghost: { bg: 'transparent', fg: color.ink, border: color.control },
  darkOutline: { bg: 'transparent', fg: color.dark.text, border: '#4A4A45' },
};

export function PillButton({
  label,
  onPress,
  variant = 'accent',
  height = 52,
  icon,
  iconRight,
  disabled,
  full,
  style,
  textStyle,
  accessibilityLabel,
}: {
  label?: string;
  onPress?: PressableProps['onPress'];
  variant?: PillVariant;
  height?: number;
  icon?: IconKey;
  iconRight?: IconKey;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const c = pillColors[variant];
  const onlyIcon = !label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          minWidth: onlyIcon ? height : undefined,
          paddingHorizontal: onlyIcon ? 0 : 22,
          borderRadius: height / 2,
          backgroundColor: disabled ? '#D9D9D2' : c.bg,
          borderWidth: c.border ? 1 : 0,
          borderColor: c.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: full ? 'stretch' : 'auto',
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={20} color={disabled ? color.placeholder : c.fg} strokeWidth={2} /> : null}
      {label ? (
        <Text style={[{ fontFamily: font.semibold, fontSize: 16, color: disabled ? color.placeholder : c.fg }, textStyle]}>
          {label}
        </Text>
      ) : null}
      {iconRight ? <Icon name={iconRight} size={20} color={c.fg} strokeWidth={2} /> : null}
    </Pressable>
  );
}

/** 44px round outline button with an icon. */
export function IconButton({
  icon,
  label,
  onPress,
  dark,
  size = 44,
}: {
  icon: IconKey;
  label: string;
  onPress?: () => void;
  dark?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: dark ? color.dark.border : color.control,
        backgroundColor: dark ? 'transparent' : color.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} size={20} color={dark ? color.dark.text : color.ink} />
    </Pressable>
  );
}

export function Chip({
  label,
  onPress,
  selected,
  height = 44,
  transparent,
}: {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  height?: number;
  transparent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        height,
        paddingHorizontal: height >= 44 ? 16 : 14,
        borderRadius: height / 2,
        borderWidth: 1,
        borderColor: selected ? color.ink : color.control,
        backgroundColor: selected ? color.ink : transparent ? 'transparent' : color.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontFamily: font.body, fontSize: height >= 44 ? 15 : 14, color: selected ? '#FFFFFF' : color.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Horizontally scrolling chip row that bleeds to the screen edges. */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: space.side }}
      style={{ flexGrow: 0 }}
    >
      {children}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- surfaces

export function Card({
  children,
  style,
  onPress,
  selected,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: PressableProps['accessibilityRole'];
  accessibilityState?: PressableProps['accessibilityState'];
}) {
  const base: ViewStyle = {
    backgroundColor: color.surface,
    borderRadius: 20,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? color.ink : color.line,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [base, style, pressed && { opacity: 0.9 }]}
    >
      {children}
    </Pressable>
  );
}

export function IconTile({
  icon,
  bg = color.ground,
  fg = color.ink,
  size = 44,
  radius = 12,
  iconSize,
}: {
  icon: IconKey;
  bg?: string;
  fg?: string;
  size?: number;
  radius?: number;
  iconSize?: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

/** The Saywright mark: accent square + wordmark. */
export function Logo() {
  return (
    <Row style={{ gap: 8 }}>
      <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color.accent }} />
      <Text style={{ fontFamily: font.display, fontSize: 26, letterSpacing: tracking(-0.03, 26), color: color.ink }}>saywright</Text>
    </Row>
  );
}

/** Back button + optional centered title + optional right control. */
export function TopBar({
  title,
  subtitle,
  right,
  onBack,
  backLabel = 'Back',
  dark,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  dark?: boolean;
}) {
  return (
    <Row style={{ paddingHorizontal: space.side, justifyContent: 'space-between' }}>
      <IconButton icon="back" label={backLabel} dark={dark} onPress={onBack ?? goBack} />
      <View style={{ alignItems: 'center', gap: 3, flex: 1 }}>
        {typeof title === 'string' ? (
          <Text style={{ fontFamily: font.semibold, fontSize: 17, color: dark ? color.dark.text : color.ink }}>{title}</Text>
        ) : (
          title
        )}
        {subtitle}
      </View>
      {right ?? <View style={{ width: 44 }} />}
    </Row>
  );
}

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// ---------------------------------------------------------------- tab bar

const TABS: Array<{ href: '/' | '/library' | '/account'; label: string; icon: IconKey }> = [
  { href: '/', label: 'Create', icon: 'create' },
  { href: '/library', label: 'My apps', icon: 'grid' },
  { href: '/account', label: 'Account', icon: 'person' },
];

export function TabBar() {
  const path = usePathname();
  const bottom = useBottomPad(20);
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: color.surface,
        borderTopWidth: 1,
        borderTopColor: color.line,
        paddingTop: 6,
        paddingHorizontal: 8,
        paddingBottom: bottom,
      }}
    >
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Pressable
            key={t.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => !active && router.replace(t.href)}
            style={{ flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <Icon name={t.icon} size={22} color={active ? color.ink : color.mutedMono} />
            <Text style={{ fontFamily: active ? font.semibold : font.body, fontSize: 11, color: active ? color.ink : color.mutedMono }}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  side: { paddingHorizontal: space.side },
});
