import { View } from 'react-native';
import { Body, Card, H1, Screen, SectionLabel, TabBar } from '../components/ui';
import { space } from '../theme/tokens';

/** Placeholder until accounts exist (phase 2). */
export default function Account() {
  return (
    <Screen scroll footer={<TabBar />}>
      <View style={{ paddingHorizontal: space.side, gap: 10 }}>
        <H1>Account</H1>
        <Body>Sign-in, subscriptions, credits and connected developer accounts will live here.</Body>
      </View>
      <Card style={{ marginHorizontal: space.side, marginTop: 20, padding: 16, gap: 6 }}>
        <SectionLabel>Coming in phase 2</SectionLabel>
        <Body>Sign in with Apple, Google or a passkey.</Body>
      </Card>
    </Screen>
  );
}
