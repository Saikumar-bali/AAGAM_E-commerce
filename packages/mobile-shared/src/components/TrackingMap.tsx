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

const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2Fpa3VtY3VtdYXiYIwiYSI6ImNtdD1ON3F5ZzBmYjgd3NodWE1a2hzZG4ifQ.4puZMTpkr6k1P9BPQreYdw';

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
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.js"></script>
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; }
    .mapboxgl-ctrl-attrib, .mapboxgl-ctrl-logo { display: none !important; }
    .marker-store { width: 28px; height: 28px; background: #F59E0B; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .marker-delivery { width: 28px; height: 28px; background: #3B82F6; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .marker-rider { width: 32px; height: 32px; background: #10B981; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
    .marker-rider svg { fill: white; }
    .marker-label { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 9px; font-weight: bold; color: #333; background: white; padding: 1px 4px; border-radius: 4px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .custom-marker { position: relative; display: flex; align-items: center; justify-content: center; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var markers = ${markersJson};
    var routePath = ${routeJson};
    mapboxgl.accessToken = '${MAPBOX_TOKEN}';

    if (markers.length === 0) {
      document.getElementById('map').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:14px;">No location data</div>';
    } else {
      var bounds = new mapboxgl.LngLatBounds();
      markers.forEach(function(m){ bounds.extend([m.longitude, m.latitude]); });
      var map = new mapboxgl.Map({ container: 'map', style: 'mapbox://styles/mapbox/streets-v12', center: [markers[0].longitude, markers[0].latitude], zoom: 14, attributionControl: false });
      if (markers.length > 1) {
        map.fitBounds(bounds, { padding: 40 });
      }

      map.on('load', function(){
        if (markers.length > 1) {
          try { map.fitBounds(bounds, { padding: 40 }); } catch(e) {}
        }
        markers.forEach(function(m) {
          var el = document.createElement('div');
          el.className = 'custom-marker';
          var dot = document.createElement('div');
          dot.className = 'marker-' + m.type;
          if (m.type === 'rider') {
            dot.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2L16 16L12 14L8 16L12 2Z"/></svg>';
          }
          el.appendChild(dot);
          if (m.label) {
            var lbl = document.createElement('div');
            lbl.className = 'marker-label';
            lbl.textContent = m.label;
            el.appendChild(lbl);
          }
          new mapboxgl.Marker({ element: el }).setLngLat([m.longitude, m.latitude]).addTo(map);
        });

        if (routePath.length > 1) {
          var geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: routePath.map(function(p){ return [p.longitude, p.latitude]; }) } };
          map.addSource('route', { type: 'geojson', data: geojson });
          map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#3B82F6', 'line-width': 3, 'line-opacity': 0.7 } });
        }
      });
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
