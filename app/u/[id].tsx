import { Redirect, useLocalSearchParams } from 'expo-router';

// Mirrors the path shape of getProfileShareUrl() (lib/profile-url.ts, owned
// by the Profile/QR-share flow — intentionally left untouched here) so that
// whenever that flow's QR payload is pointed at an in-app-openable link, it
// already lands somewhere useful: straight through to the Connections-owned
// read-only profile screen, flagged as having come from a QR scan so that
// screen can lead with a direct "Connect" prompt instead of just a profile
// view. See app/user/[id].tsx's `src === 'qr'` handling.
export default function SharedProfileRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <Redirect href="/(tabs)/feed" />;
  return <Redirect href={`/user/${id}?src=qr`} />;
}
