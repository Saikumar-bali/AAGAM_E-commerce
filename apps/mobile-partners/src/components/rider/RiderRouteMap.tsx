import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ExternalLink, LocateFixed, Navigation } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { buildRiderMapHtml, MapCoordinate, RiderMapStop } from './riderRouteMapHtml';
import { EXPO_PUBLIC_MAPBOX_TOKEN } from '@env';

// react-native-webview 14's overloads collapse to `never` with React 19 JSX
// types. Keep the compatibility cast at this third-party boundary.
const CompatibleWebView = WebView as unknown as React.ComponentType<any>;

type Coordinate = MapCoordinate;

export type RiderRouteMapProps = {
  destination?: Coordinate | null;
  destinationLabel: string;
  active?: boolean;
  riderLocation?: Coordinate | null;
  expanded?: boolean;
  stops?: RiderMapStop[];
  progressDone?: number;
  progressTotal?: number;
  /** Highlights one stop pin (its map stop id) and gently recentres. */
  activeStopId?: string | null;
  /** Fired when the rider taps a stop pin on the map. */
  onStopPress?: (stopId: string, sequence: number) => void;
  /**
   * Map-first consoles: render the WebView full-bleed with no card header or
   * footer, so the map owns the whole layer and every control floats above it.
   */
  chromeless?: boolean;
  /** Distance from the bottom edge for the floating nav controls (chromeless). */
  controlsBottom?: number;
};

const validCoordinate = (point?: Coordinate | null): point is Coordinate => Boolean(
  point
  && Number.isFinite(point.latitude)
  && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90
  && Math.abs(point.longitude) <= 180,
);

