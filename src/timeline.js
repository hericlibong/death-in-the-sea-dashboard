/**
 * Timeline component — D3 bar chart of victims per year.
 *
 * One bar per year (2014..2026). Height = sum of victims for that year
 * across the currently visible features (so the bars react to the route
 * filter). Clicking a bar toggles a year filter on the parent state.
 * 2026 is rendered as a partial-year bar (visually distinct).
 *
 * Public API:
 *   createTimeline(container, { onYearClick }) -> { update(features, activeYear) }
 *
 * Sober palette aligned with the rest of the dashboard.
 */

import * as d3 from 'd3';

const PARTIAL_YEAR = 2026;

// Bar color per route filter. "all" uses a neutral muted grey so the bars
// don't carry a route-specific meaning when no route is selected — the
// blue is reserved for Central, green for Western, sandy for Eastern,
// each matching the map circles. 2026 (partial year) keeps the accent
// red so it is visually distinct regardless of the route filter.
const BAR_COLOR_BY_ROUTE = {
  all: '#8a8f98',          // muted grey — neutral aggregate
  Central: '#5b8dbe',
  Western: '#7fb069',
  Eastern: '#d4a373',
};

const COLORS = {
  barPartial: '#c75450',   // accent for partial year (2026)
  barInactive: '#3a3f47',  // dimmed when another year is selected
  axis: '#8a8f98',
  text: '#e6e6e6',
};

export function createTimeline(container, { onYearClick }) {
  const root = d3.select(container);
  root.selectAll('*').remove();

  const margin = { top: 8, right: 12, bottom: 28, left: 56 };
  let width = container.clientWidth - margin.left - margin.right;
  const height = 160 - margin.top - margin.bottom;

  const svg = root
    .append('svg')
    .attr('width', container.clientWidth)
    .attr('height', height + margin.top + margin.bottom)
    .attr('role', 'img');

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

  let currentActiveYear = null;
  let currentRoute = 'all';

  function render(features, activeYear, route = 'all') {
    currentActiveYear = activeYear ?? null;
    currentRoute = route ?? 'all';
    const barColor = BAR_COLOR_BY_ROUTE[currentRoute] || BAR_COLOR_BY_ROUTE.all;

    // Aggregate victims and incidents by year on the currently visible
    // features (so the route filter is reflected).
    const byYear = d3.rollups(
      features,
      (v) => ({
        victims: d3.sum(v, (d) => d.properties.victims || 0),
        incidents: v.length,
      }),
      (d) => d.properties.year,
    );
    // Build a stable year axis spanning the full project range, even if
    // the current filter leaves some years empty.
    const yearExtent = d3.extent(features, (d) => d.properties.year);
    const minYear = yearExtent[0] ?? 2014;
    const maxYear = yearExtent[1] ?? PARTIAL_YEAR;
    const allYears = d3.range(minYear, maxYear + 1);
    const dataMap = new Map(byYear);
    const rows = allYears.map((y) => ({
      year: y,
      ...(dataMap.get(y) || { victims: 0, incidents: 0 }),
    }));

    width = container.clientWidth - margin.left - margin.right;
    svg.attr('width', container.clientWidth);

    const x = d3
      .scaleBand()
      .domain(rows.map((d) => d.year))
      .range([0, width])
      .padding(0.18);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(rows, (d) => d.victims) || 1])
      .nice()
      .range([height, 0]);

    xAxisG
      .call(d3.axisBottom(x).tickSizeOuter(0).tickFormat((d) => `${d}`))
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

    // Bars
    const bars = g.selectAll('rect.bar').data(rows, (d) => d.year);

    bars
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.year))
      .attr('width', x.bandwidth())
      .attr('y', height)
      .attr('height', 0)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 0.85);
        tooltip
          .html(
            `<strong>${d.year}${d.year === PARTIAL_YEAR ? ' (partielle)' : ''}</strong>`
            + `<br/>${d.victims.toLocaleString('fr-FR')} victimes`
            + `<br/>${d.incidents.toLocaleString('fr-FR')} incidents`,
          )
          .style('opacity', 1)
          .style('left', `${event.offsetX + 12}px`)
          .style('top', `${event.offsetY + 12}px`);
      })
      .on('mousemove', function (event) {
        tooltip
          .style('left', `${event.offsetX + 12}px`)
          .style('top', `${event.offsetY + 12}px`);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 1);
        tooltip.style('opacity', 0);
      })
      .on('click', (event, d) => {
        if (typeof onYearClick === 'function') {
          // Toggle: clicking the active year clears it.
          onYearClick(currentActiveYear === d.year ? null : d.year);
        }
      })
      .merge(bars)
      .transition()
      .duration(250)
      .attr('x', (d) => x(d.year))
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.victims))
      .attr('height', (d) => height - y(d.victims))
      .attr('fill', (d) => {
        if (currentActiveYear != null && d.year !== currentActiveYear) {
          return COLORS.barInactive;
        }
        return d.year === PARTIAL_YEAR ? COLORS.barPartial : barColor;
      });

    bars.exit().remove();
  }

  return { update: render };
}
