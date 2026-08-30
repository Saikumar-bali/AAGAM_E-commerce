import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getMapboxToken } from '../utils/mapbox';

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

const MAPBOX_HTML = (lat: number, lng: number) => {
  const token = getMapboxToken();
  if (!token) {
    return `<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100%;margin:0;color:#999;font-size:14px;">Map unavailable – missing Mapbox token</body></html>`;
  }
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.js"></script>
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; }
    #search-container { position:absolute; top:10px; left:10px; right:10px; z-index:10; }
    #search-input { width:100%; padding:10px 14px; border-radius:12px; border:1px solid #e2e8f0; background:white; font-size:14px; font-family:-apple-system,system-ui,sans-serif; box-shadow:0 4px 12px rgba(0,0,0,0.1); outline:none; box-sizing:border-box; }
    #search-input:focus { border-color:#0f766e; }
    #search-results { position:absolute; top:100%; left:0; right:0; margin-top:4px; background:white; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 8px 24px rgba(0,0,0,0.15); max-height:200px; overflow-y:auto; display:none; z-index:20; }
    .search-result-item { padding:10px 14px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:13px; font-family:-apple-system,system-ui,sans-serif; color:#0f172a; }
    .search-result-item:last-child { border-bottom:none; }
    .search-result-item:active { background:#f0fdfa; }
    .search-result-type { font-size:10px; font-weight:700; color:#0f766e; text-transform:uppercase; }
    .search-result-name { margin-top:2px; color:#334155; font-size:12px; line-height:1.3; }
    #search-clear { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; font-size:18px; color:#94a3b8; cursor:pointer; display:none; padding:0 4px; }
  </style>
</head>
<body>
  <div id="search-container">
    <input id="search-input" type="text" placeholder="Search address..." autocomplete="off" />
    <button id="search-clear">&times;</button>
    <div id="search-results"></div>
  </div>
  <div id="map"></div>
  <script>
    mapboxgl.accessToken = '${token}';
    var map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [${lng}, ${lat}],
      zoom: 15,
      attributionControl: true
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

    var searchInput = document.getElementById('search-input');
    var searchResults = document.getElementById('search-results');
    var searchClear = document.getElementById('search-clear');
    var debounceTimer = null;

    searchInput.addEventListener('input', function() {
      var query = this.value.trim();
      searchClear.style.display = query.length > 0 ? 'block' : 'none';
      if (debounceTimer) clearTimeout(debounceTimer);
      if (query.length < 3) { searchResults.style.display = 'none'; return; }
      debounceTimer = setTimeout(function() {
        fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(query) + '.json?access_token=' + mapboxgl.accessToken + '&country=in&types=address,place,neighborhood,poi&autocomplete=true&limit=5')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data.features || data.features.length === 0) { searchResults.style.display = 'none'; return; }
            searchResults.innerHTML = '';
            data.features.forEach(function(f) {
              var div = document.createElement('div');
              div.className = 'search-result-item';
              div.innerHTML = '<div class="search-result-type">' + (f.place_type[0] || '') + '</div><div class="search-result-name">' + f.place_name + '</div>';
              div.addEventListener('click', function() {
                var lng = f.center[0];
                var lat = f.center[1];
                map.flyTo({ center: [lng, lat], zoom: 16 });
                marker.setLngLat([lng, lat]);
                searchInput.value = f.place_name;
                searchResults.style.display = 'none';
                searchClear.style.display = 'block';
                sendPos({ lat: lat, lng: lng });
              });
              searchResults.appendChild(div);
            });
            searchResults.style.display = 'block';
          })
          .catch(function() { searchResults.style.display = 'none'; });
      }, 300);
    });

    searchClear.addEventListener('click', function() {
      searchInput.value = '';
      searchResults.style.display = 'none';
      searchClear.style.display = 'none';
      searchInput.focus();
    });

    searchInput.addEventListener('blur', function() {
      setTimeout(function() { searchResults.style.display = 'none'; }, 200);
    });
  </script>
</body>
</html>
`;
};

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

  useEffect(() => {
    // Reload on prop change so controlled pin moves without remount
    webViewRef.current?.reload?.();
  }, [latitude, longitude]);

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
