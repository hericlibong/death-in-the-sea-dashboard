/**
 * Timeline component — D3 bar chart of victims, at two levels.
 *
 * Year level (no year selected): one bar per year (2014..last covered).
 * Month level (a year selected): twelve bars for that year's months.
 * Clicking a year drills into it; clicking a month toggles a month filter.
 *
 * Months that fall after the snapshot's last recorded incident are NOT
 * "zero victims" — they are simply not covered by the data. Drawing them
 * as empty bars would show a drop to zero that is an artefact of the
 * extraction date, so they are drawn as a hatched full-height band with
 * no value instead.
 *
 * The partial year and partial month are derived from the data itself
 * (the latest incident date), never hardcoded — a newer snapshot moves
 * them automatically.
 *
 * Public API:
 *   createTimeline(container, { onYearClick, onMonthClick, maxDate })
 *     -> { update(features, { year, month, route }) }
 *
 * Sober palette aligned with the rest of the dashboard.
 */

import * as d3 from 'd3';

const MONTH_SHORT = [
  'janv', 'févr', 'mars', 'avr', 'mai', 'juin',
  'juil', 'août', 'sept', 'oct', 'nov', 'déc',
];

export const MONTH_FULL = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// Bar color per route filter. "all" uses a neutral muted grey so the bars
// don't carry a route-specific meaning when no route is selected — the
// blue is reserved for Central, green for Western, sandy for Eastern,
// each matching the map circles. The partial period keeps the accent
// red so it is visually distinct regardless of the route filter.
const BAR_COLOR_BY_ROUTE = {
  all: '#8a8f98',          // muted grey — neutral aggregate
  Central: '#5b8dbe',
  Western: '#7fb069',
  Eastern: '#d4a373',
};

const COLORS = {
  barPartial: '#c75450',   // accent for the partial year / month
  barInactive: '#3a3f47',  // dimmed when another bar is selected
  axis: '#8a8f98',
  text: '#e6e6e6',
  uncovered: '#454a52',    // hatch stroke for months with no data at all
};

const HATCH_ID = 'timeline-uncovered-hatch';

function parseLastCovered(maxDate) {
  if (typeof maxDate !== 'string' || maxDate.length < 10) return null;
  const [year, month, day] = maxDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month: month - 1, day };
}

function formatDay(lastCovered) {
  if (!lastCovered) return '';
  return `${lastCovered.day} ${MONTH_FULL[lastCovered.month].toLowerCase()} ${lastCovered.year}`;
}

