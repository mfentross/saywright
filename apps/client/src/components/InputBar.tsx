import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@saywright/player';
import { color, font } from '../theme/tokens';

/** 52px pill input with a mic button (change requests). */
export function InputBar({ placeholder, onSubmit }: { placeholder: string; onSubmit?: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <View
      style={{
        height: 52,
        borderRadius: 26,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.line,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 18,
        paddingRight: 4,
        gap: 8,
      }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={color.placeholder}
        accessibilityLabel={placeholder.replace('…', '')}
        returnKeyType="send"
        onSubmitEditing={() => {
          if (text.trim()) onSubmit?.(text.trim());
          setText('');
        }}
        style={{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: 16, color: color.ink, height: 48 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Speak a change"
        onPress={() => router.push('/voice')}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="mic" size={20} color={color.ink} />
      </Pressable>
    </View>
  );
}
