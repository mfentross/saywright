import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Card, H1, IconButton, PillButton, Row, Screen, SectionLabel, goBack } from '../components/ui';
import { color, font, space } from '../theme/tokens';
import { ApiError, requestSignInLink, verifySignIn } from '../services/api';
import { session } from '../services/session';

/** Email sign-in. Also the target of the link in the email: /sign-in?token=… */
export default function SignIn() {
  const params = useLocalSearchParams<{ token?: string; next?: string }>();
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/';
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'error'>(params.token ? 'verifying' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const verified = useRef(false);

  const finish = async (token: string) => {
    setState('verifying');
    try {
      const r = await verifySignIn(token);
      await session.set(r.token, r.user.email);
      // Go back to the screen that asked (it continues by itself); from an email link, open `next`.
      if (!params.token && router.canGoBack()) router.back();
      else router.replace(next as never);
    } catch (e) {
      setState('error');
      setMessage(e instanceof ApiError ? e.message : 'Saywright couldn’t sign you in. Please try again.');
    }
  };

  useEffect(() => {
    if (params.token && !verified.current) {
      verified.current = true;
      void finish(String(params.token));
    }
  }, [params.token]);

  const send = async () => {
    setState('sending');
    setMessage(null);
    try {
      const r = await requestSignInLink(email);
      setDevToken(r.devToken ?? null);
      setState('sent');
    } catch (e) {
      setState('error');
      setMessage(e instanceof ApiError ? e.message : 'Saywright couldn’t send the link. Please try again.');
    }
  };

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Screen scroll>
      <Row style={{ paddingHorizontal: space.side }}>
        <IconButton icon="close" label="Close" onPress={goBack} />
      </Row>
      <View style={{ paddingHorizontal: space.side, paddingTop: 16, gap: 10 }}>
        <H1>{state === 'sent' ? 'Check your email' : 'Sign in to build'}</H1>
        <Body>
          {state === 'sent'
            ? `We sent a sign-in link to ${email.trim()}. It works once and expires in 15 minutes.`
            : 'Testing is free. Signing in keeps your apps together and lets Saywright build them for you.'}
        </Body>
      </View>

      {state !== 'sent' && state !== 'verifying' ? (
        <Card style={{ marginHorizontal: space.side, marginTop: 22, borderRadius: 24, padding: 16, gap: 12 }}>
          <SectionLabel>Your email</SectionLabel>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={color.placeholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel="Your email"
            returnKeyType="send"
            onSubmitEditing={() => valid && send()}
            style={{ height: 48, fontFamily: font.body, fontSize: 17, color: color.ink }}
          />
          <PillButton label={state === 'sending' ? 'Sending…' : 'Send sign-in link'} variant="dark" full disabled={!valid || state === 'sending'} onPress={send} />
        </Card>
      ) : null}

      {state === 'verifying' ? <Body style={{ paddingHorizontal: space.side, paddingTop: 20 }}>Signing you in…</Body> : null}
      {message ? <Text style={{ paddingHorizontal: space.side, paddingTop: 14, fontFamily: font.medium, fontSize: 14, color: color.ink }}>{message}</Text> : null}

      {state === 'sent' && devToken ? (
        <View style={{ paddingHorizontal: space.side, paddingTop: 22 }}>
          <PillButton label="Open the link (development)" variant="outline" full onPress={() => finish(devToken)} />
        </View>
      ) : null}
    </Screen>
  );
}
