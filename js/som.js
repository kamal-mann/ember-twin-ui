/*
 * EMBER UI: hexagonal Self-Organizing Map (SOM).
 *
 * A SOM is a grid of "neurons", each holding a weight vector with the same
 * features as the input. Training pulls the best-matching neuron and its grid
 * neighbours towards each sample, so similar situations end up in nearby
 * cells. After training, each neuron is labelled with the class of the
 * training samples it wins most often, which gives the coloured regions.
 *
 * Hexagonal lattice ("odd-r" offset layout, pointy-top hexagons):
 *   - neuron (col, row) sits at lattice position x = col + 0.5 * (row odd),
 *     y = row * sqrt(3)/2, so every neuron has 6 equidistant neighbours;
 *   - the neighbourhood function uses Euclidean distance on those positions,
 *     the same convention as MiniSom's topology='hexagonal'.
 */
(function (E) {
  'use strict';

  // Seeded random numbers so the map is identical on every page load.
  E.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  E.gauss = function (rand) {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  const SQRT3_2 = Math.sqrt(3) / 2;

  class HexSOM {
    constructor(cols, rows, dim, seed) {
      this.cols = cols;
      this.rows = rows;
      this.dim = dim;
      this.n = cols * rows;
      this.w = new Float64Array(this.n * dim);
      this.rand = E.rng(seed);
      this.pos = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this.pos.push({ c: c, r: r, x: c + 0.5 * (r & 1), y: r * SQRT3_2 });
        }
      }
      this.labels = new Int16Array(this.n).fill(-1);
      this.hits = new Uint32Array(this.n);
      this.qeThreshold = Infinity;
    }

    neighbours(i) {
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      const odd = r & 1;
      const cand = odd
        ? [[c - 1, r], [c + 1, r], [c, r - 1], [c + 1, r - 1], [c, r + 1], [c + 1, r + 1]]
        : [[c - 1, r], [c + 1, r], [c - 1, r - 1], [c, r - 1], [c - 1, r + 1], [c, r + 1]];
      const out = [];
      cand.forEach(function (p) {
        if (p[0] >= 0 && p[0] < this.cols && p[1] >= 0 && p[1] < this.rows) out.push(p[1] * this.cols + p[0]);
      }, this);
      return out;
    }

    dist2(x, i) {
      let s = 0;
      const o = i * this.dim;
      for (let k = 0; k < this.dim; k++) {
        const d = x[k] - this.w[o + k];
        s += d * d;
      }
      return s;
    }

    bmu(x) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < this.n; i++) {
        const d = this.dist2(x, i);
        if (d < bestD) { bestD = d; best = i; }
      }
      return { index: best, qe: Math.sqrt(bestD) };
    }

    train(data, iterations) {
      const T = iterations;
      const sigma0 = Math.max(this.cols, this.rows) / 2.5;
      const sigma1 = 0.6;
      const lr0 = 0.5;
      const lr1 = 0.02;
      for (let i = 0; i < this.n; i++) {
        const s = data[Math.floor(this.rand() * data.length)];
        for (let k = 0; k < this.dim; k++) this.w[i * this.dim + k] = s[k] + 0.05 * E.gauss(this.rand);
      }
      for (let t = 0; t < T; t++) {
        const frac = t / T;
        const sigma = sigma0 * Math.pow(sigma1 / sigma0, frac);
        const lr = lr0 * Math.pow(lr1 / lr0, frac);
        const x = data[Math.floor(this.rand() * data.length)];
        const b = this.pos[this.bmu(x).index];
        const twoS2 = 2 * sigma * sigma;
        for (let j = 0; j < this.n; j++) {
          const p = this.pos[j];
          const d2 = (p.x - b.x) * (p.x - b.x) + (p.y - b.y) * (p.y - b.y);
          const h = Math.exp(-d2 / twoS2);
          if (h < 1e-4) continue;
          const o = j * this.dim;
          for (let k = 0; k < this.dim; k++) this.w[o + k] += lr * h * (x[k] - this.w[o + k]);
        }
      }
    }

    // Majority label per neuron; neurons that win no samples take the label of
    // the nearest labelled neuron in weight space, so every cell gets a colour.
    label(data, y, nClasses) {
      const votes = [];
      for (let i = 0; i < this.n; i++) votes.push(new Uint32Array(nClasses));
      const qes = [];
      this.hits.fill(0);
      for (let s = 0; s < data.length; s++) {
        const b = this.bmu(data[s]);
        votes[b.index][y[s]]++;
        this.hits[b.index]++;
        qes.push(b.qe);
      }
      for (let i = 0; i < this.n; i++) {
        let best = -1;
        let bestV = 0;
        for (let c = 0; c < nClasses; c++) if (votes[i][c] > bestV) { bestV = votes[i][c]; best = c; }
        this.labels[i] = best;
      }
      for (let i = 0; i < this.n; i++) {
        if (this.labels[i] >= 0) continue;
        let best = -1;
        let bestD = Infinity;
        const wi = this.w.subarray(i * this.dim, (i + 1) * this.dim);
        for (let j = 0; j < this.n; j++) {
          if (j === i || this.hits[j] === 0) continue;
          const d = this.dist2(wi, j);
          if (d < bestD) { bestD = d; best = j; }
        }
        this.labels[i] = best >= 0 ? this.labels[best] : 0;
      }
      // Novelty threshold: 99th percentile of training quantization error.
      qes.sort(function (a, b) { return a - b; });
      this.qeThreshold = qes[Math.floor(qes.length * 0.99)] * 1.5;
    }

    // U-matrix: mean weight distance to the grid neighbours (0..1).
    umatrix() {
      const u = new Float64Array(this.n);
      let max = 0;
      for (let i = 0; i < this.n; i++) {
        const nb = this.neighbours(i);
        const wi = this.w.subarray(i * this.dim, (i + 1) * this.dim);
        let s = 0;
        nb.forEach(function (j) { s += Math.sqrt(this.dist2(wi, j)); }, this);
        u[i] = s / nb.length;
        if (u[i] > max) max = u[i];
      }
      for (let i = 0; i < this.n; i++) u[i] /= max || 1;
      return u;
    }
  }
  E.HexSOM = HexSOM;

  // Builds and trains one map from its config (E.SOMS[key]).
  E.buildSOM = function (key) {
    const meta = E.SOMS[key];
    const rand = E.rng(meta.seed * 97 + 13);
    const data = [];
    const y = [];
    meta.classes.forEach(function (cls, ci) {
      for (let s = 0; s < cls.n; s++) {
        data.push(meta.features.map(function (f) {
          return (cls.c[f.key] || 0) + cls.sd * E.gauss(rand);
        }));
        y.push(ci);
      }
    });
    const som = new HexSOM(meta.cols, meta.rows, meta.features.length, meta.seed);
    som.train(data, 7000);
    som.label(data, y, meta.classes.length);
    som.umat = som.umatrix();
    return { key: key, meta: meta, som: som };
  };

  // Turns raw signal values into the scaled feature vector the map expects.
  E.toFeatures = function (meta, values) {
    return meta.features.map(function (f) {
      const v = values[f.key];
      return v === undefined || v === null || isNaN(v) ? 0 : (v - f.centre) / f.scale;
    });
  };

  // ------------------------------------------------------------- rendering
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = function (c) { return Math.max(0, Math.min(255, Math.round(c * (1 - amount)))); };
    const r = f((n >> 16) & 255);
    const g = f((n >> 8) & 255);
    const b = f(n & 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  E.classColour = function (meta, ci) {
    const cls = meta.classes[ci];
    const sameLevel = meta.classes.filter(function (c) { return c.level === cls.level; });
    const k = sameLevel.indexOf(cls);
    return shade(E.LEVELS[cls.level].colour, k * 0.16);
  };

  function hexGeom(model, r) {
    const w = Math.sqrt(3) * r;
    const pad = 8;
    const centres = model.som.pos.map(function (p) {
      return { x: pad + w / 2 + p.c * w + (p.r & 1) * (w / 2), y: pad + r + p.r * 1.5 * r };
    });
    return {
      r: r, w: w, centres: centres,
      width: pad * 2 + w * model.som.cols + w / 2,
      height: pad * 2 + 2 * r + (model.som.rows - 1) * 1.5 * r,
    };
  }

  function hexPoints(cx, cy, r) {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 30);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  function splitLabel(text) {
    const words = text.split(' ');
    if (words.length < 3) return [text];
    let best = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }

  // opts: { mode: 'regions'|'umatrix'|'hits', r, markers: [{label, index, trail, colour}], showLabels,
  //         dimUnoccupied: fade regions that no marker is in, so only live regions show full colour }
  E.renderSOM = function (svg, model, opts) {
    const r = opts.r || 16;
    const g = hexGeom(model, r);
    const som = model.som;
    const meta = model.meta;
    const parts = [];
    const maxHits = Math.max.apply(null, Array.from(som.hits));
    const occupied = {};
    (opts.markers || []).forEach(function (m) { occupied[som.labels[m.index]] = true; });
    const isDim = function (ci) { return opts.dimUnoccupied && opts.mode === 'regions' && !occupied[ci]; };
    svg.setAttribute('viewBox', '0 0 ' + g.width.toFixed(1) + ' ' + g.height.toFixed(1));

    for (let i = 0; i < som.n; i++) {
      const c = g.centres[i];
      const ci = som.labels[i];
      let fill = E.classColour(meta, ci);
      let opacity = isDim(ci) ? 0.3 : 1;
      if (opts.mode === 'umatrix') {
        const v = Math.round(30 + som.umat[i] * 200);
        fill = 'rgb(' + v + ',' + v + ',' + Math.min(255, v + 20) + ')';
      } else if (opts.mode === 'hits') {
        opacity = som.hits[i] ? 0.25 + 0.75 * Math.log(1 + som.hits[i]) / Math.log(1 + maxHits) : 0.08;
      }
      const pts = hexPoints(c.x, c.y, r * 0.97).map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      parts.push('<polygon class="hex" data-i="' + i + '" points="' + pts + '" fill="' + fill +
        '" fill-opacity="' + opacity.toFixed(2) + '"/>');
    }

    // Region borders: draw the shared edge wherever neighbouring labels differ.
    for (let i = 0; i < som.n; i++) {
      som.neighbours(i).forEach(function (j) {
        if (j < i || som.labels[i] === som.labels[j]) return;
        const a = g.centres[i];
        const b = g.centres[j];
        const verts = hexPoints(a.x, a.y, r).map(function (p) {
          return { p: p, d: (p[0] - b.x) * (p[0] - b.x) + (p[1] - b.y) * (p[1] - b.y) };
        }).sort(function (u, v) { return u.d - v.d; });
        parts.push('<line class="region-border" x1="' + verts[0].p[0].toFixed(1) + '" y1="' + verts[0].p[1].toFixed(1) +
          '" x2="' + verts[1].p[0].toFixed(1) + '" y2="' + verts[1].p[1].toFixed(1) + '"/>');
      });
    }

    if (opts.showLabels !== false) {
      meta.classes.forEach(function (cls, ci) {
        const idx = [];
        for (let i = 0; i < som.n; i++) if (som.labels[i] === ci) idx.push(i);
        if (!idx.length) return;
        const mx = idx.reduce(function (s, i) { return s + g.centres[i].x; }, 0) / idx.length;
        const my = idx.reduce(function (s, i) { return s + g.centres[i].y; }, 0) / idx.length;
        let best = idx[0];
        let bestD = Infinity;
        idx.forEach(function (i) {
          const d = (g.centres[i].x - mx) * (g.centres[i].x - mx) + (g.centres[i].y - my) * (g.centres[i].y - my);
          if (d < bestD) { bestD = d; best = i; }
        });
        const lines = splitLabel(cls.label);
        const c = g.centres[best];
        const fs = Math.max(8, r * 0.62);
        const tspans = lines.map(function (ln, k) {
          return '<tspan x="' + c.x.toFixed(1) + '" dy="' + (k === 0 ? (-(lines.length - 1) * fs * 0.55).toFixed(1) : (fs * 1.1).toFixed(1)) + '">' + ln + '</tspan>';
        }).join('');
        parts.push('<text class="region-label' + (isDim(ci) ? ' dim' : '') + '" style="font-size:' + fs.toFixed(1) + 'px" x="' + c.x.toFixed(1) + '" y="' + (c.y + fs * 0.35).toFixed(1) + '">' + tspans + '</text>');
      });
    }

    // Live markers: one per zone, with the recent trajectory.
    const byIndex = {};
    (opts.markers || []).forEach(function (m) {
      if (m.trail && m.trail.length > 1) {
        const pts = m.trail.map(function (i) { return g.centres[i].x.toFixed(1) + ',' + g.centres[i].y.toFixed(1); }).join(' ');
        parts.push('<polyline class="trail" points="' + pts + '" stroke="' + m.colour + '"/>');
      }
      (byIndex[m.index] = byIndex[m.index] || []).push(m);
    });
    Object.keys(byIndex).forEach(function (idx) {
      const list = byIndex[idx];
      const c = g.centres[idx];
      list.forEach(function (m, k) {
        const ang = (2 * Math.PI * k) / list.length;
        const off = list.length > 1 ? r * 0.45 : 0;
        const x = c.x + off * Math.cos(ang);
        const y = c.y + off * Math.sin(ang);
        parts.push('<g class="marker' + (m.pulse ? ' pulse' : '') + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r * 0.42).toFixed(1) +
          '" fill="' + m.colour + '"/><text x="' + x.toFixed(1) + '" y="' + (y - r * 0.6).toFixed(1) + '">' + m.label + '</text></g>');
      });
    });

    svg.innerHTML = parts.join('');
    svg._somGeom = g;
  };
})(globalThis.EMBER = globalThis.EMBER || {});
