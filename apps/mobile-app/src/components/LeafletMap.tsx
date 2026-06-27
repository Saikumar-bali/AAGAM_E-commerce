import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  latitude: number;
  longitude: number;
  onPinChange: (lat: number, lng: number) => void;
  style?: any;
};

const LEAFLET_HTML = (lat: number, lng: number) => `
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
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${lat}, ${lng}], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    var marker = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);

    marker.on('dragend', function(e) {
      var pos = e.target.getLatLng();
      window.ReactNativeWebView.postMessage(JSON.stringify({ lat: pos.lat, lng: pos.lng }));
    });

    map.on('click', function(e) {
      var pos = e.latlng;
      marker.setLatLng(pos);
      window.ReactNativeWebView.postMessage(JSON.stringify({ lat: pos.lat, lng: pos.lng }));
    });

    function updateMarker(lat, lng) {
      map.setView([lat, lng], 15);
      marker.setLatLng([lat, lng]);
    }
  </script>
</body>
</html>
`;

export const LeafletMap = ({ latitude, longitude, onPinChange, style }: Props) => {
  const webViewRef = useRef<WebView>(null);
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

  const html = LEAFLET_HTML(latitude, longitude);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
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
