export type MapCoordinate = { latitude: number; longitude: number };

const escapeForHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2Fpa3VtY3VtdYXiYIwiYSI6ImNtdD1ON3F5ZzBmYjgd3NodWE1a2hzZG4ifQ.4puZMTpkr6k1P9BPQreYdw';

export const buildRiderMapHtml = (destination: MapCoordinate, label: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.css" rel="stylesheet" />
<style>html,body,#map{height:100%;margin:0;background:#e8f3ef}.mapboxgl-ctrl-attrib{font-size:9px}.rider-dot{width:16px;height:16px;border:4px solid white;border-radius:50%;background:#1687ff;box-shadow:0 0 0 7px rgba(22,135,255,.18)}</style>
</head><body><div id="map"></div><script src="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.js"></script><script>
mapboxgl.accessToken = '${MAPBOX_TOKEN}';
const destination = [${destination.longitude}, ${destination.latitude}];
const destLatLng = [${destination.latitude}, ${destination.longitude}];
const map = new mapboxgl.Map({ container: 'map', style: 'mapbox://styles/mapbox/streets-v12', center: destination, zoom: 15, attributionControl: true });
const destPopup = new mapboxgl.Popup({ offset: 16 }).setText(${JSON.stringify(escapeForHtml(label))});
new mapboxgl.Marker({ color: '#E74C3C' }).setLngLat(destination).setPopup(destPopup).addTo(map);
let riderMarker=null; let routeSourceAdded=false;
function ensureRoute(point, dest) {
  const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: [point, dest] } };
  if (!routeSourceAdded) {
    map.addSource('rider-route', { type: 'geojson', data: geojson });
    map.addLayer({ id: 'rider-route-line', type: 'line', source: 'rider-route', paint: { 'line-color': '#008c68', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [1, 2] } });
    routeSourceAdded = true;
  } else {
    const src = map.getSource('rider-route');
    if (src) src.setData(geojson);
  }
}
function removeRoute() {
  if (map.getLayer('rider-route-line')) map.removeLayer('rider-route-line');
  if (map.getSource('rider-route')) map.removeSource('rider-route');
  routeSourceAdded = false;
}
window.setRiderLocation=function(lat,lng){
  const point=[lng,lat];
  const latLng=[lat,lng];
  if(!riderMarker){
    const el=document.createElement('div');
    el.className='rider-dot';
    riderMarker=new mapboxgl.Marker({ element: el }).setLngLat(point).setPopup(new mapboxgl.Popup({ offset: 12 }).setText('You are here')).addTo(map);
  } else riderMarker.setLngLat(point);
  ensureRoute(point, destination);
  const bounds=new mapboxgl.LngLatBounds();
  bounds.extend(point);
  bounds.extend(destination);
  map.fitBounds(bounds,{padding:32,maxZoom:16});
};
window.clearRiderLocation=function(){
  if(riderMarker){ riderMarker.remove(); riderMarker=null; }
  if(routeSourceAdded) removeRoute();
};
map.on('load', function(){ map.resize(); });
</script></body></html>`;