export function createTimeline(container, { onYearClick, onMonthClick, maxDate } = {}) {
  const root = d3.select(container);
  root.selectAll('*').remove();

  const lastCovered = parseLastCovered(maxDate);
  const lastCoveredLabel = formatDay(lastCovered);

  const margin = { top: 8, right: 12, bottom: 28, left: 56 };
  const MIN_CHART_H = 96;

  // The chart follows the drawer's real height rather than a fixed 160px:
  // #timeline-panel clips with overflow:hidden, so an SVG taller than its
  // container loses the bottom of the axis.
  function chartHeight() {
    return Math.max(MIN_CHART_H, container.clientHeight || 160)
      - margin.top - margin.bottom;
  }

  let width = container.clientWidth - margin.left - margin.right;
  let height = chartHeight();

  const svg = root
    .append('svg')
    .attr('width', container.clientWidth)
    .attr('height', height + margin.top + margin.bottom)
    .attr('role', 'img');

  // Diagonal hatch used for months the snapshot does not cover.
  const pattern = svg
    .append('defs')
    .append('pattern')
    .attr('id', HATCH_ID)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6)
    .attr('height', 6)
    .attr('patternTransform', 'rotate(45)');
  pattern
    .append('line')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', 6)
    .attr('stroke', COLORS.uncovered)
    .attr('stroke-width', 2);

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const xAxisG = g
    .append('g')
    .attr('class', 'axis axis-x')
    .attr('transform', `translate(0,${height})`);

  const yAxisG = g.append('g').attr('class', 'axis axis-y');

  // Tooltip (simple DOM element absolutely positioned over the chart).
  const tooltip = root
    .append('div')
    .attr('class', 'timeline-tooltip')
    .style('opacity', 0);

  let currentMode = 'year';
  let currentYear = null;
  let currentMonth = null;

  // Scales of the latest render, so the hover handlers (attached once, on
  // enter) always anchor against the current geometry rather than the one
  // that happened to exist when the bar was created.
  let xScale = null;
  let yScale = null;

  const TIP_MARGIN = 6;
  const TIP_GAP = 8;

  // The tooltip is anchored to the BAR, not to the cursor: just above the
  // bar's top when there is room, just below it otherwise, then clamped on
  // all four sides. A short bar has plenty of empty space above it, which
  // is where its tooltip goes — instead of off the bottom edge, where the
  // panel's overflow:hidden would cut it.
  function showTooltip(html, bandX, bandW, barTopY) {
    tooltip.html(html).style('opacity', 1);
    const { offsetWidth: w, offsetHeight: h } = tooltip.node();
    const cw = container.clientWidth;
    const ch = container.clientHeight || height + margin.top + margin.bottom;

    const centre = margin.left + bandX + bandW / 2;
    const left = Math.min(
      Math.max(TIP_MARGIN, centre - w / 2),
      Math.max(TIP_MARGIN, cw - w - TIP_MARGIN),
    );

    const anchor = margin.top + barTopY;
    let top = anchor - h - TIP_GAP;
    if (top < TIP_MARGIN) top = anchor + TIP_GAP;
    top = Math.min(
      Math.max(TIP_MARGIN, top),
      Math.max(TIP_MARGIN, ch - h - TIP_MARGIN),
    );

    tooltip.style('left', `${left}px`).style('top', `${top}px`);
  }

  function buildYearRows(features) {
    const byYear = d3.rollups(
      features,
      (v) => ({
        victims: d3.sum(v, (d) => d.properties.victims || 0),
        incidents: v.length,
      }),
      (d) => d.properties.year,
    );
    const extent = d3.extent(features, (d) => d.properties.year);
    const minYear = extent[0] ?? 2014;
    const maxYear = extent[1] ?? (lastCovered ? lastCovered.year : 2014);
    const dataMap = new Map(byYear);

    return d3.range(minYear, maxYear + 1).map((y) => ({
      key: y,
      label: `${y}`,
      full: `${y}`,
      uncovered: false,
      partial: lastCovered != null && y === lastCovered.year,
      ...(dataMap.get(y) || { victims: 0, incidents: 0 }),
    }));
  }

  function buildMonthRows(features, year) {
    const inYear = features.filter((d) => d.properties.year === year);
    const byMonth = d3.rollups(
      inYear,
      (v) => ({
        victims: d3.sum(v, (d) => d.properties.victims || 0),
        incidents: v.length,
      }),
      (d) => Number(d.properties.date.slice(5, 7)) - 1,
    );
    const dataMap = new Map(byMonth);
    const isLastCoveredYear = lastCovered != null && year === lastCovered.year;

    return d3.range(0, 12).map((m) => ({
      key: m,
      label: MONTH_SHORT[m],
      full: `${MONTH_FULL[m]} ${year}`,
      uncovered: isLastCoveredYear && m > lastCovered.month,
      partial: isLastCoveredYear && m === lastCovered.month,
      ...(dataMap.get(m) || { victims: 0, incidents: 0 }),
    }));
  }

  function render(features, { year = null, month = null, route = 'all' } = {}) {
    currentMode = year == null ? 'year' : 'month';
    currentYear = year ?? null;
    currentMonth = month ?? null;
    const barColor = BAR_COLOR_BY_ROUTE[route] || BAR_COLOR_BY_ROUTE.all;

    const rows = currentMode === 'year'
      ? buildYearRows(features)
      : buildMonthRows(features, currentYear);

    const active = currentMode === 'year' ? null : currentMonth;

    width = container.clientWidth - margin.left - margin.right;
    height = chartHeight();
    svg
      .attr('width', container.clientWidth)
      .attr('height', height + margin.top + margin.bottom);
    xAxisG.attr('transform', `translate(0,${height})`);
    svg.attr(
      'aria-label',
      currentMode === 'year'
        ? 'Victimes par année, de 2014 à aujourd’hui. Cliquez sur une année pour voir ses mois.'
        : `Victimes par mois pour l’année ${currentYear}.`,
    );

    const x = d3
      .scaleBand()
      .domain(rows.map((d) => d.key))
      .range([0, width])
      .padding(0.18);

    // Only covered periods set the scale — an uncovered month has no value
    // and must not flatten the axis.
    const maxVictims = d3.max(rows.filter((d) => !d.uncovered), (d) => d.victims);
    const y = d3
      .scaleLinear()
      .domain([0, maxVictims || 1])
      .nice()
      .range([height, 0]);

    xScale = x;
    yScale = y;

    xAxisG
      .call(d3.axisBottom(x).tickSizeOuter(0).tickFormat((d, i) => rows[i].label))
      .selectAll('text')
      .attr('fill', COLORS.axis)
      .attr('font-size', 10);
    xAxisG.selectAll('line, path').attr('stroke', COLORS.axis);

    yAxisG
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickFormat((d) => d.toLocaleString('fr-FR')),
      )
      .selectAll('text')
      .attr('fill', COLORS.axis)
      .attr('font-size', 10);
    yAxisG.selectAll('line, path').attr('stroke', COLORS.axis);

    // Hatched bands for months the snapshot does not cover. Drawn first so
    // they sit behind everything else.
    const bands = g
      .selectAll('rect.uncovered-band')
      .data(rows.filter((d) => d.uncovered), (d) => `${currentMode}:${d.key}`);

    bands
      .enter()
      .append('rect')
      .attr('class', 'uncovered-band')
      .attr('y', 0)
      .attr('height', height)
      .attr('fill', `url(#${HATCH_ID})`)
      .attr('opacity', 0.5)
      .on('mouseenter', (event, d) => {
        showTooltip(
          `<strong>${d.full}</strong><br/>Données non disponibles`
          + `<br/><span class="tt-detail">L’instantané s’arrête au ${lastCoveredLabel}.</span>`,
          xScale(d.key),
          xScale.bandwidth(),
          0,
        );
      })
      .on('mouseleave', () => tooltip.style('opacity', 0))
      .merge(bands)
      .attr('x', (d) => x(d.key))
      .attr('width', x.bandwidth())
      .attr('height', height);

    bands.exit().remove();

    // Value bars. Uncovered periods are excluded entirely — no bar at all.
    const bars = g
      .selectAll('rect.bar')
      .data(rows.filter((d) => !d.uncovered), (d) => `${currentMode}:${d.key}`);

    bars
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.key))
      .attr('width', x.bandwidth())
      .attr('y', height)
      .attr('height', 0)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 0.85);
        const partialNote = d.partial
          ? `<br/><span class="tt-detail">Période partielle — jusqu’au ${lastCoveredLabel}.</span>`
          : '';
        showTooltip(
          `<strong>${d.full}</strong>`
          + `<br/>${d.victims.toLocaleString('fr-FR')} victimes`
          + `<br/>${d.incidents.toLocaleString('fr-FR')} incidents`
          + partialNote,
          xScale(d.key),
          xScale.bandwidth(),
          yScale(d.victims),
        );
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 1);
        tooltip.style('opacity', 0);
      })
      .on('click', (event, d) => {
        if (currentMode === 'year') {
          if (typeof onYearClick === 'function') onYearClick(d.key);
        } else if (typeof onMonthClick === 'function') {
          // Toggle: clicking the active month clears it and shows the
          // whole year again.
          onMonthClick(currentMonth === d.key ? null : d.key);
        }
      })
      .merge(bars)
      .transition()
      .duration(250)
      .attr('x', (d) => x(d.key))
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.victims))
      .attr('height', (d) => height - y(d.victims))
      .attr('fill', (d) => {
        if (active != null && d.key !== active) return COLORS.barInactive;
        return d.partial ? COLORS.barPartial : barColor;
      });

    bars.exit().remove();
  }

  return { update: render };
}
