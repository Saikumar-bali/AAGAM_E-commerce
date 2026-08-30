import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

// react-native-webview 14 currently exposes a class overload that collapses to
// `never` under React 19's JSX types. Runtime props remain supported; keep the
// compatibility cast at this single third-party boundary rather than weakening
// the package TypeScript configuration.
const CompatibleWebView = WebView as unknown as React.ComponentType<any>;

type Props = {
  latitude: number;
  longitude: number;
  onPinChange: (lat: number, lng: number) => void;
  style?: any;
};

const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2Fpa3VtY3VtdYXiYIwiYSI6ImNtdD1ON3F5ZzBmYjgd3NodWE1a2hzZG4ifQ.4puZMTpkr6k1P9BPQreYdw';

const MAPBOX_HTML = (lat: number, lng: number) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.js"></script>
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; }
    .mapboxgl-ctrl-attrib { display: none !important; }
    .mapboxgl-ctrl-logo { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    mapboxgl.accessToken = '${MAPBOX_TOKEN}';
    var map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [${lng}, ${lat}],
      zoom: 15,
      attributionControl: false
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    var marker = new mapboxgl.Marker({ draggable: true, color: '#0f766e' })
      .setLngLat([${lng}, ${lat}])
      .addTo(map);
    function sendPos(lngLat) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ lat: lngLat.lat, lng: lngLat.lng }));
    }
    marker.on('dragend', function() {
      var lngLat = marker.getLngLat();
      sendPos(lngLat);
    });
    map.on('click', function(e) {
      marker.setLngLat(e.lngLat);
      sendPos(e.lngLat);
    });
  </script>
</body>
</html>
`;

// Backward compat – keep LEAFLET_HTML alias for any external import (now uses Mapbox)
const LEAFLET_HTML = MAPBOX_HTML;

export const LeafletMap = ({ latitude, longitude, onPinChange, style }: Props) => {
  const webViewRef = useRef<any>(null);
  const lastSentRef = useRef('');

  const onMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        const key = `${data.lat.toFixed(6)},${data.lng.toFixed(6)}`;
        if (key !== lastSentRef.current) {
          lastSentRef.current = key;
          onPinChange(data.lat, data.lng);
        }
      } catch {}
    },
    [onPinChange],
  );

  return (
    <View style={[styles.container, style]}>
      <CompatibleWebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: LEAFLET_HTML(latitude, longitude) }}
        style={styles.webview}
        onMessage={onMessage}
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
  container: { borderRadius: 16, overflow: 'hidden', height: 210 },
  webview: { flex: 1 },
});
