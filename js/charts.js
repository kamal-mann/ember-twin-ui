/*
 * EMBER UI: minimal SVG line chart (no external libraries, works offline).
 *
 * E.lineChart(svg, {
 *   series: [{ points: [[x, y], ...], colour, label, dash, width }],
 *   hLines: [{ y, colour, label }],          // fixed thresholds
 *   xFormat: function (x) -> string, yDigits, yUnit
 * })
 */
(function (E) {
  'use strict';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  E.esc = esc;

  E.lineChart = function (svg, opts) {
    const vb = svg.viewBox.baseVal;
    const W = vb && vb.width ? vb.width : 640;
    const Hh = vb && vb.height ? vb.height : 220;
    const m = { l: 52, r: 12, t: 26, b: 26 };
    const series = (opts.series || []).filter(function (s) { return s.points && s.points.length; });
    const hLines = opts.hLines || [];
    if (!series.length) { svg.innerHTML = '<text x="20" y="40" class="axis">No data yet</text>'; return; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (p[0] < x0) x0 = p[0];
        if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[1] > y1) y1 = p[1];
      });
    });
    hLines.forEach(function (h) {
      // Only stretch the axis to a threshold when it is reasonably close.
      const span = Math.max(y1 - y0, Math.abs(y1) * 0.1, 1e-6);
      if (h.y <= y1 + span * 1.5 && h.y >= y0 - span * 1.5) { y0 = Math.min(y0, h.y); y1 = Math.max(y1, h.y); }
    });
    if (opts.yMin !== undefined) y0 = Math.min(y0, opts.yMin);
    if (y1 - y0 < 1e-9) { y1 += 1; y0 -= 1; }
    const pad = (y1 - y0) * 0.08;
    y0 -= pad; y1 += pad;
    if (x1 === x0) x1 = x0 + 1;
    const X = function (x) { return m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r); };
    const Y = function (y) { return Hh - m.b - ((y - y0) / (y1 - y0)) * (Hh - m.t - m.b); };
    const parts = [];
    const digits = opts.yDigits !== undefined ? opts.yDigits : 2;

    for (let i = 0; i <= 4; i++) {
      const yv = y0 + ((y1 - y0) * i) / 4;
      parts.push('<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(yv).toFixed(1) + '" y2="' + Y(yv).toFixed(1) + '"/>');
      parts.push('<text class="axis" x="' + (m.l - 6) + '" y="' + (Y(yv) + 3).toFixed(1) + '" text-anchor="end">' + yv.toFixed(digits) + '</text>');
    }
    for (let i = 0; i <= 4; i++) {
      const xv = x0 + ((x1 - x0) * i) / 4;
      const lbl = opts.xFormat ? opts.xFormat(xv) : xv.toFixed(0);
      parts.push('<text class="axis" x="' + X(xv).toFixed(1) + '" y="' + (Hh - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === 4 ? 'end' : 'middle') + '">' + esc(lbl) + '</text>');
    }
    if (opts.yUnit) parts.push('<text class="axis" x="6" y="14">' + esc(opts.yUnit) + '</text>');

    hLines.forEach(function (h) {
      if (h.y < y0 || h.y > y1) return;
      parts.push('<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(h.y).toFixed(1) + '" y2="' + Y(h.y).toFixed(1) +
        '" stroke="' + h.colour + '" stroke-dasharray="5 4" stroke-width="1.2"/>');
      if (h.label) parts.push('<text class="axis" fill="' + h.colour + '" x="' + (W - m.r - 4) + '" y="' + (Y(h.y) - 3).toFixed(1) + '" text-anchor="end">' + esc(h.label) + '</text>');
    });

    series.forEach(function (s) {
      const d = s.points.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join('');
      parts.push('<path d="' + d + '" fill="none" stroke="' + s.colour + '" stroke-width="' + (s.width || 1.8) + '"' +
        (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>');
    });

    let lx = m.l;
    series.forEach(function (s) {
      parts.push('<rect x="' + lx + '" y="8" width="12" height="3" fill="' + s.colour + '"/>');
      parts.push('<text class="legend-t" x="' + (lx + 16) + '" y="13">' + esc(s.label) + '</text>');
      lx += 26 + s.label.length * 6.2;
    });
    svg.innerHTML = parts.join('');
  };
})(globalThis.EMBER = globalThis.EMBER || {});
