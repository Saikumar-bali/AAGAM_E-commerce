import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const CompatibleWebView = WebView as unknown as React.ComponentType<any>;

interface Marker {
  latitude: number;
  longitude: number;
  type: 'store' | 'delivery' | 'rider';
  label?: string;
}

interface TrackingMapProps {
  markers: Marker[];
  routePath?: { latitude: number; longitude: number }[];
  style?: any;
}

const TRACKING_HTML = (
  markers: Marker[],
  routePath: { latitude: number; longitude: number }[],
) => {
  const markersJson = JSON.stringify(markers);
  const routeJson = JSON.stringify(routePath);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; }
    .leaflet-control-attribution { display: none !important; }
    .custom-marker { display: flex; align-items: center; justify-content: center; }
    .marker-store { width: 28px; height: 28px; background: #F59E0B; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .marker-delivery { width: 28px; height: 28px; background: #3B82F6; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .marker-rider { width: 32px; height: 32px; background: #10B981; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
    .marker-rider svg { fill: white; }
    .marker-label { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 9px; font-weight: bold; color: #333; background: white; padding: 1px 4px; border-radius: 4px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var markers = ${markersJson};
    var routePath = ${routeJson};

    if (markers.length === 0) {
      document.getElementById('map').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:14px;">No location data</div>';
    } else {
      var map = L.map('map', { zoomControl: false, attributionControl: false });
      var bounds = L.latLngBounds(markers.map(function(m) { return [m.latitude, m.longitude]; }));
      map.fitBounds(bounds, { padding: [40, 40] });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      markers.forEach(function(m) {
        var className = 'marker-' + m.type;
        var icon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="' + className + '">' +
            (m.type === 'rider' ? '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2L16 16L12 14L8 16L12 2Z"/></svg>' : '') +
            '</div>' +
            (m.label ? '<div class="marker-label">' + m.label + '</div>' : ''),
          iconSize: m.type === 'rider' ? [32, 32] : [28, 28],
          iconAnchor: m.type === 'rider' ? [16, 16] : [14, 14],
        });
        L.marker([m.latitude, m.longitude], { icon: icon }).addTo(map);
      });

      if (routePath.length > 1) {
        var coords = routePath.map(function(p) { return [p.latitude, p.longitude]; });
        L.polyline(coords, { color: '#3B82F6', weight: 3, opacity: 0.7 }).addTo(map);
      }
    }
  </script>
</body>
</html>`;
};

export const TrackingMap = ({ markers, routePath = [], style }: TrackingMapProps) => {
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    webViewRef.current?.reload?.();
  }, [markers, routePath]);

  const validMarkers = markers.filter(
    (marker) => typeof marker.latitude === 'number' && typeof marker.longitude === 'number',
  );

  if (validMarkers.length === 0) {
    return (
      <View style={[styles.container, styles.empty, style]}>
        <View style={styles.emptyContent}>
          <View style={styles.emptyIcon}><View style={styles.emptyDot} /></View>
          <View style={styles.emptyTextContainer}>
            <View style={styles.emptyLine1} />
            <View style={styles.emptyLine2} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <CompatibleWebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: TRACKING_HTML(validMarkers, routePath) }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { borderRadius: 16, overflow: 'hidden', height: 220, backgroundColor: '#F1F5F9' },
  webview: { flex: 1 },
  empty: { justifyContent: 'center', alignItems: 'center' },
  emptyContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  emptyDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#CBD5E1' },
  emptyTextContainer: { gap: 6 },
  emptyLine1: { width: 80, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0' },
  emptyLine2: { width: 50, height: 8, borderRadius: 4, backgroundColor: '#F1F5F9' },
});

export default TrackingMap;
