// Headless check of the EMBER UI logic (no browser needed):
//   node tests/check_scenarios.js
// Runs every scenario twice: SOM on raw features, then on smoothed features.
// For every scenario: the SOM class reached in the scenario zone, when the twin
// first went Medium / High, when the certified system acted, and the lead time.
// Exits non-zero if a scenario misses its expected SOM class, if the twin does
// not warn before the certified system, or if "normal" raises anything.
'use strict';
const path = require('path');
['config', 'som', 'scenarios', 'engine', 'sim'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f + '.js'));
});
const E = globalThis.EMBER;
const t0 = Date.now();
const models = { fire: E.buildSOM('fire'), cooling: E.buildSOM('cooling') };
console.log('SOM training: ' + (Date.now() - t0) + ' ms');
Object.keys(models).forEach(function (k) {
  const m = models[k];
  const counts = {};
  m.som.labels.forEach(function (l) { const id = m.meta.classes[l].id; counts[id] = (counts[id] || 0) + 1; });
  console.log('  ' + k + ' regions (neurons): ' + JSON.stringify(counts) + ' qeThr=' + m.som.qeThreshold.toFixed(2));
});

let failures = 0;
[1, E.SMOOTH_MAX].forEach(function (smoothWindow) {
console.log('\n==== SOM features: ' + (smoothWindow > 1 ? 'smoothed, mean of last ' + smoothWindow + ' ticks' : 'raw') + ' ====');
E.SCENARIOS.forEach(function (sc) {
  const opts = { smoothWindow: smoothWindow, buffers: {} };
  const sim = new E.Simulator(42);
  sim.setScenario(sc.id);
  const firstLevel = {};
  const classesSeen = {};
  let warmupAlerts = [];
  // re-evaluate warm-up history to catch false alarms before t=0
  sim.history.forEach(function (snap) {
    const z = E.evaluate(snap, models, opts);
    Object.keys(z).forEach(function (id) { if (z[id].level !== 'LOW') warmupAlerts.push(id + ':' + z[id].level + ':' + z[id].issue); });
  });
  let normalAlerts = [];
  while (!sim.isDone) {
    const snap = sim.step();
    const zones = E.evaluate(snap, models, opts);
    Object.keys(zones).forEach(function (id) {
      const z = zones[id];
      if (sc.id === 'normal' && z.level !== 'LOW') normalAlerts.push(E.formatClock(snap.t) + ' ' + id + ' ' + z.level + ' ' + z.issue);
      if (sc.zone && id !== sc.zone && (sc.alsoAffects || []).indexOf(id) < 0) {
        if (z.level !== 'LOW') normalAlerts.push('other-zone ' + id + ' ' + z.level + ' ' + z.issue);
        return;
      }
      if (id !== sc.zone) return;
      ['MEDIUM', 'HIGH', 'UNKNOWN'].forEach(function (lv) {
        if (firstLevel[id + lv] === undefined && E.LEVELS[z.level].rank >= E.LEVELS[lv].rank && (lv !== 'UNKNOWN' || z.level === 'UNKNOWN')) firstLevel[id + lv] = snap.t;
      });
      Object.keys(z.som).forEach(function (k) { classesSeen[z.som[k].classId] = true; });
    });
  }
  const cert = sc.certified[0];
  const med = sc.zone ? firstLevel[sc.zone + 'MEDIUM'] : undefined;
  const high = sc.zone ? firstLevel[sc.zone + 'HIGH'] : undefined;
  const okClass = !sc.expectClass || classesSeen[sc.expectClass];
  const lead = cert && med !== undefined ? cert.atMin - med : null;
  const okLead = !cert || (lead !== null && lead > 0);
  const okNormal = normalAlerts.length === 0 && warmupAlerts.length === 0;
  if (!okClass || !okLead || !okNormal) failures++;
  console.log('\n[' + (okClass && okLead && okNormal ? 'OK  ' : 'FAIL') + '] ' + sc.id + ' (' + sc.zone + ')');
  console.log('  SOM classes seen: ' + Object.keys(classesSeen).join(', ') + (sc.expectClass ? '  expected: ' + sc.expectClass : ''));
  console.log('  first Medium: ' + (med === undefined ? '-' : E.formatDuration(med)) + '  first High: ' + (high === undefined ? '-' : E.formatDuration(high)) +
    (cert ? '  certified ' + cert.state + ' at ' + E.formatDuration(cert.atMin) + '  lead: ' + (lead === null ? 'none' : E.formatDuration(lead)) : ''));
  if (warmupAlerts.length) console.log('  warm-up false alerts: ' + warmupAlerts.length + ' e.g. ' + warmupAlerts.slice(0, 3).join(' | '));
  if (normalAlerts.length) console.log('  unexpected alerts: ' + normalAlerts.length + ' e.g. ' + normalAlerts.slice(0, 4).join(' | '));
});
});
console.log('\n' + (failures ? failures + ' scenario(s) FAILED' : 'All scenarios OK'));
process.exit(failures ? 1 : 0);
