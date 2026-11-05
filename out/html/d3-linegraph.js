/*
 * d3.linegraph - multi-series line graph over a numeric time axis.
 *
 * Usage:
 *   var lines = d3.linegraph({keys: ['rc', 'pal'], colors: {...}, names: {...},
 *                             tickFormat: function (t) { return ... }, noTicks: true, noDots: true});
 *   lines.width(500).height(320);
 *   d3.select('#svg').datum(records).call(lines);
 *
 * Each record is {t: <number>, <key>: <value>, ...}. Keys that are missing from
 * a record are treated as gaps (series can appear or disappear part-way).
 */
d3.linegraph = function (opts) {
    opts = opts || {};
    var keys = opts.keys || [];
    var colors = opts.colors || {};
    var names = opts.names || {};
    var tickFormat = opts.tickFormat || function (t) { return t; };
    var noTicks = !!opts.noTicks;
    var noDots = !!opts.noDots;

    var width = 500;
    var height = 400;
    var marginTop = 20;
    var marginRight = 40;
    var marginBottom = 50;
    var marginLeft = 40;

    function defined(v) { return v !== undefined && v !== null && !isNaN(v); }

    function linegraph(selection) {
        selection.each(function (data) {
            var svg = d3.select(this);
            svg.selectAll('*').remove();
            if (!data || !data.length) return;

            var xs = data.map(function (d) { return d.t; });
            var xMin = d3.min(xs), xMax = d3.max(xs);
            if (xMax === xMin) xMax = xMin + 1;
            var xScale = d3.scaleLinear([xMin, xMax + (xMax - xMin) * 0.08], [marginLeft, width - marginRight]);

            var yMax = opts.dataMax;
            if (!defined(yMax)) {
                yMax = d3.max(data, function (d) {
                    return d3.max(keys, function (k) { return defined(d[k]) ? +d[k] : 0; });
                }) + 5;
            }
            var yMin = defined(opts.dataMin) ? opts.dataMin : 0;
            var yScale = d3.scaleLinear([yMin, yMax], [height - marginBottom, marginTop]);

            // ticks: once per year when the range is long, else on every record
            var xaxis = d3.axisBottom(xScale).tickFormat(tickFormat);
            if (noTicks) {
                var ticks = [];
                var start = Math.ceil(xMin / 12) * 12;
                var step = (xMax - xMin) > 72 ? 24 : 12;
                for (var t = start; t <= xMax; t += step) ticks.push(t);
                xaxis.tickValues(ticks);
            } else {
                xaxis.tickValues(xs);
            }

            svg.append('g')
                .attr('transform', 'translate(0,' + (height - marginBottom) + ')')
                .call(xaxis)
                .selectAll('text')
                .attr('text-anchor', 'end')
                .attr('dx', '-0.8em')
                .attr('dy', '0.1em')
                .attr('transform', 'rotate(-30)');

            svg.append('g')
                .attr('transform', 'translate(' + marginLeft + ',0)')
                .call(d3.axisLeft(yScale).ticks(6));

            function highlight(key) {
                svg.selectAll('.party-line').attr('stroke-width', 0.5).attr('stroke-opacity', 0.3);
                svg.selectAll('.party-node').attr('fill-opacity', 0.1);
                svg.selectAll('.party-label').attr('opacity', 0.2);
                svg.selectAll('.' + key + '-line').attr('stroke-width', 4).attr('stroke-opacity', 1);
                svg.selectAll('.' + key + '-node').attr('fill-opacity', 1);
                svg.selectAll('.' + key + '-label').attr('opacity', 1);
            }
            function reset() {
                svg.selectAll('.party-line').attr('stroke-width', 2).attr('stroke-opacity', 1);
                svg.selectAll('.party-node').attr('fill-opacity', 1);
                svg.selectAll('.party-label').attr('opacity', 1);
            }

            keys.forEach(function (key) {
                var line = d3.line()
                    .defined(function (d) { return defined(d[key]); })
                    .x(function (d) { return xScale(d.t); })
                    .y(function (d) { return yScale(+d[key]); });
                svg.append('path')
                    .attr('fill', 'none')
                    .attr('stroke', colors[key] || '#888')
                    .attr('stroke-width', 2)
                    .attr('class', 'party-line ' + key + '-line')
                    .attr('d', line(data))
                    .on('mouseover', function () { highlight(key); })
                    .on('mouseout', reset);

                var pts = data.filter(function (d) { return defined(d[key]); });
                if (!pts.length) return;
                if (!noDots) {
                    svg.selectAll('.pt-' + key)
                        .data(pts)
                        .enter().append('circle')
                        .attr('class', 'party-node ' + key + '-node')
                        .attr('fill', colors[key] || '#888')
                        .attr('r', 3.5)
                        .attr('cx', function (d) { return xScale(d.t); })
                        .attr('cy', function (d) { return yScale(+d[key]); })
                        .on('mouseover', function () { highlight(key); })
                        .on('mouseout', reset);
                }
                var last = pts[pts.length - 1];
                svg.append('text')
                    .text(names[key] || key)
                    .attr('font-size', '0.75em')
                    .attr('fill', colors[key] || '#888')
                    .attr('class', 'party-label ' + key + '-label')
                    .attr('x', xScale(last.t) + 6)
                    .attr('y', yScale(+last[key]) + 4)
                    .on('mouseover', function () { highlight(key); })
                    .on('mouseout', reset);
            });
        });
    }

    linegraph.width = function (v) { if (!arguments.length) return width; width = v; return linegraph; };
    linegraph.height = function (v) { if (!arguments.length) return height; height = v; return linegraph; };
    linegraph.keys = function (v) { if (!arguments.length) return keys; keys = v; return linegraph; };
    return linegraph;
};
