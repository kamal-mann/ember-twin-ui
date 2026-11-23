/*
 * EMBER UI: simulator (dummy data source).
 *
 * Produces one snapshot per tick: every sensor point (measured, expected,
 * classified value), the cooling plant state (actual vs expected from the
 * physics model) and the certified panel states (read-only mirror).
 *
 * To use real data later, replace this class with a feed that returns the
 * same snapshot shape; engine.js and the UI stay unchanged.
 */
(function (E) {
  'use strict';

  const START_HOUR = 8;
  const NOMINAL_IT_KW = 800;

  // Normal background for value-basis signals: expected level, noise, floor.
  const BASE = {
    asd_obs: { e: 0.01, sd: 0.004, min: 0 },
    co: { e: 1.5, sd: 0.4, min: 0 },
    particle_ratio: { e: 1, sd: 0.12, min: 0.05 },
    h2: { e: 0.5, sd: 0.2, min: 0 },
    voc: { e: 0.3, sd: 0.12, min: 0 },
    cell_imb: { e: 12, sd: 2, min: 0 },
    joint_dt: { e: 0.8, sd: 0.3, min: 0 },
    refrig: { e: 0.3, sd: 0.15, min: 0 },
    asd_flow: { e: 0, sd: 1.5, abs: true },
    supp_pressure: { e: 99.5, sd: 0.08 },
  };

  // What the sensor reads (for charts), where it differs from the dimension.
  E.RAW_UNITS = {
    cell_temp: { label: 'Cell temperature', unit: '°C' },
    dc_approach: { label: 'Dry-cooler approach', unit: '°C' },
    cdu_flow: { label: 'CDU flow', unit: 'L/min' },
  };

  class Simulator {
    constructor(seed) {
      this.seed = seed || 42;
      this.historyLen = 400;
    }

    setScenario(id) {
      this.sc = E.SCENARIO[id];
      this.rand = E.rng(this.seed);
      this.t = -this.sc.warmupTicks * this.sc.minutesPerTick;
      this.history = [];
      this.energyLog = [];
      this.last = null;
      for (let i = 0; i < this.sc.warmupTicks; i++) this.step();
    }

    get isDone() { return this.t > this.sc.durationMin; }

    env(t, effects) {
      const hour = START_HOUR + t / 60;
      const en = effects.energy || {};
      return {
        hour: hour,
        outdoorC: 14 + 7 * Math.sin((2 * Math.PI * (hour - 9)) / 24) + (en.outdoorDelta || 0),
        itKW: NOMINAL_IT_KW * (1 + 0.08 * Math.sin((2 * Math.PI * (hour - 8)) / 24)),
      };
    }

    noise(sd) { return sd * E.gauss(this.rand); }

    step() {
      const sc = this.sc;
      const t = this.t;
      const pre = this.env(t, {});
      const fx = sc.effects(t, pre) || {};
      const env = this.env(t, fx);
      const en = fx.energy || {};
      const dp = fx.points || {};
      const k = E.PLANT;

      const approachDelta = en.approachDelta || 0;
      const actual = E.energyModel({
        outdoorC: env.outdoorC, itKW: env.itKW, approachC: k.approachC + approachDelta,
        allowAdiabatic: !!en.allowAdiabatic, overcoolFrac: en.overcoolFrac || 0, makeupLph: en.makeupLph || 0,
      });
      const expected = E.energyModel({ outdoorC: env.outdoorC, itKW: env.itKW });

      const loadF = env.itKW / NOMINAL_IT_KW;
      const points = {};
      E.POINTS.forEach(function (p) {
        const delta = dp[p.id] || 0;
        let e;
        let m;
        let v;
        const b = BASE[p.metric];
        if (b) {
          e = b.e;
          m = e + this.noise(b.sd) + delta;
          if (b.abs) m = Math.abs(m);
          if (b.min !== undefined) m = Math.max(b.min, m);
          v = m;
        } else if (p.metric === 'cell_temp') {
          e = 24 + 1.5 * loadF;
          m = e + this.noise(0.3) + delta;
          v = m - e;
        } else if (p.metric === 'rack_inlet') {
          e = 24 + 3 * (loadF - 1) + (p.zone === 'HALL_B' ? 0.5 : 0);
          m = e + (en.rackDelta || 0) + this.noise(0.25) + delta;
          v = m;
        } else if (p.metric === 'cdu_flow') {
          e = 1200;
          m = 1200 * (en.pumpFlowFrac !== undefined ? en.pumpFlowFrac : 1) * (1 - (en.leakFlowFrac || 0)) + this.noise(6);
          v = ((m - e) / e) * 100;
        } else if (p.metric === 'dc_approach') {
          e = k.approachC;
          m = e + approachDelta + this.noise(0.15);
          v = m - e;
        } else if (p.metric === 'makeup') {
          e = 0;
          m = en.makeupLph ? Math.max(0, en.makeupLph + this.noise(0.3)) : Math.abs(this.noise(0.03));
          v = m;
        } else if (p.metric === 'adiabatic') {
          e = 0;
          m = actual.sprayLph;
          v = m;
        }
        points[p.id] = { measured: m, expected: e, value: v };
      }, this);

      this.energyLog.push({ t: t, free: actual.chillerFrac < 0.01 });
      while (this.energyLog.length && this.energyLog[0].t < t - 1440) this.energyLog.shift();
      const freeCoolingShare = (100 * this.energyLog.filter(function (x) { return x.free; }).length) / this.energyLog.length;

      const panel = {};
      const events = [];
      const prevT = this.last ? this.last.t : -Infinity;
      sc.certified.forEach(function (c) {
        if (t >= c.atMin) panel[c.zone] = { state: c.state, label: c.label };
        if (c.atMin > prevT && c.atMin <= t) events.push(c);
      });

      const snap = {
        t: t, hour: env.hour, env: env, points: points, panel: panel, events: events,
        energy: { actual: actual, expected: expected, freeCoolingShare: freeCoolingShare },
        permit: sc.permit && t >= 0 ? sc.permit : null,
      };
      this.history.push(snap);
      if (this.history.length > this.historyLen) this.history.shift();
      this.last = snap;
      this.t += sc.minutesPerTick;
      return snap;
    }
  }
  E.Simulator = Simulator;

  E.formatClock = function (t) {
    const totalMin = START_HOUR * 60 + t;
    const day = Math.floor(totalMin / 1440) + 1;
    const mins = ((totalMin % 1440) + 1440) % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(Math.floor(mins % 60)).padStart(2, '0');
    return 'Day ' + day + ' ' + hh + ':' + mm;
  };

  E.formatDuration = function (min) {
    const a = Math.abs(min);
    if (a < 60) return (Math.round(a * 10) / 10) + ' min';
    if (a < 1440) return (Math.round((a / 60) * 10) / 10) + ' h';
    return (Math.round((a / 1440) * 10) / 10) + ' days';
  };
})(globalThis.EMBER = globalThis.EMBER || {});
