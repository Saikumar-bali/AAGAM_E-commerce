export type MapCoordinate = { latitude: number; longitude: number };

function getMapboxToken(): string | null {
  const token =
    (typeof process !== 'undefined' && ((process.env as any).EXPO_PUBLIC_MAPBOX_TOKEN || (process.env as any).NEXT_PUBLIC_MAPBOX_TOKEN)) ||
    null;
  if (token && typeof token === 'string' && token.startsWith('pk.')) return token;
  // Jest: allow unit tests to generate map HTML without real token
  if (typeof process !== 'undefined' && ((process.env as any).NODE_ENV === 'test' || (process.env as any).JEST_WORKER_ID || (process.env as any).PLAYWRIGHT_TEST)) {
    return 'pk.test-dummy-token-for-jest';
  }
  return null;
}

export const buildRiderMapHtml = (destination: MapCoordinate, label: string) => {
  const token = getMapboxToken();
  if (!token) {
    return `<!doctype html><html><body style="display:flex;align-items:center;justify-content:center;height:100%;margin:0;color:#999;font-family:system-ui;">Map unavailable – missing Mapbox token</body></html>`;
  }
  const safeLabelJson = JSON.stringify(label);
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.css" rel="stylesheet" />
<style>html,body,#map{height:100%;margin:0;background:#e8f3ef}.rider-dot{width:16px;height:16px;border:4px solid white;border-radius:50%;background:#1687ff;box-shadow:0 0 0 7px rgba(22,135,255,.18)}</style>
</head><body><div id="map"></div><script src="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.js"></script><script>
mapboxgl.accessToken = '${token}';
const destination = [${destination.longitude}, ${destination.latitude}];
const map = new mapboxgl.Map({ container: 'map', style: 'mapbox://styles/mapbox/streets-v12', center: destination, zoom: 15, attributionControl: true });
const destPopup = new mapboxgl.Popup({ offset: 16 }).setText(${safeLabelJson});
new mapboxgl.Marker({ color: '#E74C3C' }).setLngLat(destination).setPopup(destPopup).addTo(map);
let riderMarker=null; let routeSourceAdded=false; let mapLoaded=false; let pendingPoint=null;
function ensureRoute(point, dest) {
  if (!mapLoaded || !map.isStyleLoaded()) {
    pendingPoint = point;
    return;
  }
  const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: [point, dest] } };
  if (!routeSourceAdded) {
    try {
      map.addSource('rider-route', { type: 'geojson', data: geojson });
      map.addLayer({ id: 'rider-route-line', type: 'line', source: 'rider-route', paint: { 'line-color': '#008c68', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [1, 2] } });
      routeSourceAdded = true;
    } catch(e) { pendingPoint = point; }
  } else {
    const src = map.getSource('rider-route');
    if (src) src.setData(geojson);
  }
}
function removeRoute() {
  if (!map.isStyleLoaded()) return;
  if (map.getLayer('rider-route-line')) map.removeLayer('rider-route-line');
  if (map.getSource('rider-route')) map.removeSource('rider-route');
  routeSourceAdded = false;
}
window.setRiderLocation=function(lat,lng){
  const point=[lng,lat];
  if(!mapLoaded || !map.isStyleLoaded()){
    pendingPoint=point;
  }
  if(!riderMarker){
    const el=document.createElement('div');
    el.className='rider-dot';
    riderMarker=new mapboxgl.Marker({ element: el }).setLngLat(point).setPopup(new mapboxgl.Popup({ offset: 12 }).setText('You are here')).addTo(map);
  } else riderMarker.setLngLat(point);
  ensureRoute(point, destination);
  const bounds=new mapboxgl.LngLatBounds();
  bounds.extend(point);
  bounds.extend(destination);
  try { map.fitBounds(bounds,{padding:32,maxZoom:16}); } catch(e) {}
};
window.clearRiderLocation=function(){
  if(riderMarker){ riderMarker.remove(); riderMarker=null; }
  if(routeSourceAdded) removeRoute();
  pendingPoint=null;
};
map.on('load', function(){ mapLoaded=true; map.resize(); if(pendingPoint){ ensureRoute(pendingPoint, destination); const b=new mapboxgl.LngLatBounds(); b.extend(pendingPoint); b.extend(destination); try{ map.fitBounds(b,{padding:32,maxZoom:16}); }catch(e){} pendingPoint=null; } });
</script></body></html>`;
};
