import * as Linking from 'expo-linking';

// Real in-app deep link for the QR share card — opens straight to
// app/u/[id].tsx, which redirects into the read-only profile screen with the
// "scanned via QR" banner (see app/u/[id].tsx and user/[id].tsx's `src=qr`
// handling). Uses expo-linking's scheme ("therec", registered in app.json)
// so this resolves correctly in both a dev build and a production build.
//
// Known limitation: this only works if the person scanning already has the
// app installed — there's no real web presence at a therec.app domain to
// fall back to (unlike a universal link), so scanning with the app not
// installed does nothing. Revisit if/when there's real web hosting.
export function getProfileShareUrl(userId: string): string {
  return Linking.createURL(`u/${userId}`);
}
