import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox GL JS v3 requires an access token at initialization, even when
// the style is loaded from a third-party CDN. The token is a public
// browser-side key, scoped via the Mapbox account. It lives in
// dashboard/.env (gitignored) and is injected at build time by Vite.
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
if (!mapboxgl.accessToken) {
  console.warn('[main] VITE_MAPBOX_TOKEN is missing — see dashboard/.env.example');
}

// We use the CARTO Dark Matter style — free, sober, matches the project
// palette. The Mapbox token is only used to satisfy mapbox-gl's auth
// check; the tiles themselves come from CARTO, not from Mapbox.
const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const ROUTE_COLOR = {
  Central: '#5b8dbe',
  Western: '#7fb069',
  Eastern: '#d4a373',
  Mixed: '#9b87b3',
};

async function loadIncidents() {
  const res = await fetch('./data/incidents.geojson');
  if (!res.ok) throw new Error(`Failed to load incidents.geojson: ${res.status}`);
  return res.json();
}

function updateSummary(features) {
  const n = features.length;
  const v = features.reduce((acc, f) => acc + (f.properties.victims || 0), 0);
  document.getElementById('incident-count').textContent =
    `${n.toLocaleString('fr-FR')} incidents`;
  document.getElementById('victim-count').textContent =
    `${v.toLocaleString('fr-FR')} victimes`;
}

function applyFilter(map, fc, route) {
  const filtered = route === 'all'
    ? fc.features
    : fc.features.filter((f) => f.properties.route === route);
  map.getSource('incidents').setData({
    type: 'FeatureCollection',
    features: filtered,
  });
  updateSummary(filtered);
}

async function main() {
  const fc = await loadIncidents();

  const map = new mapboxgl.Map({
    container: 'map',
    style: STYLE_URL,
    center: [15, 37],   // Central Mediterranean
    zoom: 4.2,
    minZoom: 3,
    maxZoom: 10,
    attributionControl: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  // Surface map errors visibly instead of letting them die silently in the
  // console. Style/tile-loading failures (CDN blocked by VPN, network down,
  // etc.) are the most common cause of a "white map" symptom.
  map.on('error', (e) => {
    console.error('[map.error]', e);
    const msg = e?.error?.message || e?.error?.toString() || 'unknown';
    const banner = document.createElement('div');
    banner.style.cssText = 'position:absolute;top:0.5rem;left:0.5rem;right:0.5rem;padding:0.5rem 0.75rem;background:#c75450;color:#fff;font-size:0.85rem;border-radius:3px;z-index:10';
    banner.textContent = `Erreur carte : ${msg}`;
    document.getElementById('map').appendChild(banner);
  });

  map.on('load', () => {
    map.addSource('incidents', {
      type: 'geojson',
      data: fc,
    });

    // One circle layer, colored by route, sized by victims, faded when the
    // IOM location is a placeholder, outlined when we corrected the coords.
    map.addLayer({
      id: 'incident-circles',
      type: 'circle',
      source: 'incidents',
      paint: {
        'circle-color': [
          'match',
          ['get', 'route'],
          'Central', ROUTE_COLOR.Central,
          'Western', ROUTE_COLOR.Western,
          'Eastern', ROUTE_COLOR.Eastern,
          ROUTE_COLOR.Mixed,
        ],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'victims'],
          0, 2.5,
          10, 4,
          100, 8,
          500, 14,
        ],
        'circle-opacity': [
          'case',
          ['get', 'location_unspecified'], 0.25,
          0.75,
        ],
        'circle-stroke-color': '#e6e6e6',
        'circle-stroke-width': [
          'case',
          ['get', 'coord_corrected'], 1.5,
          0,
        ],
      },
    });

    // Hover tooltip — minimal: date, route, victim count.
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'incident-popup',
    });
    map.on('mouseenter', 'incident-circles', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features[0].properties;
      const html = `
        <strong>${p.date ?? 'date inconnue'}</strong><br/>
        Route: ${p.route ?? 'non précisée'}<br/>
        ${p.victims} victime${p.victims > 1 ? 's' : ''}
        ${p.location_unspecified ? '<br/><em>Localisation imprécise</em>' : ''}
        ${p.coord_corrected ? '<br/><em>Coordonnée corrigée</em>' : ''}
      `;
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
    map.on('mouseleave', 'incident-circles', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    updateSummary(fc.features);
  });

  // Wire up the route filter buttons.
  document.querySelectorAll('.route-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.route-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const route = btn.dataset.route;
      if (map.isStyleLoaded()) {
        applyFilter(map, fc, route);
      } else {
        map.once('load', () => applyFilter(map, fc, route));
      }
    });
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById('map').innerHTML =
    `<p style="padding:1rem;color:#c75450">Erreur de chargement : ${err.message}</p>`;
});
