import { useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  UrlTile,
  type MapPressEvent,
  type MarkerDragStartEndEvent,
  type Region,
} from 'react-native-maps';

import { RADII } from '@/constants/style';

// Free on both platforms, no API key anywhere: iOS renders Apple's own map
// data via PROVIDER_DEFAULT (built into the OS, no account needed). Android's
// "default" provider is Google Maps, which needs an API key tied to a Google
// Cloud billing account — we skip that entirely and instead draw raw
// OpenStreetMap tiles as an overlay on a blank base map, which needs nothing
// but a plain HTTPS request.
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

type Props = {
  latitude: number;
  longitude: number;
  /** Static pin display (game detail) vs draggable pin the user can reposition (create/edit forms). */
  interactive?: boolean;
  onLocationChange?: (coords: { latitude: number; longitude: number }) => void;
  height?: number;
  // Fills its parent instead of using a fixed height — used by the
  // full-screen MapPickerModal, where the map is the entire background
  // rather than a small embed sitting under a form field.
  fill?: boolean;
};

export function GameMap({ latitude, longitude, interactive = false, onLocationChange, height = 180, fill = false }: Props) {
  const mapRef = useRef<MapView>(null);

  const initialRegion: Region = useMemo(
    () => ({
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }),
    // Only used for the map's initial mount — deliberately not re-derived on
    // every latitude/longitude change, or dragging the pin would fight the
    // map's own camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <View style={fill ? styles.wrapFill : [styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'ios' ? PROVIDER_DEFAULT : undefined}
        // Android's provider still wants to draw Google's own base map
        // underneath (which needs the API key we're avoiding) unless its
        // built-in map type is explicitly turned off — "none" leaves a blank
        // base map so only our OSM UrlTile overlay below is visible.
        mapType={Platform.OS === 'android' ? 'none' : undefined}
        initialRegion={initialRegion}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={
          interactive
            ? (e: MapPressEvent) => onLocationChange?.(e.nativeEvent.coordinate)
            : undefined
        }>
        {Platform.OS === 'android' ? <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={19} flipY={false} /> : null}
        <Marker
          coordinate={{ latitude, longitude }}
          draggable={interactive}
          onDragEnd={
            interactive ? (e: MarkerDragStartEndEvent) => onLocationChange?.(e.nativeEvent.coordinate) : undefined
          }
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: RADII.lg, overflow: 'hidden' },
  wrapFill: { flex: 1 },
  map: { flex: 1 },
});
