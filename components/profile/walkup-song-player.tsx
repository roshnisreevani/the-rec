import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { BORDER, COLORS, FONTS, RADII } from '@/constants/style';
import type { WalkupSong } from '@/lib/profile';

type Props = {
  song: WalkupSong;
};

export function WalkupSongPlayer({ song }: Props) {
  const player = useAudioPlayer(song.previewUrl);
  const status = useAudioPlayerStatus(player);

  const progress = status.duration > 0 ? Math.min(status.currentTime / status.duration, 1) : 0;

  const toggle = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  return (
    <View style={styles.row}>
      {song.artworkUrl ? (
        <Image source={{ uri: song.artworkUrl }} style={styles.artwork} />
      ) : (
        <View style={[styles.artwork, styles.artworkFallback]} />
      )}
      <View style={styles.info}>
        <Text numberOfLines={1} style={styles.title}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={styles.artist}>
          {song.artist}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
      <Pressable style={styles.playButton} onPress={toggle}>
        <Text style={styles.playIcon}>{status.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  artwork: { width: 56, height: 56, borderRadius: RADII.sm, borderWidth: BORDER.width, borderColor: COLORS.ink },
  artworkFallback: { backgroundColor: '#ccc' },
  info: { flex: 1, gap: 5 },
  title: { fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink },
  artist: { fontFamily: FONTS.body, color: COLORS.ink, opacity: 0.6, fontSize: 13 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.cream,
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.blue },
  playButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: COLORS.white, fontSize: 14 },
});
