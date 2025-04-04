class BarChart {
  constructor(_config, _data, _dispatcher) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: _config.containerWidth || 1250,
      containerHeight: _config.containerHeight || 140,
      margin: _config.margin || { top: 10, right: 5, bottom: 50, left: 5 }
    };
    this.data = _data;
    this.dispatcher = _dispatcher;
    this.selectedFips = new Set();

    this.initVis();
  }

  initVis() {
    let vis = this;

    vis.width = vis.config.containerWidth - vis.config.margin.left - vis.config.margin.right;
    vis.height = vis.config.containerHeight - vis.config.margin.top - vis.config.margin.bottom;

    vis.svg = d3.select(vis.config.parentElement)
      .append('svg')
      .attr('width', vis.config.containerWidth)
      .attr('height', vis.config.containerHeight);

    vis.chart = vis.svg.append('g')
      .attr('transform', `translate(${vis.config.margin.left}, ${vis.config.margin.top})`);

    // border box around the chart
    vis.chart.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', vis.width)
      .attr('height', vis.height)
      .attr('fill', 'none')
      .attr('stroke', 'black');

    vis.xScale = d3.scaleBand()
      .range([0, vis.width])
      .paddingInner(0.5)
      .paddingOuter(0.2);

    vis.yScale = d3.scaleLinear()
      .range([vis.height, 10])
      // .domain([0, vis.getMax()]);


    vis.xAxisGroup = vis.chart.append('g')
      .attr('transform', `translate(0, ${vis.height})`);

    vis.yAxisGroup = vis.chart.append('g');

    // Tooltip setup
    vis.tooltip = d3.select("body").append("div")
      .style("position", "absolute")
      .style("background", "white")
      .style("border", "1px solid black")
      .style("padding", "5px")
      .style("font-size", "12px")
      .style("display", "none");
  }

  updateVis() {
    let vis = this;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    let fData = vis.data.filter(d => vis.selectedFips.has(d.fips_code));
    if (fData.length === 0) fData = vis.data;

    const nestedData = d3.groups(fData, d => d.year).map(([year, arr]) => {
      const byMonth = d3.rollup(arr, v => d3.sum(v, d => d.outage_count), d => d.month);

      const monthsArray = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: monthNames[i],
        total: byMonth.get(i + 1) || 0,
        year
      }));

      return { year, months: monthsArray };
    });

    const allMonths = nestedData.flatMap(d => d.months);

    vis.xScale.domain(allMonths.map(d => `${d.year}-${d.month}`));

    const maxOutage = d3.max(allMonths, d => d.total);
    vis.yScale.domain([0, maxOutage]);

    vis.nestedData = nestedData;
    vis.renderVis();
  }

  renderVis() {
    let vis = this;

    const bars = vis.chart.selectAll('.bar')
      .data(vis.nestedData.flatMap(d => d.months), d => `${d.year}-${d.month}`)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => vis.xScale(`${d.year}-${d.month}`))
      .attr('width', vis.xScale.bandwidth())
      .attr('fill', 'steelblue')
      .on("mouseover", function (event, d) {
        vis.tooltip
          .style("display", "block")
          .html(`<strong>${d.monthName} ${d.year}</strong>: ${d.total} outages`);
      })
      .on("mousemove", function (event) {
        vis.tooltip
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 20}px`);
      })
      .on("mouseleave", function () {
        vis.tooltip.style("display", "none");
      });

    bars.transition().duration(200)
      .attr('y', d => vis.yScale(d.total))
      .attr('height', d => vis.height - vis.yScale(d.total));

    // Year Labels
    vis.xAxisGroup.selectAll('.year-label')
      .data(vis.nestedData)
      .join('text')
      .attr('class', 'year-label')
      .attr('x', d => {
        const months = d.months.map(m => `${m.year}-${m.month}`);
        const firstMonth = vis.xScale(months[0]);
        const lastMonth = vis.xScale(months[months.length - 1]);
        return (firstMonth + lastMonth) / 2;
      })
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .text(d => d.year)
      .attr('fill', 'black')
      .attr('font-size', '16px');

    // Month Labels
    vis.xAxisGroup.selectAll('.month-label')
      .data(vis.nestedData.flatMap(d => d.months.filter(m => m.month % 3 === 1)))
      .join('text')
      .attr('class', 'month-label')
      .attr('x', d => vis.xScale(`${d.year}-${d.month}`) + vis.xScale.bandwidth() / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .text(d => d.monthName)
      .attr('fill', 'black')
      .attr('font-size', '10px');

    vis.yAxisGroup.selectAll('.tick text').remove();
  }

  // Helpers
  getMax() {
    const nestedData = d3.groups(this.data, d => d.year).map(([year, arr]) => {
      const byMonth = d3.rollup(arr, v => d3.sum(v, d => d.outage_count), d => d.month);
      return Array.from({ length: 12 }, (_, i) => byMonth.get(i + 1) || 0);
    });

    const allMonths = nestedData.flat();
    return d3.max(allMonths);
}
}
