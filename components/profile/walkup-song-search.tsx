import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BORDER, COLORS, FONTS, RADII } from '@/constants/style';
import { searchSongs, type ItunesTrack } from '@/lib/itunes';

type Props = {
  onSelect: (track: ItunesTrack) => void;
};

export function WalkupSongSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItunesTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const tracks = await searchSongs(query);
        if (requestId.current === currentRequest) {
          setResults(tracks);
          setOpen(true);
        }
      } catch {
        if (requestId.current === currentRequest) {
          setResults([]);
          setFailed(true);
        }
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <View>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          placeholder="search for your walk-up song"
          placeholderTextColor="#8A8378"
          value={query}
          onChangeText={setQuery}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading ? <ActivityIndicator color={COLORS.ink} style={styles.spinner} /> : null}
      </View>

      {failed ? <Text style={styles.hint}>Search whiffed. Try again.</Text> : null}

      {open && results.length > 0 ? (
        <View style={styles.dropdown}>
          <ScrollView style={styles.dropdownList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {results.map((item) => (
              <Pressable
                key={item.trackId}
                style={styles.resultRow}
                onPress={() => {
                  onSelect(item);
                  setQuery('');
                  setResults([]);
                  setOpen(false);
                }}>
                {item.artworkUrl ? (
                  <Image source={{ uri: item.artworkUrl }} style={styles.artwork} />
                ) : (
                  <View style={[styles.artwork, styles.artworkFallback]} />
                )}
                <View style={styles.resultText}>
                  <Text numberOfLines={1} style={styles.trackName}>
                    {item.trackName}
                  </Text>
                  <Text numberOfLines={1} style={styles.artist}>
                    {item.artistName}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderRadius: RADII.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    backgroundColor: COLORS.white,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.ink,
  },
  spinner: { marginRight: 4 },
  hint: { marginTop: 6, fontFamily: FONTS.body, color: COLORS.ink, opacity: 0.6, fontSize: 13 },
  dropdown: {
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderRadius: RADII.sm,
    marginTop: 6,
    maxHeight: 260,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  dropdownList: { maxHeight: 260 },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 10 },
  artwork: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#ccc' },
  artworkFallback: {},
  resultText: { flex: 1 },
  trackName: { fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.ink },
  artist: { fontFamily: FONTS.body, color: COLORS.ink, opacity: 0.6, fontSize: 13 },
});
