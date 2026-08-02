export type MapCoordinate = { latitude: number; longitude: number };

const escapeForHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export const buildRiderMapHtml = (destination: MapCoordinate, label: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;background:#e8f3ef}.leaflet-control-attribution{font-size:9px}.rider-dot{width:16px;height:16px;border:4px solid white;border-radius:50%;background:#1687ff;box-shadow:0 0 0 7px rgba(22,135,255,.18)}</style>
</head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
const destination=[${destination.latitude},${destination.longitude}];
const map=L.map('map',{zoomControl:false,attributionControl:true}).setView(destination,15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
L.marker(destination).addTo(map).bindPopup(${JSON.stringify(escapeForHtml(label))});
let riderMarker=null; let routeLine=null;
window.setRiderLocation=function(lat,lng){const point=[lat,lng];if(!riderMarker){riderMarker=L.marker(point,{icon:L.divIcon({className:'',html:'<div class="rider-dot"></div>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map).bindPopup('You are here');}else riderMarker.setLatLng(point);if(routeLine)routeLine.setLatLngs([point,destination]);else routeLine=L.polyline([point,destination],{color:'#008c68',weight:5,opacity:.85,dashArray:'10 8'}).addTo(map);map.fitBounds(L.latLngBounds([point,destination]),{padding:[32,32],maxZoom:16});};
window.clearRiderLocation=function(){if(riderMarker){map.removeLayer(riderMarker);riderMarker=null;}if(routeLine){map.removeLayer(routeLine);routeLine=null;}};
</script></body></html>`;
