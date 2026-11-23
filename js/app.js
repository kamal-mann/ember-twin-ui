/*
 * EMBER UI: application controller.
 * Wires simulator -> engine (evaluate) -> views (twin, SOMs, charts, alerts).
 */
(function (E) {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const L = E.LEVELS;
  const esc = E.esc;
  const TRAIL = 18;

  // Which signal to show first in the detail panel for each scenario.
  const FOCUS = {
    normal: 'RI-HA', battery: 'CT-B2', joint: 'JT-L2', smoulder: 'ASD-HA', dust: 'ASD-HB', asdblock: 'AF-HA',
    refrig: 'RF-CH', fouling: 'AP-DC', leak: 'MU-LOOP', heatwave: 'AD-DC', overcool: 'RI-HA', pump: 'FL-CDU',
  };

  const S = {
    models: null, sim: null, twin: null, snap: null, zones: null,
    trails: {}, alerts: [], alertSeq: 0, prevLevels: {}, firstWarn: {}, certFired: [],
    selection: null, playing: true, timer: null, somMode: 'regions', openAlert: null,
    smoothWindow: E.SMOOTH_MAX, buffers: {},
  };

  function chip(level, text) {
    return '<span class="chip" style="background:' + L[level].colour + '">' + esc(text || L[level].label) + '</span>';
  }

  function fmt(dimKey, v) {
    const d = E.DIM[dimKey];
    if (v === undefined || v === null || isNaN(v)) return '—';
    const digits = d ? d.digits : 2;
    return v.toFixed(digits) + (d && d.unit ? ' ' + d.unit : '');
  }

  function relTime(t) {
    const sign = t < 0 ? '−' : '+';
    return 'T' + sign + E.formatDuration(Math.abs(t));
  }

  // ------------------------------------------------------------ scenario
  function loadScenario(id) {
    S.sim.setScenario(id);
    $('scenario').value = id;
    S.trails = {};
    S.alerts = [];
    S.alertSeq = 0;
    S.prevLevels = {};
    S.firstWarn = {};
    S.certFired = [];
    S.openAlert = null;
    S.buffers = {};
    S.selection = { point: FOCUS[id] || 'RI-HA' };
    S.sim.history.forEach(function (snap) {
      const zones = E.evaluate(snap, S.models, evalOpts());
      pushTrails(zones);
      S.snap = snap;
      S.zones = zones;
    });
    E.ZONES.forEach(function (z) { S.prevLevels[z.id] = S.zones[z.id].level; });
    const sc = S.sim.sc;
    $('scenario-bar').innerHTML =
      '<span class="prio ' + (sc.priority === 'P1' ? 'p1' : sc.priority === 'P2' ? 'p2' : 'p0') + '">' + esc(sc.priority) + '</span>' +
      '<b>' + esc(sc.title) + '</b><span>' + esc(sc.summary) + '</span>' +
      '<span class="hint">1 tick = ' + E.formatDuration(sc.minutesPerTick) + ' · runs ' + E.formatDuration(sc.durationMin) + '</span>';
    renderAll();
  }

  function evalOpts() { return { smoothWindow: S.smoothWindow, buffers: S.buffers }; }

  function smoothLabel() {
    const sc = S.sim.sc;
    return S.smoothWindow > 1
      ? 'Smoothed: mean of last ' + S.smoothWindow + ' ticks (' + E.formatDuration(S.smoothWindow * sc.minutesPerTick) + ')'
      : 'Raw: latest reading only';
  }

  function pushTrails(zones) {
    Object.keys(zones).forEach(function (zid) {
      Object.keys(zones[zid].som).forEach(function (k) {
        const key = k + ':' + zid;
        const tr = S.trails[key] = S.trails[key] || [];
        const idx = zones[zid].som[k].index;
        // While a zone is Low, keep only its current cell, so a trail starts
        // where the zone leaves normal instead of showing noise hops.
        if (zones[zid].level === 'LOW') tr.length = 0;
        if (tr[tr.length - 1] !== idx) tr.push(idx);
        if (tr.length > TRAIL) tr.shift();
      });
    });
  }

  function tick() {
    if (S.sim.isDone) { setPlaying(false); $('clock').textContent += ' · complete'; return; }
    const snap = S.sim.step();
    const zones = E.evaluate(snap, S.models, evalOpts());
    pushTrails(zones);
    detectAlerts(snap, zones);
    S.snap = snap;
    S.zones = zones;
    renderAll();
  }

  // -------------------------------------------------------------- alerts
  function detectAlerts(snap, zones) {
    const sc = S.sim.sc;
    snap.events.forEach(function (ev) {
      S.certFired.push({ t: snap.t, ev: ev });
      addAlert({ t: snap.t, zone: ev.zone, level: ev.state === 'FIRE' ? 'CRITICAL' : 'MEDIUM', certified: true, issue: ev.label });
    });
    Object.keys(zones).forEach(function (zid) {
      const z = zones[zid];
      const prev = S.prevLevels[zid] || 'LOW';
      const fw = S.firstWarn[zid] = S.firstWarn[zid] || {};
      if (L[z.level].rank >= 1 && fw.medium === undefined) fw.medium = snap.t;
      if (L[z.level].rank >= 2 && fw.high === undefined) fw.high = snap.t;
      if (L[z.level].rank > L[prev].rank && L[z.level].rank >= 0.5) {
        const relevant = sc.zone === zid || (sc.alsoAffects || []).indexOf(zid) >= 0;
        addAlert({
          t: snap.t, zone: zid, level: z.level, issue: z.issue,
          evidence: z.evidence.slice(0, 5), som: z.som,
          diagnosis: sc.zone === zid ? sc.diagnosis : null,
          note: !relevant ? 'Not linked to the active scenario: review as a possible false alarm.' : null,
        });
      }
      S.prevLevels[zid] = z.level;
    });
  }

  function addAlert(a) {
    a.id = 'AL-' + String(++S.alertSeq).padStart(3, '0');
    S.alerts.unshift(a);
    if (!a.certified && (L[a.level].rank >= 1)) S.openAlert = a.id;
    if (S.alerts.length > 40) S.alerts.pop();
  }

  function renderAlerts() {
    const box = $('alerts');
    if (!S.alerts.length) { box.innerHTML = '<div class="empty">No alerts. All zones within normal bands.</div>'; return; }
    box.innerHTML = S.alerts.map(function (a) {
      const open = a.id === S.openAlert;
      let body = '';
      if (open && !a.certified) {
        body += '<div class="al-body">';
        if (a.note) body += '<div class="note">' + esc(a.note) + '</div>';
        if (a.evidence && a.evidence.length) {
          body += '<div class="al-sec">Evidence</div><table class="ev">' + a.evidence.map(function (c, i) {
            const d = E.DIM[c.metric];
            return '<tr><td class="mono">EV-' + (i + 1) + '</td><td>' + esc(c.label) + '</td><td>' + fmt(c.metric, c.value) +
              (d && d.basis === 'residual' ? ' <span class="hint">(residual)</span>' : '') + '</td><td>' + chip(c.level) + '</td></tr>';
          }).join('') + '</table>';
        }
        if (a.som) {
          body += '<div class="al-sec">SOM</div><div>' + Object.keys(a.som).map(function (k) {
            const s = a.som[k];
            return esc(E.SOMS[k].title) + ': region <b>' + esc(s.classLabel) + '</b> ' + chip(s.level) +
              ' · QE ' + s.qe.toFixed(2) + (s.novel ? ' · <b>unfamiliar pattern</b>' : '');
          }).join('<br>') + '</div>';
        }
        if (a.diagnosis) {
          body += '<div class="al-sec">Diagnosis <span class="hint">(simulated stand-in for the guarded LLM)</span></div>' +
            '<div class="diag-issue">' + esc(a.diagnosis.issue) + '</div><p>' + esc(a.diagnosis.text) + '</p>' +
            '<div class="al-sec">Whitelisted actions</div><ul class="actions">' + a.diagnosis.actions.map(function (x) {
              return '<li><span class="tier t' + x.tier + '">Tier ' + x.tier + '</span>' + esc(x.text) + '</li>';
            }).join('') + '</ul>';
        }
        body += '</div>';
      }
      return '<div class="alert' + (a.certified ? ' cert' : '') + (open ? ' open' : '') + '" data-id="' + a.id + '" style="border-left-color:' + L[a.level].colour + '">' +
        '<div class="al-head">' + chip(a.level) + '<span class="mono">' + a.id + '</span><span>' + esc(E.ZONE[a.zone].label) + '</span>' +
        '<span class="al-time">' + relTime(a.t) + '</span></div>' +
        '<div class="al-issue">' + (a.certified ? '🔒 Certified system (read-only): ' : '') + esc(a.issue) + '</div>' + body + '</div>';
    }).join('');
  }

  function renderLead() {
    const sc = S.sim.sc;
    const box = $('lead-card');
    if (!sc.zone) {
      box.innerHTML = '<div class="panel-head"><h2>Early-warning lead time</h2></div><div class="hint">Baseline scenario: no hazard injected. Watch for false alarms (there should be none).</div>';
      return;
    }
    const fw = S.firstWarn[sc.zone] || {};
    const cert = sc.certified[0];
    const certHit = S.certFired.length ? S.certFired[0] : null;
    let html = '<div class="panel-head"><h2>Early-warning lead time</h2><span class="hint">' + esc(E.ZONE[sc.zone].label) + '</span></div><div class="lead">';
    html += '<div><span class="lbl">Twin first warning (Medium)</span><b>' + (fw.medium !== undefined ? relTime(fw.medium) : 'not yet') + '</b></div>';
    html += '<div><span class="lbl">Twin High</span><b>' + (fw.high !== undefined ? relTime(fw.high) : 'not yet') + '</b></div>';
    if (cert) {
      html += '<div><span class="lbl">Certified system: ' + esc(cert.label) + '</span><b>' + (certHit ? relTime(certHit.t) : 'not yet') + '</b></div>';
      if (fw.medium !== undefined) {
        const ref = certHit ? certHit.t : S.snap.t;
        const lead = ref - fw.medium;
        html += '<div class="lead-big">' + (certHit ? 'Lead time ' : 'Ahead by ') + '<b>' + E.formatDuration(lead) + '</b>' + (certHit ? '' : ' so far') + '</div>';
      }
    } else {
      html += '<div class="hint">No certified alarm in this scenario: the twin is the only early signal (energy, water or plant).</div>';
    }
    if (S.snap.permit) html += '<div class="permit">📋 Active permit: ' + esc(S.snap.permit) + '</div>';
    box.innerHTML = html + '</div>';
  }

  // ------------------------------------------------------------- KPI strip
  function domainLevel(domain) {
    const lv = [];
    Object.keys(S.zones).forEach(function (zid) {
      S.zones[zid].contributors.forEach(function (c) {
        if (E.DIM[c.metric] && E.DIM[c.metric].domain === domain) lv.push(c.level);
      });
    });
    return E.worstLevel(lv);
  }

  function renderKpis() {
    const z = S.zones;
    const overall = E.worstLevel(Object.keys(z).map(function (k) { return z[k].level; }));
    const panelStates = Object.keys(z).map(function (k) { return z[k].panel.state; });
    const panelLv = panelStates.indexOf('FIRE') >= 0 ? 'CRITICAL' : panelStates.some(function (s) { return s !== 'NORMAL'; }) ? 'MEDIUM' : 'LOW';
    const panelTxt = panelStates.indexOf('FIRE') >= 0 ? 'FIRE' : panelStates.indexOf('PRE-ALARM') >= 0 ? 'Pre-alarm' : panelStates.indexOf('FAULT') >= 0 ? 'Fault' : 'Normal';
    const fireSom = E.worstLevel(['HALL_A', 'HALL_B', 'UPS', 'ELEC'].map(function (k) { return z[k].som.fire.level; }));
    const a = S.snap.energy.actual;
    const tiles = [
      ['Overall', overall, L[overall].label, 'P1+P2'],
      ['Fire & smoke', domainLevel('fire'), null, 'P1'],
      ['Battery', domainLevel('battery'), null, 'P1'],
      ['Electrical', domainLevel('electrical'), null, 'P1'],
      ['Readiness', domainLevel('readiness'), null, 'P1'],
      ['Fire SOM', fireSom, null, 'P1'],
      ['Fire panel', panelLv, panelTxt + ' 🔒', 'read-only'],
      ['PUE', E.classify('pue', a.pue), a.pue.toFixed(2), 'P2'],
      ['WUE', E.classify('wue', a.wue), a.wue.toFixed(3) + ' L/kWh', 'P2'],
      ['Chiller-free', E.classify('free_cooling', S.snap.energy.freeCoolingShare), S.snap.energy.freeCoolingShare.toFixed(0) + ' %', 'P2'],
      ['Cooling SOM', z.PLANT.som.cooling.level, z.PLANT.som.cooling.classLabel, 'P2'],
    ];
    $('kpis').innerHTML = tiles.map(function (t) {
      return '<div class="kpi' + (t[1] === 'CRITICAL' ? ' flash' : '') + '" style="border-top-color:' + L[t[1]].colour + '"><div class="k-lbl">' + esc(t[0]) +
        '<span class="k-p">' + t[3] + '</span></div><div class="k-val" style="color:' + L[t[1]].colour + '">' + esc(t[2] || L[t[1]].label) + '</div></div>';
    }).join('');
    $('clock').textContent = E.formatClock(S.snap.t) + ' · ' + relTime(S.snap.t);
  }

  // --------------------------------------------------------------- detail
  function seriesFor(pid, field) {
    return S.sim.history.map(function (h) { return [h.t, h.points[pid][field]]; });
  }

  function renderDetail() {
    const sel = S.selection || {};
    let pid = sel.point;
    let list = [];
    if (sel.zone) list = E.POINTS.filter(function (p) { return p.zone === sel.zone; });
    if (sel.asset) list = E.POINTS.filter(function (p) { return p.asset === sel.asset; });
    if (!pid && list.length) {
      const ranked = list.slice().sort(function (a, b) {
        const la = E.DIM[a.metric] ? L[E.classify(a.metric, S.snap.points[a.id].value)].rank : 0;
        const lb = E.DIM[b.metric] ? L[E.classify(b.metric, S.snap.points[b.id].value)].rank : 0;
        return lb - la;
      });
      pid = ranked[0].id;
    }
    if (!pid) pid = 'RI-HA';
    const p = E.POINT[pid];
    const d = E.DIM[p.metric];
    const extra = E.EXTRA_SIGNALS[p.metric];
    const s = S.snap.points[pid];
    const lv = d ? E.classify(p.metric, s.value) : 'LOW';
    const raw = E.RAW_UNITS[p.metric];
    const unit = raw ? raw.unit : d ? d.unit : '';

    let title = p.label;
    if (sel.asset) title = E.ASSETS.filter(function (a) { return a.id === sel.asset; })[0].label + ' › ' + p.label;
    if (sel.zone) title = E.ZONE[sel.zone].label + ' › ' + p.label;
    $('detail-title').textContent = title;
    $('detail-hint').textContent = d && d.basis === 'residual' ? 'Classified on residual = measured − physics-model expected' : 'Classified on the measured value';

    let info = '<div class="big-val" style="color:' + L[lv].colour + '">' + (d ? fmt(p.metric, s.value) : s.value.toFixed(2)) + ' ' + chip(lv) + '</div>';
    info += '<p>' + esc(d ? d.plain : extra.plain) + '</p>';
    if (d) {
      const bt = E.bandText(d);
      info += '<table class="bands"><tr><td>' + chip('LOW') + '</td><td>' + esc(bt.LOW) + '</td></tr><tr><td>' + chip('MEDIUM') + '</td><td>' + esc(bt.MEDIUM) +
        '</td></tr><tr><td>' + chip('HIGH') + '</td><td>' + esc(bt.HIGH) + '</td></tr></table>';
      info += '<p class="hint">' + esc(d.source) + '</p>';
    }
    if (list.length > 1) {
      info += '<div class="al-sec">Other signals here</div><div class="pt-list">' + list.map(function (q) {
        const ql = E.DIM[q.metric] ? E.classify(q.metric, S.snap.points[q.id].value) : 'LOW';
        return '<button data-pt="' + q.id + '" class="' + (q.id === pid ? 'on' : '') + '"><i style="background:' + L[ql].colour + '"></i>' + esc(q.label) + '</button>';
      }).join('') + '</div>';
    }
    $('detail-info').innerHTML = info;

    const meas = seriesFor(pid, 'measured');
    const exp = seriesFor(pid, 'expected');
    const series = [{ points: meas, colour: '#5ec2ff', label: 'Measured' + (raw ? ' ' + raw.label.toLowerCase() : '') }];
    const hLines = [];
    if (d && d.basis === 'residual') {
      series.push({ points: exp, colour: '#c9d1d9', label: 'Expected (physics model)', dash: '6 4', width: 1.4 });
      const toRaw = function (e, b) { return p.metric === 'cdu_flow' ? e * (1 + b / 100) : e + b; };
      series.push({ points: exp.map(function (q) { return [q[0], toRaw(q[1], d.bands[0])]; }), colour: L.MEDIUM.colour, label: 'Medium', dash: '3 3', width: 1 });
      series.push({ points: exp.map(function (q) { return [q[0], toRaw(q[1], d.bands[1])]; }), colour: L.HIGH.colour, label: 'High', dash: '3 3', width: 1 });
    } else {
      series.push({ points: exp, colour: '#c9d1d9', label: 'Normal baseline', dash: '6 4', width: 1.2 });
      if (d) {
        hLines.push({ y: d.bands[0], colour: L.MEDIUM.colour, label: 'Medium' });
        hLines.push({ y: d.bands[1], colour: L.HIGH.colour, label: 'High' });
      }
    }
    E.lineChart($('detail-chart'), {
      series: series, hLines: hLines, xFormat: relTime, yUnit: unit,
      yDigits: d ? Math.min(3, Math.max(0, d.digits)) : 2,
    });
  }

  // ------------------------------------------------------------------ SOMs
  function markersFor(key) {
    const m = S.models[key];
    return m.meta.zones.map(function (zid) {
      const s = S.zones[zid].som[key];
      const lv = S.zones[zid].level;
      return {
        label: E.ZONE[zid].short, index: s.index, trail: lv === 'LOW' ? [] : S.trails[key + ':' + zid] || [],
        colour: s.novel ? L.UNKNOWN.colour : '#ffffff', pulse: L[lv].rank >= 2,
      };
    });
  }

  function renderSOMs(full) {
    E.renderSOM($('mini-som-fire'), S.models.fire, { mode: 'regions', r: 11, markers: markersFor('fire'), showLabels: false, dimUnoccupied: true });
    $('mini-som-hint').textContent = 'Dots = zones · ' + (S.smoothWindow > 1 ? 'smoothed' : 'raw');
    $('som-smooth-hint').textContent = smoothLabel() + '. Hard limits always use raw readings.';
    if (!full) return;
    ['fire', 'cooling'].forEach(function (k) {
      E.renderSOM($('som-' + k), S.models[k], { mode: S.somMode, r: 20, markers: markersFor(k), dimUnoccupied: true });
    });
    $('som-zones').innerHTML = '<table class="tbl"><tr><th>Zone</th><th>Map</th><th>Region</th><th>Level</th><th>QE</th></tr>' +
      Object.keys(S.zones).map(function (zid) {
        return Object.keys(S.zones[zid].som).map(function (k) {
          const s = S.zones[zid].som[k];
          return '<tr><td>' + esc(E.ZONE[zid].label) + '</td><td>' + k + '</td><td>' + esc(s.classLabel) + '</td><td>' + chip(s.novel ? 'UNKNOWN' : s.level) +
            '</td><td>' + s.qe.toFixed(2) + (s.novel ? ' (unfamiliar)' : '') + '</td></tr>';
        }).join('');
      }).join('') + '</table><p class="hint">QE (quantization error) = distance from the zone\'s situation to its best-matching neuron. Above the novelty threshold the twin says "Unknown" instead of guessing.</p>';
  }

  function renderSOMLegends() {
    ['fire', 'cooling'].forEach(function (k) {
      const m = S.models[k];
      $('som-' + k + '-title').textContent = m.meta.title + ' · ' + m.meta.cols + '×' + m.meta.rows + ' hex grid';
      const counts = {};
      m.som.labels.forEach(function (l) { counts[l] = (counts[l] || 0) + 1; });
      $('som-' + k + '-legend').innerHTML = m.meta.classes.map(function (c, ci) {
        return '<span class="lg"><i style="background:' + E.classColour(m.meta, ci) + '"></i>' + esc(c.label) +
          ' <span class="hint">' + L[c.level].rag + ' · ' + (counts[ci] || 0) + ' cells</span></span>';
      }).join('');
    });
  }

  function somHover(ev, key) {
    const t = ev.target;
    if (!t.classList || !t.classList.contains('hex')) return;
    const i = +t.getAttribute('data-i');
    const m = S.models[key];
    const cls = m.meta.classes[m.som.labels[i]];
    const w = m.meta.features.map(function (f, k) { return { f: f, v: m.som.w[i * m.som.dim + k] }; })
      .sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }).slice(0, 4);
    $('som-hover').innerHTML = '<b>' + esc(m.meta.title) + '</b> · neuron ' + i + ' (row ' + m.som.pos[i].r + ', col ' + m.som.pos[i].c + ')<br>' +
      'Region: <b>' + esc(cls.label) + '</b> ' + chip(cls.level) + ' · training samples won: ' + m.som.hits[i] +
      ' · U-matrix: ' + m.som.umat[i].toFixed(2) +
      '<div class="al-sec">Strongest weights (scaled: 0 typical, ±1 notable)</div>' +
      w.map(function (x) { return esc(x.f.label) + ': <b>' + x.v.toFixed(2) + '</b>'; }).join(' · ');
  }

  // ---------------------------------------------------------------- energy
  function renderEnergy() {
    const h = S.sim.history;
    const a = S.snap.energy.actual;
    const e = S.snap.energy.expected;
    const tiles = [
      ['PUE (measured / model)', E.classify('pue', a.pue), a.pue.toFixed(3) + ' / ' + e.pue.toFixed(3)],
      ['WUE', E.classify('wue', a.wue), a.wue.toFixed(3) + ' L/kWh'],
      ['Chiller-free share', E.classify('free_cooling', S.snap.energy.freeCoolingShare), S.snap.energy.freeCoolingShare.toFixed(0) + ' %'],
      ['Cooling mode', a.chillerFrac > 0 || a.adiabaticOn ? 'MEDIUM' : 'LOW', a.mode],
      ['Make-up water', E.classify('makeup', S.snap.points['MU-LOOP'].value), S.snap.points['MU-LOOP'].value.toFixed(1) + ' L/h'],
      ['Adiabatic spray', E.classify('adiabatic', a.sprayLph), a.sprayLph.toFixed(0) + ' L/h'],
      ['Outdoor / IT load', 'LOW', S.snap.env.outdoorC.toFixed(1) + ' °C · ' + S.snap.env.itKW.toFixed(0) + ' kW'],
    ];
    $('energy-tiles').innerHTML = tiles.map(function (t) {
      return '<div class="kpi" style="border-top-color:' + L[t[1]].colour + '"><div class="k-lbl">' + esc(t[0]) + '</div><div class="k-val small" style="color:' + L[t[1]].colour + '">' + esc(t[2]) + '</div></div>';
    }).join('');
    E.lineChart($('chart-pue'), {
      series: [
        { points: h.map(function (s) { return [s.t, s.energy.actual.pue]; }), colour: '#5ec2ff', label: 'PUE measured' },
        { points: h.map(function (s) { return [s.t, s.energy.expected.pue]; }), colour: '#c9d1d9', label: 'PUE expected (twin model)', dash: '6 4', width: 1.4 },
      ],
      hLines: [{ y: E.DIM.pue.bands[0], colour: L.MEDIUM.colour, label: 'Medium' }, { y: E.DIM.pue.bands[1], colour: L.HIGH.colour, label: 'High' }],
      xFormat: relTime, yDigits: 3,
    });
    E.lineChart($('chart-water'), {
      series: [
        { points: h.map(function (s) { return [s.t, s.energy.actual.wue]; }), colour: '#4fd1c5', label: 'WUE (L/kWh)' },
        { points: h.map(function (s) { return [s.t, s.points['MU-LOOP'].value / 1000]; }), colour: '#b794f4', label: 'Make-up (m³/h)', dash: '4 3' },
      ],
      hLines: [{ y: E.DIM.wue.bands[0], colour: L.MEDIUM.colour, label: 'WUE Medium' }, { y: E.DIM.wue.bands[1], colour: L.HIGH.colour, label: 'WUE High' }],
      xFormat: relTime, yDigits: 3, yMin: 0,
    });
    E.lineChart($('chart-temp'), {
      series: [
        { points: h.map(function (s) { return [s.t, s.env.outdoorC]; }), colour: '#f6ad55', label: 'Outdoor' },
        { points: h.map(function (s) { return [s.t, s.energy.actual.leavingC]; }), colour: '#5ec2ff', label: 'Dry-cooler leaving' },
        { points: h.map(function (s) { return [s.t, s.energy.actual.supplyC - E.PLANT.hxMarginC]; }), colour: '#e0453a', label: 'Free-cooling limit', dash: '6 4', width: 1.2 },
      ],
      xFormat: relTime, yDigits: 0, yUnit: '°C',
    });
  }

  function renderWhatIf() {
    const out = +$('wi-out').value;
    const it = +$('wi-it').value;
    const sup = +$('wi-sup').value;
    const app = +$('wi-app').value;
    $('wi-out-v').textContent = out + ' °C';
    $('wi-it-v').textContent = it + ' kW';
    $('wi-sup-v').textContent = sup + ' °C';
    $('wi-app-v').textContent = app + ' °C';
    const base = { outdoorC: out, itKW: it, supplyC: sup, approachC: app };
    const dry = E.energyModel(Object.assign({}, base, { allowAdiabatic: false }));
    const wet = E.energyModel(Object.assign({}, base, { allowAdiabatic: true }));
    const card = function (title, r, policy) {
      const lvP = E.classify('pue', r.pue);
      const lvW = E.classify('wue', r.wue);
      return '<div class="wi-card"><div class="wi-t">' + title + '</div><div class="hint">' + esc(policy) + '</div>' +
        '<div>Mode: <b>' + esc(r.mode) + '</b></div>' +
        '<div>PUE <b style="color:' + L[lvP].colour + '">' + r.pue.toFixed(3) + '</b> · chiller load ' + (r.chillerFrac * 100).toFixed(0) + ' %</div>' +
        '<div>Water <b style="color:' + L[lvW].colour + '">' + (r.waterLph * 24 / 1000).toFixed(1) + ' m³/day</b> · WUE ' + r.wue.toFixed(3) + '</div>' +
        '<div>Cooling power ' + r.coolingKW.toFixed(0) + ' kW</div></div>';
    };
    const dE = (dry.coolingKW - wet.coolingKW) * 24;
    const dW = wet.waterLph * 24 / 1000;
    $('whatif-out').innerHTML = card('Zero-water policy', dry, 'Dry coolers + trim chiller, no spray') +
      card('Adiabatic assist allowed', wet, 'Spray water when the chiller would be needed') +
      '<div class="wi-trade">' + (dW > 0 ? 'Trade-off: spraying saves <b>' + dE.toFixed(0) + ' kWh/day</b> of cooling energy but uses <b>' + dW.toFixed(1) + ' m³/day</b> of water.'
        : 'At these conditions the dry coolers manage alone: no trade-off, zero water and no chiller penalty.') + '</div>';

    // 24-hour projection around the chosen temperature (±7 °C daily swing).
    const pd = [];
    const pw = [];
    for (let hr = 0; hr <= 24; hr += 0.5) {
      const o = out + 7 * Math.sin((2 * Math.PI * (hr - 9)) / 24) - 7 * Math.sin((2 * Math.PI * 6) / 24);
      pd.push([hr, E.energyModel(Object.assign({}, base, { outdoorC: o })).pue]);
      pw.push([hr, E.energyModel(Object.assign({}, base, { outdoorC: o, allowAdiabatic: true })).pue]);
    }
    E.lineChart($('chart-whatif'), {
      series: [
        { points: pd, colour: '#5ec2ff', label: 'PUE over 24 h, zero water' },
        { points: pw, colour: '#4fd1c5', label: 'PUE with adiabatic spray', dash: '6 4' },
      ],
      hLines: [{ y: E.DIM.pue.bands[0], colour: L.MEDIUM.colour, label: 'Medium' }, { y: E.DIM.pue.bands[1], colour: L.HIGH.colour, label: 'High' }],
      xFormat: function (x) { return String(Math.round(x)).padStart(2, '0') + ':00'; }, yDigits: 3,
    });
  }

  // ------------------------------------------------------------ readiness
  function renderReadiness() {
    const z = S.zones;
    const panel = E.ZONES.map(function (zz) {
      const p = z[zz.id].panel;
      const lv = p.state === 'FIRE' ? 'CRITICAL' : p.state === 'NORMAL' ? 'LOW' : 'MEDIUM';
      return '<tr><td>' + esc(zz.label) + '</td><td>' + chip(lv, p.state === 'NORMAL' ? 'Normal' : p.state) + '</td><td class="hint">' + esc(p.state === 'NORMAL' ? '' : p.label) + '</td></tr>';
    }).join('');
    const asdLv = E.worstLevel(['AF-HA', 'AF-HB'].map(function (id) { return E.classify('asd_flow', S.snap.points[id].value); }));
    const supLv = E.classify('supp_pressure', S.snap.points['SP-SUPP'].value);
    const rows = [
      ['P1 Suppression ready', supLv, 'Cylinder pressure ' + S.snap.points['SP-SUPP'].value.toFixed(1) + ' %'],
      ['P2 Detection healthy', asdLv, 'Worst ASD airflow deviation ' + Math.max(S.snap.points['AF-HA'].value, S.snap.points['AF-HB'].value).toFixed(0) + ' %'],
      ['P3 Enclosure integrity', 'LOW', 'Gas-protected room doors closed (dummy, static)'],
      ['P4 Water/pre-action system', 'LOW', 'Pre-action pressure normal (dummy, static)'],
    ].map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + chip(r[1]) + '</td><td class="hint">' + esc(r[2]) + '</td></tr>'; }).join('');
    $('readiness').innerHTML = '<table class="tbl compact">' + panel + '</table><div class="al-sec">Fire-protection readiness</div><table class="tbl compact">' + rows + '</table>' +
      '<p class="hint">🔒 The twin never controls, silences or resets the certified fire systems.</p>';
  }

  // ----------------------------------------------------------- dimensions
  function renderDimensions() {
    $('levels-table').innerHTML = '<table class="tbl"><tr><th>Level</th><th>RAG</th><th>Meaning</th><th>Expected response</th></tr>' +
      ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'].map(function (k) {
        const l = L[k];
        return '<tr><td>' + chip(k) + '</td><td>' + l.rag + '</td><td>' + esc(l.meaning) + '</td><td>' + esc(l.action) + '</td></tr>';
      }).join('') + '</table><p class="hint">A zone takes the worst of: its dimensions\' bands, its SOM region, "Unknown" if the pattern is unfamiliar, and the certified panel state (Fire → Critical; pre-alarm or fault → at least Medium).</p>';
    let html = '';
    Object.keys(E.DOMAINS).forEach(function (dom) {
      const dims = E.DIMENSIONS.filter(function (d) { return d.domain === dom; });
      if (!dims.length) return;
      html += '<h3><span class="prio ' + (E.DOMAINS[dom].priority === 'P1' ? 'p1' : 'p2') + '">' + E.DOMAINS[dom].priority + '</span>' + esc(E.DOMAINS[dom].label) + '</h3>';
      html += '<table class="tbl"><tr><th>Dimension</th><th>Basis</th><th>' + chip('LOW') + '</th><th>' + chip('MEDIUM') + '</th><th>' + chip('HIGH') + '</th><th>What it means for us</th><th>Source of band</th></tr>' +
        dims.map(function (d) {
          const b = E.bandText(d);
          return '<tr><td><b>' + esc(d.label) + '</b><div class="mono hint">' + d.key + '</div></td><td>' + (d.basis === 'residual' ? 'Residual (measured − model)' : 'Measured value') +
            '</td><td>' + esc(b.LOW) + '</td><td>' + esc(b.MEDIUM) + '</td><td>' + esc(b.HIGH) + '</td><td>' + esc(d.plain) + '</td><td class="hint">' + esc(d.source) + '</td></tr>';
        }).join('') + '</table>';
    });
    $('dims-table').innerHTML = html;
    $('features-table').innerHTML = Object.keys(E.SOMS).map(function (k) {
      const m = E.SOMS[k];
      return '<h3>' + esc(m.title) + '</h3><table class="tbl"><tr><th>Feature</th><th>Centre (typical)</th><th>Scale (= 1 notable step)</th><th>Signal</th></tr>' +
        m.features.map(function (f) {
          const d = E.DIM[f.key];
          const ex = E.EXTRA_SIGNALS[f.key];
          return '<tr><td>' + esc(f.label) + '</td><td>' + f.centre + '</td><td>' + f.scale + '</td><td class="hint">' + esc(d ? d.plain : ex ? ex.plain : 'Derived from the cooling-plant physics model') + '</td></tr>';
        }).join('') + '</table>';
    }).join('');
  }

  function renderLegend() {
    $('twin-legend').innerHTML = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'].map(function (k) {
      return '<span class="lg"><i style="background:' + L[k].colour + '"></i>' + L[k].label + ' (' + L[k].rag + ')</span>';
    }).join('') + '<span class="lg"><i class="dot"></i>sensor point</span><span class="lg"><i class="ring"></i>twin-located hazard</span>' +
      '<span class="lg"><i class="pipe-i"></i>liquid loop (speed = flow)</span>';
  }

  // ---------------------------------------------------------------- render
  function activeTab() { return document.querySelector('.tabs button.active').getAttribute('data-tab'); }

  function renderAll() {
    renderKpis();
    const tab = activeTab();
    if (tab === 'twin') {
      S.twin.update(S.snap, S.zones, S.sim.sc, S.selection);
      renderLead();
      renderAlerts();
      renderDetail();
      renderSOMs(false);
      renderReadiness();
    } else if (tab === 'som') {
      renderSOMs(true);
    } else if (tab === 'energy') {
      renderEnergy();
    }
  }

  function setPlaying(on) {
    S.playing = on;
    $('btn-play').textContent = on ? '⏸' : '▶';
    clearInterval(S.timer);
    if (on) S.timer = setInterval(tick, 1000 / +$('speed').value);
  }

  // ----------------------------------------------------------------- init
  function init() {
    S.models = { fire: E.buildSOM('fire'), cooling: E.buildSOM('cooling') };
    S.sim = new E.Simulator(42);
    S.twin = new E.Twin($('twin'), function (sel) { S.selection = sel; renderAll(); });
    S.twin.onHover = function (ev, pid) {
      const tt = $('tooltip');
      if (!ev) { tt.style.display = 'none'; return; }
      const p = E.POINT[pid];
      const s = S.snap.points[pid];
      const lv = E.DIM[p.metric] ? E.classify(p.metric, s.value) : 'LOW';
      tt.innerHTML = '<b>' + esc(p.label) + '</b><br>' + (E.DIM[p.metric] ? fmt(p.metric, s.value) : s.value.toFixed(2)) + ' ' + chip(lv);
      tt.style.display = 'block';
      tt.style.left = (ev.clientX + 14) + 'px';
      tt.style.top = (ev.clientY + 10) + 'px';
    };

    const groups = { 'P1': 'P1 · Fire safety, battery & fire-related detection', 'P2': 'P2 · Energy efficiency & zero-water cooling', '—': 'Baseline' };
    $('scenario').innerHTML = ['P1', 'P2', '—'].map(function (g) {
      return '<optgroup label="' + groups[g] + '">' + E.SCENARIOS.filter(function (s) { return s.priority === g; }).map(function (s) {
        return '<option value="' + s.id + '">' + esc(s.title) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    $('scenario').value = 'battery';
    $('scenario').addEventListener('change', function () { loadScenario(this.value); setPlaying(true); });
    $('btn-play').addEventListener('click', function () { setPlaying(!S.playing); });
    $('btn-step').addEventListener('click', function () { setPlaying(false); tick(); });
    $('btn-reset').addEventListener('click', function () { loadScenario($('scenario').value); setPlaying(true); });
    $('speed').addEventListener('change', function () { if (S.playing) setPlaying(true); });

    $('tabs').addEventListener('click', function (ev) {
      const b = ev.target.closest('button');
      if (!b) return;
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x.id === 'tab-' + b.getAttribute('data-tab')); });
      if (b.getAttribute('data-tab') === 'energy') renderWhatIf();
      renderAll();
    });
    $('som-mode').addEventListener('click', function (ev) {
      const b = ev.target.closest('button');
      if (!b) return;
      S.somMode = b.getAttribute('data-mode');
      document.querySelectorAll('#som-mode button').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderSOMs(true);
    });
    $('som-smooth').addEventListener('click', function (ev) {
      const b = ev.target.closest('button');
      if (!b) return;
      S.smoothWindow = +b.getAttribute('data-window');
      document.querySelectorAll('#som-smooth button').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderAll();
    });
    $('som-fire').addEventListener('mousemove', function (ev) { somHover(ev, 'fire'); });
    $('som-cooling').addEventListener('mousemove', function (ev) { somHover(ev, 'cooling'); });
    $('alerts').addEventListener('click', function (ev) {
      const a = ev.target.closest('.alert');
      if (!a) return;
      S.openAlert = S.openAlert === a.getAttribute('data-id') ? null : a.getAttribute('data-id');
      renderAlerts();
    });
    $('detail-info').addEventListener('click', function (ev) {
      const b = ev.target.closest('button[data-pt]');
      if (!b) return;
      S.selection = Object.assign({}, S.selection, { point: b.getAttribute('data-pt') });
      renderAll();
    });
    ['wi-out', 'wi-it', 'wi-sup', 'wi-app'].forEach(function (id) { $(id).addEventListener('input', renderWhatIf); });

    renderSOMLegends();
    renderDimensions();
    renderLegend();
    // Deep links: index.html#scenario=smoulder&tab=som
    const hash = new URLSearchParams(location.hash.slice(1));
    const scId = E.SCENARIO[hash.get('scenario')] ? hash.get('scenario') : 'battery';
    $('scenario').value = scId;
    loadScenario(scId);
    renderWhatIf();
    const tabBtn = document.querySelector('.tabs button[data-tab="' + hash.get('tab') + '"]');
    if (tabBtn) tabBtn.click();
    setPlaying(true);
  }

  E.app = S;
  // Small control API for tests, demos and future integration.
  E.api = {
    loadScenario: loadScenario, tick: tick, setPlaying: setPlaying,
    setSmoothing: function (window) {
      const b = document.querySelector('#som-smooth button[data-window="' + window + '"]');
      if (b) b.click();
    },
    showTab: function (name) { const b = document.querySelector('.tabs button[data-tab="' + name + '"]'); if (b) b.click(); },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(globalThis.EMBER = globalThis.EMBER || {});
