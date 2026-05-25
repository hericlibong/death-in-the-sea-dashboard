import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { createTimeline } from './timeline.js';

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

// Single source of truth for the filter state, composed of route + year.
// applyFilters() recomputes the visible set on every change and propagates
// it to both the map source and the timeline.
const state = {
  route: 'all',
  year: null,
};

let fc = null;     // full feature collection (loaded once)
let map = null;
let timeline = null;

async function loadIncidents() {
  const res = await fetch('./data/incidents.geojson');
  if (!res.ok) throw new Error(`Failed to load incidents.geojson: ${res.status}`);
  return res.json();
}

function visibleFeatures() {
  return fc.features.filter((f) => {
    if (state.route !== 'all' && f.properties.route !== state.route) return false;
    if (state.year !== null && f.properties.year !== state.year) return false;
    return true;
  });
}

// Features visible under the ROUTE filter only — used to feed the timeline
// so its bars reflect the current route but stay readable when a year is
// also selected.
function routeFilteredFeatures() {
  if (state.route === 'all') return fc.features;
  return fc.features.filter((f) => f.properties.route === state.route);
}

function updateSummary(features) {
  const n = features.length;
  const v = features.reduce((acc, f) => acc + (f.properties.victims || 0), 0);
  document.getElementById('incident-count').textContent =
    `${n.toLocaleString('fr-FR')} incidents`;
  document.getElementById('victim-count').textContent =
    `${v.toLocaleString('fr-FR')} victimes`;
}

function applyFilters() {
  const visible = visibleFeatures();
  if (map && map.getSource('incidents')) {
    map.getSource('incidents').setData({
      type: 'FeatureCollection',
      features: visible,
    });
  }
  if (timeline) {
    timeline.update(routeFilteredFeatures(), state.year, state.route);
  }
  updateSummary(visible);

  // Reflect the year-clear button visibility/state.
  const clearBtn = document.getElementById('timeline-clear');
  if (clearBtn) clearBtn.disabled = state.year === null;
}

async function main() {
  fc = await loadIncidents();
  document.body.dataset.route = state.route;  // initial 'all'

  map = new mapboxgl.Map({
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

    // First render of summary + timeline once the map source exists.
    applyFilters();
  });

  // Build the timeline. The bars reflect the route filter; clicking a bar
  // sets state.year and re-applies all filters (so the map narrows down).
  timeline = createTimeline(document.getElementById('timeline'), {
    onYearClick: (year) => {
      state.year = year;
      applyFilters();
    },
  });
  // Initial render before map.on('load') fires so the timeline doesn't
  // flash empty.
  timeline.update(routeFilteredFeatures(), state.year, state.route);

  // Year clear button.
  const clearBtn = document.getElementById('timeline-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.year = null;
      applyFilters();
    });
  }

  // Route filter buttons. Also mirror the active route onto a data
  // attribute on <body> so CSS can theme other components (counters,
  // future widgets) to match the selected route's color.
  document.querySelectorAll('.route-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.route-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.route = btn.dataset.route;
      document.body.dataset.route = state.route;
      applyFilters();
    });
  });

  // Timeline drawer toggle. When the drawer opens or closes the map
  // container changes size — Mapbox needs an explicit resize() after the
  // CSS transition completes, otherwise the tiles render at the old size.
  const toggleBtn = document.getElementById('timeline-toggle');
  const panel = document.getElementById('timeline-panel');
  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      const isCollapsed = panel.classList.toggle('collapsed');
      const opened = !isCollapsed;
      toggleBtn.setAttribute('aria-expanded', String(opened));
      toggleBtn.querySelector('.toggle-label').textContent =
        opened ? 'Masquer la frise' : 'Voir la frise temporelle';
      // Wait for the CSS transition (250ms) before telling the map and
      // timeline to recompute their layout.
      setTimeout(() => {
        if (map) map.resize();
        if (timeline) timeline.update(routeFilteredFeatures(), state.year, state.route);
      }, 280);
    });
  }

  // Keep the timeline width responsive on window resize.
  window.addEventListener('resize', () => {
    if (timeline) timeline.update(routeFilteredFeatures(), state.year, state.route);
    if (map) map.resize();
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById('map').innerHTML =
    `<p style="padding:1rem;color:#c75450">Erreur de chargement : ${err.message}</p>`;
});
