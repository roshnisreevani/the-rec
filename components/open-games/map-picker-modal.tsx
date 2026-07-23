import * as Location from 'expo-location';
import { Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameMap } from '@/components/open-games/game-map';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { searchPlaces, type PlaceResult } from '@/lib/geocoding';

type Props = {
  visible: boolean;
  initialCoords: { lat: number; lng: number } | null;
  initialLocationName: string;
  onConfirm: (coords: { lat: number; lng: number }, locationName: string) => void;
  onClose: () => void;
};

// Chicago-ish default so the map has somewhere sane to open before the user
// searches or grants location — picked purely as "a real city", not tied to
// anything about this app; the user repositions immediately either way.
const FALLBACK_REGION = { lat: 41.8781, lng: -87.6298 };

/**
 * Full-screen version of the location picker — the map fills the whole
 * screen with the search box floating on top of it (instead of a small
 * ~180px map sitting under a separate text field), so finding and
 * fine-tuning a spot feels like using an actual maps app rather than a
 * cramped form widget. Owns its own draft state and only hands the result
 * back to the parent form on Confirm — Cancel discards anything changed
 * while it was open.
 */
export function MapPickerModal({ visible, initialCoords, initialLocationName, onConfirm, onClose }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [coords, setCoords] = useState(initialCoords ?? FALLBACK_REGION);
  const [locationName, setLocationName] = useState(initialLocationName);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const suppressNextSearch = useRef(false);

  // Reset the draft to whatever the form currently has every time the modal
  // opens, so reopening it to tweak a pin doesn't carry over a stale search
  // box from last time it was cancelled out of.
  useEffect(() => {
    if (visible) {
      setCoords(initialCoords ?? FALLBACK_REGION);
      setLocationName(initialLocationName);
      setQuery('');
      setResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (suppressNextSearch.current) {
      suppressNextSearch.current = false;
      setResults([]);
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchPlaces(query));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [query]);

  const applyCoordsAndReverseGeocode = async (lat: number, lng: number) => {
    setCoords({ lat, lng });
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (place) {
        const parts = [place.name, place.street, place.city].filter(Boolean);
        const guess = parts.slice(0, 2).join(', ');
        if (guess) {
          suppressNextSearch.current = true;
          setQuery(guess);
          setLocationName(guess);
        }
      }
    } catch {
      // Reverse geocoding is a convenience — a dropped pin still works fine
      // without a name if this fails.
    }
  };

  const handleSelectPlace = (place: PlaceResult) => {
    suppressNextSearch.current = true;
    setQuery(place.name);
    setLocationName(place.name);
    setCoords({ lat: place.latitude, lng: place.longitude });
    setResults([]);
  };

  const handleUseCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({});
      await applyCoordsAndReverseGeocode(position.coords.latitude, position.coords.longitude);
    } catch {
      // Silent — the person can still drag the pin by hand.
    } finally {
      setGettingLocation(false);
    }
  };

  const handleConfirm = () => {
    // Reverse-geocoding after a pin drag is async — hitting Confirm right
    // after dropping the pin (before that network call resolves) used to
    // submit an empty locationName, which the DB's
    // open_games_location_name_check (1-120 chars) rejects outright. Always
    // fall back to the raw coordinates so there's a guaranteed non-empty
    // name no matter how fast someone taps through.
    const name = locationName.trim() || query.trim() || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    onConfirm(coords, name);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent={false}>
      <View style={styles.flex}>
        <GameMap
          latitude={coords.lat}
          longitude={coords.lng}
          interactive
          onLocationChange={(next) => applyCoordsAndReverseGeocode(next.latitude, next.longitude)}
          height={undefined}
          fill
        />

        <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
            <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 8) }]}>
              <AnimatedPressable style={styles.headerButton} onPress={onClose} hitSlop={8}>
                <Text style={styles.headerButtonText}>Cancel</Text>
              </AnimatedPressable>
              <Text style={styles.headerTitle}>Choose location</Text>
              <AnimatedPressable style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </AnimatedPressable>
            </View>

            <View style={styles.searchCard}>
              <Search size={16} color={colors.textSecondary} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a place..."
                placeholderTextColor={colors.textSecondary}
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  setLocationName(t);
                }}
              />
              {searching ? <ActivityIndicator color={colors.textSecondary} size="small" /> : null}
              {query.length > 0 ? (
                <AnimatedPressable hitSlop={8} onPress={() => setQuery('')}>
                  <X size={16} color={colors.textSecondary} strokeWidth={2} />
                </AnimatedPressable>
              ) : null}
            </View>

            {results.length > 0 ? (
              <View style={styles.resultsCard}>
                {results.map((place, i) => (
                  <AnimatedPressable
                    key={`${place.latitude}-${place.longitude}`}
                    style={[styles.resultRow, i === results.length - 1 && styles.resultRowLast]}
                    onPress={() => handleSelectPlace(place)}>
                    <Text style={styles.resultRowText} numberOfLines={2}>
                      {place.name}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none">
          <AnimatedPressable style={styles.currentLocationButton} onPress={handleUseCurrentLocation} disabled={gettingLocation}>
            {gettingLocation ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.currentLocationButtonText}>Use my current location</Text>
            )}
          </AnimatedPressable>
          <Text style={styles.pinHint}>Tap or drag the pin to fine-tune the exact spot.</Text>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    headerButton: { paddingVertical: 4 },
    headerButtonText: { fontSize: 15, color: colors.textSecondary },
    headerTitle: { fontSize: 15, fontWeight: WEIGHT.bold, color: colors.text },
    confirmButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    confirmButtonText: { fontSize: 13, fontWeight: WEIGHT.bold, color: ON_ACCENT },
    searchCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
      marginHorizontal: 16,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.text },
    resultsCard: {
      marginHorizontal: 16,
      marginTop: 6,
      backgroundColor: colors.background,
      borderRadius: RADII.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    resultRow: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    resultRowLast: { borderBottomWidth: 0 },
    resultRowText: { fontSize: 13, color: colors.text },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
    },
    currentLocationButton: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 16,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    currentLocationButtonText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    pinHint: {
      fontSize: 11,
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADII.pill,
      overflow: 'hidden',
    },
  });
}
