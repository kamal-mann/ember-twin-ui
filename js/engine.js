/*
 * EMBER UI: twin models and evidence layer.
 *
 * energyModel: a simple physics model of the zero-water cooling plant
 *   (dry coolers + trim chiller + optional adiabatic spray). The simulator
 *   uses it to make dummy data, the twin uses it for "expected" values, and
 *   the what-if panel uses it for scenarios.
 * evaluate: turns one snapshot of signals into zone levels: hard-limit bands,
 *   SOM region, novelty and the certified panel state (read-only).
 *   This is the part to keep when a real data feed replaces the simulator.
 *
 * Smoothing (optional): the SOM can use a rolling mean of each zone's feature
 * vector over the last N ticks instead of the latest raw reading. This stops
 * normal noise making the zone's dot jump between neighbouring cells. Hard
 * limits always use the raw reading, so smoothing never delays a limit alarm.
 */
(function (E) {
  'use strict';

  E.PLANT = {
    supplyC: 32,          // warm-water liquid cooling supply setpoint (ASHRAE W32 class)
    approachC: 4,         // design dry-cooler approach (leaving fluid minus outdoor air)
    hxMarginC: 1,         // heat-exchanger margin between dry-cooler fluid and supply
    chillerSpanC: 8,      // °C of excess over which the trim chiller goes from 0 to full load
    adiabaticDropC: 6,    // air pre-cooling from adiabatic spray
    sprayLphPerKw: 0.3,   // spray water per kW of IT load when spraying
    fanBase: 0.03,        // fan + pump power as a share of IT load
    fanPerC: 0.002,       // extra fan power per °C outdoor above 10 °C
    fanFoulingPerC: 0.006,// extra fan power per °C of extra approach (fouling)
    chillerShare: 0.22,   // chiller power as a share of IT at full trim load
    otherLosses: 0.05,    // UPS, distribution, lighting
  };

  // p: { outdoorC, itKW, supplyC, approachC, allowAdiabatic, overcoolFrac, makeupLph }
  E.energyModel = function (p) {
    const k = E.PLANT;
    const supply = p.supplyC !== undefined ? p.supplyC : k.supplyC;
    const approach = p.approachC !== undefined ? p.approachC : k.approachC;
    const limit = supply - k.hxMarginC;
    const dryLeaving = p.outdoorC + approach;
    const chillerNoSpray = Math.max(0, Math.min(1, (dryLeaving - limit) / k.chillerSpanC));
    const adiabaticOn = !!p.allowAdiabatic && chillerNoSpray > 0;
    const leavingC = dryLeaving - (adiabaticOn ? k.adiabaticDropC : 0);
    const chillerFrac = Math.max(0, Math.min(1, (leavingC - limit) / k.chillerSpanC));
    const sprayLph = adiabaticOn ? k.sprayLphPerKw * p.itKW : 0;
    const fans = k.fanBase + k.fanPerC * Math.max(0, p.outdoorC - 10) + k.fanFoulingPerC * Math.max(0, approach - k.approachC);
    const coolingKW = p.itKW * (fans + chillerFrac * k.chillerShare + (p.overcoolFrac || 0));
    const pue = (p.itKW + coolingKW + k.otherLosses * p.itKW) / p.itKW;
    const waterLph = sprayLph + (p.makeupLph || 0);
    let mode = 'Free cooling (dry coolers only)';
    if (chillerFrac > 0.6) mode = 'Chiller-dominated';
    else if (chillerFrac > 0) mode = 'Dry coolers + chiller trim';
    if (adiabaticOn) mode += ' + adiabatic spray';
    return {
      supplyC: supply, leavingC: leavingC, chillerFrac: chillerFrac, adiabaticOn: adiabaticOn,
      sprayLph: sprayLph, coolingKW: coolingKW, pue: pue, waterLph: waterLph,
      wue: waterLph / p.itKW, mode: mode,
    };
  };

  // Worst-case value of one metric across a zone's points.
  function zoneValue(zoneId, metric, snap) {
    const d = E.DIM[metric];
    let out;
    E.POINTS.forEach(function (p) {
      if (p.zone !== zoneId || p.metric !== metric) return;
      const v = snap.points[p.id].value;
      if (out === undefined) out = v;
      else if (d && d.direction === 'down') out = Math.min(out, v);
      else out = Math.max(out, v);
    });
    return out;
  }

  function coolingFeatures(snap) {
    let ri = 0;
    let n = 0;
    E.POINTS.forEach(function (p) {
      if (p.metric !== 'rack_inlet') return;
      const s = snap.points[p.id];
      ri += s.measured - s.expected;
      n++;
    });
    return {
      pue_res: snap.energy.actual.pue - snap.energy.expected.pue,
      wue: snap.energy.actual.wue,
      makeup: snap.points['MU-LOOP'].value,
      adiabatic: snap.points['AD-DC'].value,
      dc_approach: snap.points['AP-DC'].value,
      cdu_flow: snap.points['FL-CDU'].value,
      rack_inlet_res: n ? ri / n : 0,
    };
  }

  E.SMOOTH_MAX = 5; // ticks kept per zone for the rolling mean

  // Rolling mean of the last `window` feature vectors for one zone and map.
  // buffers is caller-owned state ({}), reset when a scenario restarts.
  function smoothFeatures(buffers, key, x, window) {
    const buf = buffers[key] = buffers[key] || [];
    buf.push(x);
    if (buf.length > E.SMOOTH_MAX) buf.shift();
    const n = Math.max(1, Math.min(window, buf.length));
    const recent = buf.slice(buf.length - n);
    return x.map(function (_, k) {
      return recent.reduce(function (s, v) { return s + v[k]; }, 0) / n;
    });
  }

  // models: { fire: builtSOM, cooling: builtSOM }
  // opts (optional): { smoothWindow: 1..SMOOTH_MAX, buffers: {} }
  E.evaluate = function (snap, models, opts) {
    const smoothWindow = opts && opts.smoothWindow ? opts.smoothWindow : 1;
    const buffers = opts && opts.buffers ? opts.buffers : {};
    const zones = {};
    E.ZONES.forEach(function (z) {
      const contributors = [];
      E.POINTS.forEach(function (p) {
        if (p.zone !== z.id) return;
        const s = snap.points[p.id];
        const level = E.DIM[p.metric] ? E.classify(p.metric, s.value) : 'LOW';
        contributors.push({ id: p.id, label: p.label, metric: p.metric, value: s.value, measured: s.measured, expected: s.expected, level: level });
      });
      if (z.id === 'PLANT') {
        [['pue', snap.energy.actual.pue], ['wue', snap.energy.actual.wue], ['free_cooling', snap.energy.freeCoolingShare]].forEach(function (kv) {
          contributors.push({ id: 'KPI-' + kv[0], label: E.DIM[kv[0]].label, metric: kv[0], value: kv[1], level: E.classify(kv[0], kv[1]) });
        });
      }
      const panel = snap.panel[z.id] || { state: 'NORMAL', label: 'Normal' };
      zones[z.id] = {
        id: z.id, contributors: contributors, panel: panel,
        thresholdLevel: E.worstLevel(contributors.map(function (c) { return c.level; })),
        som: {},
      };
    });

    Object.keys(models).forEach(function (key) {
      const m = models[key];
      m.meta.zones.forEach(function (zid) {
        let values;
        if (key === 'cooling') values = coolingFeatures(snap);
        else {
          values = {};
          m.meta.features.forEach(function (f) { values[f.key] = zoneValue(zid, f.key, snap); });
        }
        const raw = E.toFeatures(m.meta, values);
        const x = smoothFeatures(buffers, key + ':' + zid, raw, smoothWindow);
        const b = m.som.bmu(x);
        const cls = m.meta.classes[m.som.labels[b.index]];
        zones[zid].som[key] = {
          index: b.index, qe: b.qe, novel: b.qe > m.som.qeThreshold,
          classId: cls.id, classLabel: cls.label, level: cls.level, features: x, rawFeatures: raw,
        };
      });
    });

    Object.keys(zones).forEach(function (zid) {
      const z = zones[zid];
      const levels = [z.thresholdLevel];
      let issue = null;
      Object.keys(z.som).forEach(function (k) {
        const s = z.som[k];
        levels.push(s.level);
        if (s.novel) levels.push('UNKNOWN');
        if (s.level !== 'LOW' && !issue) issue = s.classLabel;
      });
      if (z.panel.state === 'FIRE') levels.push('CRITICAL');
      else if (z.panel.state !== 'NORMAL') levels.push('MEDIUM');
      z.level = E.worstLevel(levels);
      const worst = z.contributors.filter(function (c) { return c.level !== 'LOW'; })
        .sort(function (a, b) { return E.LEVELS[b.level].rank - E.LEVELS[a.level].rank; });
      if (!issue && worst.length) issue = E.DIM[worst[0].metric].label + ' ' + E.LEVELS[worst[0].level].label.toLowerCase();
      if (!issue && Object.keys(z.som).some(function (k) { return z.som[k].novel; })) issue = 'Unfamiliar pattern: engineer review';
      z.issue = issue || 'Normal';
      z.evidence = worst;
    });
    return zones;
  };
})(globalThis.EMBER = globalThis.EMBER || {});