export const RiderRouteMap = ({ destination, destinationLabel, active = true, riderLocation, expanded = false, stops, progressDone, progressTotal, activeStopId, onStopPress, chromeless = false, controlsBottom }: RiderRouteMapProps) => {
  const webView = useRef<any>(null);
  const stopPressRef = useRef(onStopPress);
  stopPressRef.current = onStopPress;
  const [hasFix, setHasFix] = useState(false);
  const [ready, setReady] = useState(false);
  const [navigationMode, setNavigationMode] = useState(false);
  const hasProgress = Number.isFinite(progressDone) && Number.isFinite(progressTotal) && (progressTotal as number) > 0;
  const stopsKey = (stops || []).map((stop) => `${stop.id}:${stop.sequence}:${stop.slot}:${stop.latitude}:${stop.longitude}:${stop.state}:${stop.status}:${stop.label}:${stop.plan}:${stop.address}:${stop.multiSub ? 1 : 0}:${stop.cashDuePaise}:${stop.cashPaidPaise}:${stop.extraCount}:${stop.skipped ? 1 : 0}`).join('|');
  const html = useMemo(
    () => validCoordinate(destination) ? buildRiderMapHtml(destination, destinationLabel, EXPO_PUBLIC_MAPBOX_TOKEN, { stops }) : null,
    [destination?.latitude, destination?.longitude, destinationLabel, stopsKey],
  );

  // Keep the live rider dot in sync after the page is ready; before that the
  // load handler seeds the first position.
  useEffect(() => {
    if (!ready) return;
    if (!active || !validCoordinate(riderLocation)) {
      setHasFix(false);
      webView.current?.injectJavaScript('if(window.clearRiderLocation){window.clearRiderLocation();}true;');
      return;
    }
    setHasFix(true);
    webView.current?.injectJavaScript(`window.setRiderLocation(${riderLocation.latitude},${riderLocation.longitude});true;`);
  }, [ready, active, riderLocation?.latitude, riderLocation?.longitude]);

  // Tilt into a navigation camera and show the turn-by-turn banner.
  useEffect(() => {
    if (!ready) return;
    webView.current?.injectJavaScript(`if(window.setNavigationMode){window.setNavigationMode(${navigationMode});}true;`);
  }, [ready, navigationMode]);

  useEffect(() => {
    if (!ready || !hasProgress) return;
    webView.current?.injectJavaScript(`if(window.setRouteProgress){window.setRouteProgress(${progressDone},${progressTotal});}true;`);
  }, [ready, hasProgress, progressDone, progressTotal]);

  // Keep the focused pin in sync as the bottom sheet moves between stops.
  useEffect(() => {
    if (!ready) return;
    webView.current?.injectJavaScript(`if(window.setActiveStop){window.setActiveStop(${JSON.stringify(activeStopId || '')});}true;`);
  }, [ready, activeStopId]);

  const handleMessage = (event: { nativeEvent?: { data?: string } }) => {
    const raw = event?.nativeEvent?.data;
    if (!raw || typeof raw !== 'string') return;
    try {
      const payload = JSON.parse(raw);
      if (payload?.type === 'stop-tap' && payload.id) stopPressRef.current?.(String(payload.id), Number(payload.sequence) || 0);
    } catch {
      // Ignore non-JSON messages (e.g. the style toggle); the map keeps working.
    }
  };

  useEffect(() => {
    if (!active) setNavigationMode(false);
  }, [active]);

  if (!html || !destination) {
    return <View style={styles.unavailable}><LocateFixed size={20} color="#64748B" /><Text style={styles.unavailableText}>Map appears when destination coordinates are available.</Text></View>;
  }

  const openNavigation = () => Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`,
  );

  const mapView = (
    <CompatibleWebView
      ref={webView}
      testID="rider_route_webview"
      source={{ html }}
      originWhitelist={['https://*']}
      javaScriptEnabled
      domStorageEnabled={false}
      scrollEnabled={false}
      overScrollMode="never"
      onMessage={handleMessage}
      onLoadEnd={() => {
        // Belt-and-braces seed in case the map's own load handler fired
        // before the first location was available.
        if (!active || !validCoordinate(riderLocation)) {
          setHasFix(false);
          webView.current?.injectJavaScript('if(window.clearRiderLocation){window.clearRiderLocation();}true;');
        } else {
          webView.current?.injectJavaScript(`window.setRiderLocation(${riderLocation.latitude},${riderLocation.longitude});true;`);
        }
        // Defer so the injected script runs after the page finishes loading.
        setTimeout(() => setReady(true), 500);
      }}
    />
  );

  // Map-first console: the WebView is the whole layer, and the only chrome is a
  // floating tool cluster (nav camera toggle + open in maps) parked just above
  // the bottom sheet.
  if (chromeless) {
    return (
      <View testID="rider_live_route_map" style={styles.bare}>
        <View style={styles.bareClip}>{mapView}</View>
        <View style={[styles.floatControls, { bottom: controlsBottom ?? 12 }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={navigationMode ? 'Stop navigation mode' : 'Start navigation mode'}
            testID="rider_navigation_mode"
            style={[styles.floatPill, navigationMode && styles.navigateActive]}
            onPress={() => setNavigationMode((on) => !on)}
          >
            <Navigation size={15} color="#FFFFFF" />
            <Text style={styles.navigateText}>{navigationMode ? 'Stop nav' : 'Start nav'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open turn-by-turn navigation" testID="rider_open_turn_by_turn" style={styles.floatIcon} onPress={() => void openNavigation()}>
            <ExternalLink size={16} color="#0F766E" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View testID="rider_live_route_map" style={[styles.card, expanded && styles.expandedCard]}>
      <View style={styles.header}>
        <View style={styles.titleRow}><View style={styles.liveDot} /><Text style={styles.title}>LIVE ROUTE</Text></View>
        <Text style={styles.provider}>Mapbox · Satellite</Text>
      </View>
      <View style={[styles.mapClip, expanded && styles.expandedMap]}>
        {mapView}
      </View>
      <View style={styles.footer}>
        <View style={styles.footerCopy}>
          <Text style={styles.destination} numberOfLines={1}>{destinationLabel}</Text>
          <Text style={styles.status}>{navigationMode ? 'Navigation on · turn-by-turn banner live' : (hasFix ? 'Your position updates while delivery tracking is active.' : 'Finding your live position…')}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={navigationMode ? 'Stop navigation mode' : 'Start navigation mode'}
          testID="rider_navigation_mode"
          style={[styles.navigateButton, navigationMode && styles.navigateActive]}
          onPress={() => setNavigationMode((on) => !on)}
        >
          <Navigation size={16} color="#FFFFFF" />
          <Text style={styles.navigateText}>{navigationMode ? 'Stop' : 'Start'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open turn-by-turn navigation" testID="rider_open_turn_by_turn" style={styles.externalButton} onPress={() => void openNavigation()}>
          <ExternalLink size={16} color="#0F766E" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginTop: 16, borderRadius: 20, borderWidth: 1, borderColor: '#B7E4D7', overflow: 'hidden', backgroundColor: '#FFFFFF' },
  expandedCard: { flex: 1, marginTop: 0, borderRadius: 18 },
  bare: { flex: 1, backgroundColor: '#0B1B3A' },
  bareClip: { flex: 1, overflow: 'hidden', backgroundColor: '#E8F3EF' },
  floatControls: { position: 'absolute', right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  floatPill: { height: 38, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', gap: 6 },
  floatIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  header: { height: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  title: { color: '#006B52', fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  provider: { color: '#64748B', fontSize: 9, fontWeight: '500' },
  mapClip: { height: 210, minHeight: 210, backgroundColor: '#E8F3EF', overflow: 'hidden' },
  expandedMap: { flex: 1, height: undefined, minHeight: 320 },
  footer: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerCopy: { flex: 1 },
  destination: { color: '#0F172A', fontSize: 12, fontWeight: '600' },
  status: { color: '#64748B', fontSize: 9, lineHeight: 14, marginTop: 2 },
  navigateButton: { height: 40, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', gap: 6 },
  navigateActive: { backgroundColor: '#0F172A' },
  navigateText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  externalButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  unavailable: { marginTop: 16, minHeight: 74, borderRadius: 16, backgroundColor: '#F1F5F9', padding: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  unavailableText: { color: '#64748B', fontSize: 10, textAlign: 'center', fontWeight: '500' },
});
