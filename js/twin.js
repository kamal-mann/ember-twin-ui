/*
 * EMBER UI: floor-plan digital twin (SVG).
 * Built once from config (zones, racks, assets, points), then only colours,
 * labels and animations are updated each tick.
 */
(function (E) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function rackOffset(r) { return (((r.index * 37 + r.row * 11) % 10) / 10) * 1.6 - 0.5; }

  class Twin {
    constructor(svg, onSelect) {
      this.svg = svg;
      this.onSelect = onSelect;
      this.el = { zone: {}, zoneTitle: {}, panel: {}, rack: {}, asset: {}, point: {} };
      this.build();
    }

    build() {
      const svg = this.svg;
      const self = this;
      svg.innerHTML = '';
      const gZones = el('g', {}, svg);
      E.ZONES.forEach(function (z) {
        const r = el('rect', { x: z.x, y: z.y, width: z.w, height: z.h, rx: 8, class: 'zone', 'data-zone': z.id }, gZones);
        r.addEventListener('click', function () { self.onSelect({ zone: z.id }); });
        self.el.zone[z.id] = r;
        self.el.zoneTitle[z.id] = el('text', { x: z.x + 10, y: z.y + 18, class: 'zone-title' }, gZones, z.label);
        self.el.zoneIssue = self.el.zoneIssue || {};
        self.el.zoneIssue[z.id] = el('text', { x: z.x + 10, y: z.y + 34, class: 'zone-issue' }, gZones, '');
        self.el.panel[z.id] = el('text', { x: z.x + z.w - 10, y: z.y + 18, class: 'panel-badge', 'text-anchor': 'end' }, gZones, 'Panel: Normal');
      });

      // Cold aisles between rack rows.
      ['HALL_A', 'HALL_B'].forEach(function (zid) {
        const z = E.ZONE[zid];
        el('rect', { x: z.x + 25, y: z.y + 110, width: 465, height: 50, class: 'aisle' }, gZones);
        el('text', { x: z.x + 240, y: z.y + 140, class: 'aisle-t', 'text-anchor': 'middle' }, gZones, 'contained cold aisle · liquid-cooled racks');
      });

      // Coolant pipes (supply / return) along the corridors, animated by flow.
      const gPipes = el('g', {}, svg);
      this.el.pipeS = el('path', { d: 'M800,150 H772 V300 H20', class: 'pipe supply' }, gPipes);
      this.el.pipeR = el('path', { d: 'M20,304 H776 V160 H800', class: 'pipe return' }, gPipes);

      const gRacks = el('g', {}, svg);
      E.RACKS.forEach(function (r) {
        const n = el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 3, class: 'rack' }, gRacks);
        el('title', {}, n, 'Rack ' + r.id);
        n.addEventListener('click', function (ev) { ev.stopPropagation(); self.onSelect({ point: r.zone === 'HALL_A' ? 'RI-HA' : 'RI-HB' }); });
        self.el.rack[r.id] = n;
      });

      const gAssets = el('g', {}, svg);
      E.ASSETS.forEach(function (a) {
        const g = el('g', { class: 'asset-g' }, gAssets);
        const n = el('rect', { x: a.x, y: a.y, width: a.w, height: a.h, rx: 5, class: 'asset' }, g);
        const short = a.type === 'battery' ? a.id : a.label.split(' (')[0];
        el('text', {
          x: a.x + a.w / 2, y: a.type === 'battery' ? a.y + a.h - 8 : a.type === 'switchboard' ? a.y + 18 : a.y + 16,
          class: 'asset-t', 'text-anchor': 'middle',
        }, g, short.length > 26 ? short.slice(0, 25) + '…' : short);
        el('title', {}, n, a.label);
        g.addEventListener('click', function (ev) { ev.stopPropagation(); self.onSelect({ asset: a.id }); });
        self.el.asset[a.id] = n;
        if (a.type === 'drycooler') {
          self.el.fans = [0, 1, 2].map(function (i) {
            const cx = a.x + 30 + i * 50;
            const cy = a.y + 46;
            const fg = el('g', { class: 'fan', style: 'transform-origin:' + cx + 'px ' + cy + 'px' }, g);
            el('circle', { cx: cx, cy: cy, r: 15, class: 'fan-ring' }, fg);
            el('path', { d: 'M' + (cx - 11) + ',' + cy + ' H' + (cx + 11) + ' M' + cx + ',' + (cy - 11) + ' V' + (cy + 11), class: 'fan-blade' }, fg);
            return fg;
          });
          self.el.spray = el('text', { x: a.x + a.w / 2, y: a.y + 80, class: 'spray-t', 'text-anchor': 'middle' }, g, '');
        }
      });

      this.el.hazard = el('g', { class: 'hazard', style: 'display:none' }, svg);
      el('circle', { r: 26, class: 'hazard-ring' }, this.el.hazard);
      el('circle', { r: 26, class: 'hazard-ring delay' }, this.el.hazard);
      this.el.hazardText = el('text', { y: -32, class: 'hazard-t', 'text-anchor': 'middle' }, this.el.hazard, '');

      const gPts = el('g', {}, svg);
      E.POINTS.forEach(function (p) {
        const n = el('circle', { cx: p.x, cy: p.y, r: 5.5, class: 'point' }, gPts);
        n.addEventListener('click', function (ev) { ev.stopPropagation(); self.onSelect({ point: p.id }); });
        n.addEventListener('mousemove', function (ev) { if (self.onHover) self.onHover(ev, p.id); });
        n.addEventListener('mouseleave', function () { if (self.onHover) self.onHover(null); });
        self.el.point[p.id] = n;
      });
    }

    update(snap, zones, scenario, selection) {
      const L = E.LEVELS;
      const self = this;
      E.ZONES.forEach(function (z) {
        const st = zones[z.id];
        const lv = L[st.level];
        const r = self.el.zone[z.id];
        r.style.fill = lv.colour;
        r.style.fillOpacity = st.level === 'LOW' ? 0.07 : 0.22;
        r.style.stroke = lv.colour;
        r.classList.toggle('flash', st.level === 'CRITICAL');
        r.classList.toggle('selected', !!(selection && selection.zone === z.id));
        const issue = st.level === 'LOW' ? '' : lv.label + ': ' + st.issue;
        const maxChars = Math.floor(z.w / 6.3);
        self.el.zoneIssue[z.id].textContent = issue.length > maxChars ? issue.slice(0, maxChars - 1) + '…' : issue;
        self.el.zoneIssue[z.id].style.fill = lv.colour;
        const pb = self.el.panel[z.id];
        pb.textContent = 'Panel: ' + (st.panel.state === 'NORMAL' ? 'Normal' : st.panel.state);
        pb.setAttribute('class', 'panel-badge ' + st.panel.state.toLowerCase());
      });

      E.RACKS.forEach(function (r) {
        const base = snap.points[r.zone === 'HALL_A' ? 'RI-HA' : 'RI-HB'].measured;
        const v = base + rackOffset(r);
        self.el.rack[r.id].style.fill = L[E.classify('rack_inlet', v)].colour;
        self.el.rack[r.id].querySelector('title').textContent = 'Rack ' + r.id + ': inlet ' + v.toFixed(1) + ' °C';
      });

      E.ASSETS.forEach(function (a) {
        const lv = E.worstLevel(E.POINTS.filter(function (p) { return p.asset === a.id; }).map(function (p) {
          return E.DIM[p.metric] ? E.classify(p.metric, snap.points[p.id].value) : 'LOW';
        }));
        const n = self.el.asset[a.id];
        n.style.stroke = L[lv].colour;
        n.style.fill = lv === 'LOW' ? '#1f2a36' : L[lv].colour + '55';
        n.classList.toggle('selected', !!(selection && selection.asset === a.id));
      });

      E.POINTS.forEach(function (p) {
        const lv = E.DIM[p.metric] ? E.classify(p.metric, snap.points[p.id].value) : 'LOW';
        const n = self.el.point[p.id];
        n.style.fill = L[lv].colour;
        n.setAttribute('r', selection && selection.point === p.id ? 8.5 : 5.5);
        n.classList.toggle('selected', !!(selection && selection.point === p.id));
      });

      // Coolant flow animation speed follows the CDU flow.
      const flow = snap.points['FL-CDU'].measured / 1200;
      const dur = (1.6 / Math.max(0.2, flow)).toFixed(2) + 's';
      this.el.pipeS.style.animationDuration = dur;
      this.el.pipeR.style.animationDuration = dur;
      const a = snap.energy.actual;
      const fanDur = (2.4 / (0.6 + a.chillerFrac + (snap.env.outdoorC > 10 ? (snap.env.outdoorC - 10) / 20 : 0))).toFixed(2) + 's';
      (this.el.fans || []).forEach(function (f) { f.style.animationDuration = fanDur; });
      this.el.spray.textContent = a.adiabaticOn ? '💧 adiabatic spray ON' : 'dry · no water';
      this.el.spray.setAttribute('class', 'spray-t' + (a.adiabaticOn ? ' on' : ''));

      // Hazard localisation: where the twin thinks the problem is.
      const hz = this.el.hazard;
      if (scenario && scenario.location && scenario.zone && zones[scenario.zone].level !== 'LOW') {
        const lv = L[zones[scenario.zone].level];
        hz.style.display = '';
        hz.setAttribute('transform', 'translate(' + scenario.location.x + ',' + scenario.location.y + ')');
        hz.querySelectorAll('circle').forEach(function (c) { c.style.stroke = lv.colour; });
        this.el.hazardText.textContent = scenario.location.label;
        this.el.hazardText.style.fill = lv.colour;
      } else {
        hz.style.display = 'none';
      }
    }
  }
  E.Twin = Twin;
})(globalThis.EMBER = globalThis.EMBER || {});
