import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  uri: string; // remote public URL or local file:// (create-post preview)
  style?: StyleProp<ViewStyle>;
};

/**
 * Video playback for posts — expo-video with the platform's native
 * play/pause/seek controls. No autoplay (feed videos start on the user's
 * tap), and a spinner overlays the frame while the file is still loading.
 */
export function PostVideo({ uri, style }: Props) {
  const player = useVideoPlayer(uri);
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  return (
    <View style={[styles.container, style]}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls />
      {status === 'loading' ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Black behind the frame so any letterboxing reads as intentional.
  container: { backgroundColor: '#000000', overflow: 'hidden' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
