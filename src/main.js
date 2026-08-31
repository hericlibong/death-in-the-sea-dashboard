import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { createTimeline, MONTH_FULL } from './timeline.js';
import {
  localizeCountry,
  localizeOrigin,
  formatDate,
  sourceQualityLabel,
} from './labels.js';

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

// Single source of truth for the filter state, composed of route + year +
// month. applyFilters() recomputes the visible set on every change and
// propagates it to both the map source and the timeline.
// `month` is 0-11 and only meaningful once a year is selected.
const state = {
  route: 'all',
  year: null,
  month: null,
};

let fc = null;     // full feature collection (loaded once)
let map = null;
let timeline = null;
// Latest incident date present in the snapshot, as { year, month }. Anything
// after it is absent from the data, not absent from reality — the timeline
// needs this to tell "no victims" apart from "not covered".
let lastCovered = null;

function monthOf(feature) {
  const d = feature.properties.date;
  return d ? Number(d.slice(5, 7)) - 1 : null;
}

async function loadIncidents() {
  const res = await fetch('./data/incidents.geojson');
  if (!res.ok) throw new Error(`Failed to load incidents.geojson: ${res.status}`);
  return res.json();
}

function visibleFeatures() {
  return fc.features.filter((f) => {
    if (state.route !== 'all' && f.properties.route !== state.route) return false;
    if (state.year !== null && f.properties.year !== state.year) return false;
    if (state.month !== null && monthOf(f) !== state.month) return false;
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

function escapeHTML(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function buildTooltipHTML(p) {
  const date = formatDate(p.date) || 'Date inconnue';
  const country = localizeCountry(p.country);
  const routeLabel = p.route || 'route inconnue';
  const location = p.location_unspecified
    ? null
    : (p.location ? escapeHTML(p.location) : null);

  // Victim breakdown: split dead vs missing only when missing > 0.
  const dead = Number(p.dead) || 0;
  const missing = Number(p.missing) || 0;
  const total = dead + missing;
  let victimsLine;
  if (total <= 1) {
    victimsLine = `<strong>${total} victime</strong>`;
  } else if (missing > 0 && dead > 0) {
    victimsLine = `<strong>${total} victimes</strong> <span class="tt-detail">(${dead} morts, ${missing} disparus)</span>`;
  } else {
    victimsLine = `<strong>${total} victimes</strong>`;
  }

  const causeText = p.cause ? ` — ${escapeHTML(p.cause)}` : '';

  // We deliberately do NOT surface the origin field in the tooltip.
  // The IOM data on origin is too often presumed, mixed, or unknown,
  // and labelling it "Origine: <country>" in the singular would suggest
  // a precision (a single nationality for all victims) that the dataset
  // does not support. The data stays in the GeoJSON for future use
  // (anchors A8 / A11 may need it later in a more careful framing).

  // Quality + warnings (footer).
  const quality = sourceQualityLabel(p.source_quality);
  const warnings = [];
  if (p.location_unspecified) warnings.push('Localisation imprécise');
  if (p.coord_corrected) warnings.push('Coordonnée corrigée éditorialement');
  const footerParts = [];
  if (quality) footerParts.push(`<span>Source IOM — ${quality}</span>`);
  for (const w of warnings) {
    footerParts.push(`<span class="tt-warn">⚠ ${w}</span>`);
  }
  const footer = footerParts.length
    ? `<div class="tt-footer">${footerParts.join('')}</div>`
    : '';

  const routeChip = `<span class="tt-route" data-route="${escapeHTML(routeLabel)}">${escapeHTML(routeLabel)}</span>`;
  const countryFragment = country ? ` · ${escapeHTML(country)}` : '';
  const locationFragment = location ? `<div class="tt-location">${location}</div>` : '';

  return `
    <div class="tt-inner">
      <div class="tt-header">
        <div class="tt-date">${date}</div>
        <div class="tt-route-line">${routeChip}${countryFragment}</div>
      </div>
      ${locationFragment}
      <div class="tt-body">
        <div class="tt-row">${victimsLine}${causeText}</div>
      </div>
      ${footer}
    </div>
  `;
}

// The "partial" marker is derived from the data, never hardcoded: it is
// whichever year/month holds the latest recorded incident.
function updateScopeLabel() {
  const el = document.getElementById('scope-label');
  if (!el) return;
  if (state.year === null) {
    el.textContent = lastCovered
      ? `Total 2014–${lastCovered.year}`
      : 'Total';
  } else if (state.month !== null) {
    const partial = lastCovered
      && state.year === lastCovered.year
      && state.month === lastCovered.month;
    el.textContent =
      `${MONTH_FULL[state.month]} ${state.year}${partial ? ' (partiel)' : ''}`;
  } else {
    const partial = lastCovered && state.year === lastCovered.year;
    el.textContent = `Année ${state.year}${partial ? ' (partielle)' : ''}`;
  }
}

// Panel title, hint and back button all reflect the current drill level.
function updateTimelineChrome() {
  const title = document.getElementById('timeline-title');
  const hint = document.getElementById('timeline-hint');
  const clearBtn = document.getElementById('timeline-clear');

  if (title) {
    title.textContent = state.year === null
      ? 'Victimes par année'
      : `Victimes par mois — ${state.year}`;
  }
  if (hint) {
    hint.textContent = state.year === null
      ? 'Cliquez sur une année pour voir ses mois.'
      : 'Cliquez sur un mois pour filtrer la carte.';
  }
  if (clearBtn) {
    clearBtn.textContent = state.year === null ? 'Toutes années' : '← Toutes les années';
    clearBtn.disabled = state.year === null;
  }
}

function refreshTimeline() {
  if (!timeline) return;
  timeline.update(routeFilteredFeatures(), {
    year: state.year,
    month: state.month,
    route: state.route,
  });
}

function applyFilters() {
  const visible = visibleFeatures();
  if (map && map.getSource('incidents')) {
    map.getSource('incidents').setData({
      type: 'FeatureCollection',
      features: visible,
    });
  }
  refreshTimeline();
  updateSummary(visible);
  updateScopeLabel();
  updateTimelineChrome();
}

async function main() {
  fc = await loadIncidents();
  document.body.dataset.route = state.route;  // initial 'all'

  // Latest incident date in the snapshot — drives every "partial" and
  // "not covered" marker downstream. ISO dates compare correctly as strings.
  const maxDate = fc.features.reduce(
    (acc, f) => (f.properties.date && f.properties.date > acc ? f.properties.date : acc),
    '',
  );
  if (maxDate) {
    lastCovered = { year: Number(maxDate.slice(0, 4)), month: Number(maxDate.slice(5, 7)) - 1 };
  }

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
      popup.setLngLat(e.lngLat).setHTML(buildTooltipHTML(e.features[0].properties)).addTo(map);
    });
    map.on('mouseleave', 'incident-circles', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    // First render of summary + timeline once the map source exists.
    applyFilters();
  });

  // Build the timeline. The bars reflect the route filter. Clicking a year
  // drills into its twelve months without narrowing the map — only a click
  // on a month restricts the map further.
  timeline = createTimeline(document.getElementById('timeline'), {
    onYearClick: (year) => {
      state.year = year;
      state.month = null;
      applyFilters();
    },
    onMonthClick: (month) => {
      state.month = month;
      applyFilters();
    },
    maxDate,
  });
  // Initial render before map.on('load') fires so the timeline doesn't
  // flash empty.
  refreshTimeline();
  updateTimelineChrome();

  // Back to the year level (also clears the month).
  const clearBtn = document.getElementById('timeline-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.year = null;
      state.month = null;
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
        refreshTimeline();
      }, 280);
    });
  }

  // Keep the timeline width responsive on window resize.
  window.addEventListener('resize', () => {
    refreshTimeline();
    if (map) map.resize();
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById('map').innerHTML =
    `<p style="padding:1rem;color:#c75450">Erreur de chargement : ${err.message}</p>`;
});
