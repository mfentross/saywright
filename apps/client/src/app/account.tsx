import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Card, H1, PillButton, Row, Screen, SectionLabel, TabBar } from '../components/ui';
import { color, font, space } from '../theme/tokens';
import { API_URL, fetchMe, signOut } from '../services/api';
import { session, useSession } from '../services/session';

type Me = Awaited<ReturnType<typeof fetchMe>>;

export default function Account() {
  const s = useSession();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!API_URL || !s.token) return setMe(null);
    fetchMe()
      .then((m) => {
        setMe(m);
        session.setEmail(m.user.email);
      })
      .catch(() => setMe(null));
  }, [s.token]);

  return (
    <Screen scroll footer={<TabBar />}>
      <View style={{ paddingHorizontal: space.side, gap: 10 }}>
        <H1>Account</H1>
        {!API_URL ? <Body>Demo mode: connect the app to a Saywright server to sign in.</Body> : null}
        {API_URL && !s.token ? <Body>Sign in to build apps and keep them together.</Body> : null}
      </View>

      {API_URL && !s.token ? (
        <View style={{ paddingHorizontal: space.side, paddingTop: 20 }}>
          <PillButton label="Sign in" variant="dark" full onPress={() => router.push('/sign-in?next=/account')} />
        </View>
      ) : null}

      {me ? (
        <>
          <Card style={{ marginHorizontal: space.side, marginTop: 20, padding: 16, gap: 6 }}>
            <SectionLabel>Signed in as</SectionLabel>
            <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink }}>{me.user.email}</Text>
          </Card>
          <Card style={{ marginHorizontal: space.side, marginTop: 12, padding: 16, gap: 10 }}>
            <SectionLabel>Free testing this month</SectionLabel>
            <UsageRow label="New apps" used={me.usage.appsThisMonth} limit={me.usage.limits.appsPerMonth} />
            <UsageRow label="Changes" used={me.usage.changesThisMonth} limit={me.usage.limits.changesPerMonth} />
          </Card>
          <View style={{ paddingHorizontal: space.side, paddingTop: 20 }}>
            <PillButton
              label="Sign out"
              variant="outline"
              full
              onPress={async () => {
                await signOut().catch(() => {});
                await session.clear();
              }}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.body, fontSize: 15, color: color.ink }}>{label}</Text>
        <Text style={{ fontFamily: font.mono, fontSize: 12, color: color.mutedMono }}>
          {used} of {limit}
        </Text>
      </Row>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: color.divider, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, (100 * used) / Math.max(1, limit))}%`, height: 6, backgroundColor: color.accent }} />
      </View>
    </View>
  );
}
