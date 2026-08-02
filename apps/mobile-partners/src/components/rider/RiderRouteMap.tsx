import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { ExternalLink, LocateFixed, Navigation } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { buildRiderMapHtml, MapCoordinate } from './riderRouteMapHtml';

// react-native-webview 14's overloads collapse to `never` with React 19 JSX
// types. Keep the compatibility cast at this third-party boundary.
const CompatibleWebView = WebView as unknown as React.ComponentType<any>;

type Coordinate = MapCoordinate;

export type RiderRouteMapProps = {
  destination?: Coordinate | null;
  destinationLabel: string;
  active?: boolean;
};

const validCoordinate = (point?: Coordinate | null): point is Coordinate => Boolean(
  point
  && Number.isFinite(point.latitude)
  && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90
  && Math.abs(point.longitude) <= 180,
);

export const RiderRouteMap = ({ destination, destinationLabel, active = true }: RiderRouteMapProps) => {
  const webView = useRef<any>(null);
  const [hasFix, setHasFix] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const html = useMemo(
    () => validCoordinate(destination) ? buildRiderMapHtml(destination, destinationLabel) : null,
    [destination?.latitude, destination?.longitude, destinationLabel],
  );

  useEffect(() => {
    if (!active || !html) return;
    const watchId = Geolocation.watchPosition(
      ({ coords }) => {
        setHasFix(true);
        setLocationError(null);
        webView.current?.injectJavaScript(`window.setRiderLocation(${coords.latitude},${coords.longitude});true;`);
      },
      (error) => setLocationError(error.message || 'Waiting for your GPS location.'),
      { enableHighAccuracy: true, distanceFilter: 10, interval: 8_000, fastestInterval: 5_000 },
    );
    return () => Geolocation.clearWatch(watchId);
  }, [active, html]);

  if (!html || !destination) {
    return <View style={styles.unavailable}><LocateFixed size={20} color="#64748B" /><Text style={styles.unavailableText}>Map appears when destination coordinates are available.</Text></View>;
  }

  const openNavigation = () => Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`,
  );

  return (
    <View testID="rider_live_route_map" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}><View style={styles.liveDot} /><Text style={styles.title}>LIVE ROUTE</Text></View>
        <Text style={styles.provider}>OpenStreetMap</Text>
      </View>
      <View style={styles.mapClip}>
        <CompatibleWebView
          ref={webView}
          testID="rider_route_webview"
          source={{ html }}
          originWhitelist={['https://*']}
          javaScriptEnabled
          domStorageEnabled={false}
          scrollEnabled={false}
          overScrollMode="never"
          onLoadEnd={() => Geolocation.getCurrentPosition(
            ({ coords }) => webView.current?.injectJavaScript(`window.setRiderLocation(${coords.latitude},${coords.longitude});true;`),
            () => undefined,
            { enableHighAccuracy: true, timeout: 8_000, maximumAge: 10_000 },
          )}
        />
      </View>
      <View style={styles.footer}>
        <View style={styles.footerCopy}>
          <Text style={styles.destination} numberOfLines={1}>{destinationLabel}</Text>
          <Text style={styles.status}>{locationError || (hasFix ? 'Your position updates while delivery tracking is active.' : 'Finding your live position…')}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" testID="rider_open_turn_by_turn" style={styles.navigateButton} onPress={() => void openNavigation()}>
          <Navigation size={16} color="#FFFFFF" /><Text style={styles.navigateText}>Navigate</Text><ExternalLink size={13} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginTop: 16, borderRadius: 20, borderWidth: 1, borderColor: '#B7E4D7', overflow: 'hidden', backgroundColor: '#FFFFFF' },
  header: { height: 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  title: { color: '#006B52', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  provider: { color: '#64748B', fontSize: 9, fontWeight: '700' },
  mapClip: { height: 210, backgroundColor: '#E8F3EF' },
  footer: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerCopy: { flex: 1 },
  destination: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  status: { color: '#64748B', fontSize: 9, lineHeight: 14, marginTop: 2 },
  navigateButton: { height: 40, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#008C68', flexDirection: 'row', alignItems: 'center', gap: 5 },
  navigateText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  unavailable: { marginTop: 16, minHeight: 74, borderRadius: 16, backgroundColor: '#F1F5F9', padding: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  unavailableText: { color: '#64748B', fontSize: 10, textAlign: 'center', fontWeight: '700' },
});
