class ChoroplethMap {
  constructor(_config, _data, _dispatcher) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: _config.containerWidth || 800,
      containerHeight: _config.containerHeight || 600,
      margin: _config.margin || { top: 10, right: 10, bottom: 10, left: 10 },
      tooltipPadding: 10,
      legendBottom: 10,
      legendLeft: 10,
      legendRectHeight: 12,
      legendRectWidth: 150,
      colourDark: '#0e1031',
      colourLight: '#fdf6c1'
    };
    this.data = _data;
    this.dispatcher = _dispatcher;
    this.selectedFips = new Set();

    this.initVis();
  }

  initVis() {
    const vis = this;

    // Calculate inner chart size
    vis.config.width =
      vis.config.containerWidth -
      vis.config.margin.right -
      vis.config.margin.left;
    vis.config.height =
      vis.config.containerHeight -
      vis.config.margin.top -
      vis.config.margin.bottom;

    // Define SVG drawing area
    vis.svg = d3.select(vis.config.parentElement).insert('svg', '#buttons')
      .attr('width', vis.config.containerWidth)
      .attr('height', vis.config.containerHeight);

    // Append group element and translate
    vis.chart = vis.svg.append("g").attr(
      "transform",
      `translate(${vis.config.margin.top}, ${vis.config.margin.left})`
    );

    // Initialize projection and path generator
    vis.projection = d3.geoAlbersUsa()
    vis.geoPath = d3.geoPath().projection(vis.projection);

    vis.colourScale = d3.scaleSymlog()
      .range([vis.config.colourLight, vis.config.colourDark])
      .interpolate(d3.interpolateHcl);

    // Initialize linear gradient for legend
    vis.linearGradient = vis.svg.append('defs').append('linearGradient')
      .attr('id', 'legend-gradient');

    // Append legend
    vis.legend = vis.svg.append('g')
      .attr('class', 'legend')
      .attr(
        'transform',
        `translate(${vis.config.legendLeft}, ${vis.config.height - vis.config.legendBottom})`
      );

    vis.legendRect = vis.legend.append('rect')
      .attr('width', vis.config.legendRectWidth)
      .attr('height', vis.config.legendRectHeight);

    vis.legendTitle = vis.legend.append('text')
      .attr('class', 'legend-title')
      .attr('dy', '.35em')
      .attr('y', -10)
      .call(t => {
        t.append('tspan')
          .attr('font-weight', 'bold')
          .text('Legend');

        t.append('tspan')
          .attr('dx', 4)
          .text('- Outages per person')
      });

    // Append reset button
    vis.generateButtons();
    vis.updateVis();
  }

  updateVis() {
    const vis = this;

    // Value accessors
    vis.colourValue = d => d.properties.sum_outage_count / d.properties.pop_2023;

    // Update colour scale
    const outageExtent = d3.extent(vis.data.features, d => vis.colourValue(d))
    vis.colourScale.domain(outageExtent);

    // Define gradient stops
    const legendStops = d3.range(outageExtent[0], Math.sqrt(outageExtent[1]), Math.sqrt(outageExtent[1] / 5))
      .map(d => d ** 2);
    
    // Choose representative values
    vis.legendStops = legendStops.map(d => {
      return {
        colour: vis.colourScale(d),
        value: d,
        offset: d / outageExtent[1] * 100
      };
    });

    vis.renderVis();
  }

  renderVis() {
    const vis = this;

    // Define scale of projection
    vis.projection.fitSize([vis.config.width, vis.config.height], vis.data);

    // Append map
    const countyPath = vis.chart.selectAll('.county')
        .data(vis.data.features)
      .join('path')
        .attr('id', d => `fips-${d.properties.fips_code}`)
        .attr('class', 'county')
        .classed('county-selected', d => d.properties.selected)
        .attr('d', vis.geoPath)
        .attr('fill', d => vis.colourScale(vis.colourValue(d)));

    countyPath
      .on('mousemove', (event, d) => {
        const outages = `<strong>${d.properties.sum_outage_count}</strong> outages`;
        const population = `<strong>${d.properties.pop_2023}</strong> people`;
        
        d3.select('#tooltip')
          .style('display', 'block')
          .style('left', `${event.pageX + vis.config.tooltipPadding}px`)
          .style('top', `${event.pageY + vis.config.tooltipPadding}px`)
          .html(`
            <div class="tooltip-title"><strong>${d.properties.county} County</strong>, ${d.properties.state_abbr}</div>
            <div>${outages}</div>
            <div>${population}</div>`)
      })
      .on('mouseleave', () => {
        d3.select('#tooltip').style('display', 'none');
      })
      .on('click', function(event, d) {
        d.properties.selected = !d.properties.selected;
        if (d.properties.selected) {
          vis.selectedFips.add(d.properties.fips_code);
        } else {
          vis.selectedFips.delete(d.properties.fips_code);
        }
        
        vis.dispatcher.call('selectCounty', event, vis.selectedFips);
      });

    // Add legend labels
    vis.legend.selectAll('.legend-label')
        .data(vis.colourScale.domain())
      .join('text')
        .attr('class', 'legend-label')
        .attr('text-anchor', 'middle')
        .attr('dy', '.35em')
        .attr('y', 20)
        .attr('x', (d, i) => {
          return i == 0 ? 0 : vis.config.legendRectWidth;
        })
        .text(d => Math.round(d));

    // Update gradient legend
    vis.linearGradient.selectAll('stop')
        .data(vis.legendStops)
      .join('stop')
        .attr('offset', d => `${d.offset}%`)
        .attr('stop-color', d => d.colour);

    vis.legendRect.attr('fill', 'url(#legend-gradient)');
  }

  generateButtons() {
    const vis = this;

    const buttons = d3.select('#buttons');

    buttons.append('button')
      .attr('class', 'button reset-button')
      .text('Reset Counties')
      .on('click', (event, d) => {
        vis.selectedFips = new Set();
        vis.data.features.forEach(d => d.properties.selected = false);

        vis.dispatcher.call('selectCounty', event, vis.selectedFips);
      })

    const statesMap = new Map();
    vis.data.features.forEach(d => {
      const { state, state_abbr } = d.properties;
      if (!statesMap.has(state)) statesMap.set(state, state_abbr);
    });

    const states = Array.from(statesMap, ([state_name, state_abbr]) => ({ state_name, state_abbr }));
    states.sort((a, b) => a.state_name.localeCompare(b.state_name));
    states.forEach(s => {
      s.selected = false;
    })
    
    buttons.selectAll('.state-button')
        .data(states, d => d.state_abbr)
      .join('button')
        .attr('class', d => `button state-button ${d.state_abbr}-button`)
        .text(d => `${d.state_name} (${d.state_abbr})`)
        .on('click', (event, d) => {
          d.selected = !d.selected;

          vis.data.features.forEach(f => {
            if (f.properties.state_abbr === d.state_abbr) {
              f.properties.selected = d.selected;

              if (d.selected && !vis.selectedFips.has(f.properties.fips_code)) {
                vis.selectedFips.add(f.properties.fips_code);
              } else if (!d.selected && vis.selectedFips.has(f.properties.fips_code)) {
                vis.selectedFips.delete(f.properties.fips_code);
              }
            }
          });

          vis.dispatcher.call('selectCounty', event, vis.selectedFips);
        });
  }
}