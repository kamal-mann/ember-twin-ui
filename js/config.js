/*
 * EMBER UI: configuration (the single source of truth for the UI).
 *
 * Everything the dashboard shows is defined here: severity levels, dimensions
 * (metrics with Low/Medium/High bands), zones, assets, sensor points, SOM
 * features and SOM classes. Replace the simulator with a real data feed later
 * and keep this file: the UI only depends on these definitions.
 *
 * All thresholds are ILLUSTRATIVE. Real values must come from the site's fire
 * strategy, manufacturers' limits, the insurer and the relevant standards.
 */
(function (E) {
  'use strict';

  // ---------------------------------------------------------------- levels
  // One severity scale for every dimension, every zone and every SOM region.
  E.LEVELS = {
    LOW: {
      key: 'LOW', label: 'Low', rag: 'Green', rank: 0, colour: '#2fa866',
      meaning: 'Normal for the current load and weather.',
      action: 'No action.',
    },
    UNKNOWN: {
      key: 'UNKNOWN', label: 'Unknown', rag: 'Grey', rank: 0.5, colour: '#8a96a3',
      meaning: 'Sensor fault, stale data or a pattern the twin has not seen before.',
      action: 'Check the sensor or data path; do not treat as a hazard or as all-clear.',
    },
    MEDIUM: {
      key: 'MEDIUM', label: 'Medium', rag: 'Amber', rank: 1, colour: '#e3a008',
      meaning: 'Precursor, drift or inefficiency developing.',
      action: 'Investigate within the shift; raise a ticket.',
    },
    HIGH: {
      key: 'HIGH', label: 'High', rag: 'Red', rank: 2, colour: '#e0453a',
      meaning: 'Hazard or serious loss developing; certified alarm likely if it continues.',
      action: 'Respond now: duty engineer on site, follow the procedure.',
    },
    CRITICAL: {
      key: 'CRITICAL', label: 'Critical', rag: 'Red (flashing)', rank: 3, colour: '#9b1d4a',
      meaning: 'The certified fire system has reached a stage (read-only mirror).',
      action: 'Follow the fire procedure. The twin only informs; it never controls fire systems.',
    },
  };

  E.worstLevel = function (keys) {
    let worst = 'LOW';
    keys.forEach(function (k) {
      if (k && E.LEVELS[k].rank > E.LEVELS[worst].rank) worst = k;
    });
    return worst;
  };

  // ------------------------------------------------------------ dimensions
  // basis: 'value' = the measured value is classified;
  //        'residual' = measured minus physics-model expected is classified.
  // direction: 'up' = higher is worse (bands = [lowMax, mediumMax]);
  //            'down' = lower is worse (bands = [lowMin, mediumMin]).
  E.DOMAINS = {
    fire: { label: 'Fire & smoke', priority: 'P1' },
    battery: { label: 'Battery', priority: 'P1' },
    electrical: { label: 'Electrical', priority: 'P1' },
    readiness: { label: 'Fire-protection readiness', priority: 'P1' },
    cooling: { label: 'Cooling', priority: 'P2' },
    energy: { label: 'Energy efficiency', priority: 'P2' },
    water: { label: 'Zero water', priority: 'P2' },
  };

  E.DIMENSIONS = [
    {
      key: 'asd_obs', domain: 'fire', label: 'Aspirating smoke obscuration', unit: '%obs/m',
      basis: 'value', direction: 'up', bands: [0.05, 0.15], digits: 3,
      plain: 'How much sampled air dims a light beam; rises with very fine smoke long before visible smoke.',
      source: 'Illustrative. Set from the ASD alert/action/fire stages in the site fire strategy.',
    },
    {
      key: 'co', domain: 'fire', label: 'Carbon monoxide', unit: 'ppm',
      basis: 'value', direction: 'up', bands: [10, 30], digits: 1,
      plain: 'Gas given off by smouldering insulation and overheating plastics.',
      source: 'Illustrative. Confirm against detector manufacturer and site strategy.',
    },
    {
      key: 'voc', domain: 'battery', label: 'Li-ion off-gas (electrolyte vapour)', unit: 'ppm',
      basis: 'value', direction: 'up', bands: [5, 25], digits: 1,
      plain: 'Vapour a lithium-ion cell vents minutes to hours before thermal runaway.',
      source: 'Illustrative. Set from the off-gas sensor maker and battery test data (UL 9540A).',
    },
    {
      key: 'h2', domain: 'battery', label: 'Hydrogen', unit: '%LEL',
      basis: 'value', direction: 'up', bands: [10, 25], digits: 1,
      plain: 'Flammable gas from battery venting; %LEL = share of the lowest concentration that can ignite.',
      source: 'Illustrative; 25 %LEL is a common ventilation/alarm level. Confirm locally.',
    },
    {
      key: 'cell_temp', domain: 'battery', label: 'Battery cell temperature residual', unit: '°C',
      basis: 'residual', direction: 'up', bands: [2, 5], digits: 1,
      plain: 'Measured cell temperature minus what the battery model expects for the current charge/discharge.',
      source: 'Illustrative. Calibrate on normal data from the battery management system (BMS).',
    },
    {
      key: 'cell_imb', domain: 'battery', label: 'Cell voltage imbalance', unit: 'mV',
      basis: 'value', direction: 'up', bands: [30, 80], digits: 0,
      plain: 'Spread between the highest and lowest cell voltage in a string; a weak cell shows up here.',
      source: 'Illustrative. Use the BMS manufacturer limits.',
    },
    {
      key: 'joint_dt', domain: 'electrical', label: 'Joint temperature rise vs similar phase', unit: '°C',
      basis: 'value', direction: 'up', bands: [4, 15], digits: 1,
      plain: 'How much hotter a busbar or cable joint is than the same joint on the other phases.',
      source: 'Based on NETA MTS thermography guidance (4–15 °C probable deficiency, >15 °C major).',
    },
    {
      key: 'refrig', domain: 'fire', label: 'A2L refrigerant concentration', unit: '%LFL',
      basis: 'value', direction: 'up', bands: [10, 25], digits: 1,
      plain: 'Mildly flammable refrigerant in the air; %LFL = share of the lower flammability limit.',
      source: 'Illustrative; detection is commonly set at or below 25 %LFL (EN 378 / ISO 5149). Confirm.',
    },
    {
      key: 'rack_inlet', domain: 'cooling', label: 'Rack inlet temperature', unit: '°C',
      basis: 'value', direction: 'up', bands: [27, 32], digits: 1,
      plain: 'Air temperature entering the servers.',
      source: 'ASHRAE recommended range up to 27 °C; class A1 allowable up to 32 °C.',
    },
    {
      key: 'asd_flow', domain: 'readiness', label: 'ASD airflow deviation', unit: '%',
      basis: 'value', direction: 'up', bands: [10, 20], digits: 0,
      plain: 'Change in air drawn through the smoke-sampling pipes; a blocked pipe means smoke is not sampled.',
      source: 'Illustrative; many ASD units fault at about ±20 %. Use the commissioning value.',
    },
    {
      key: 'supp_pressure', domain: 'readiness', label: 'Suppression cylinder pressure', unit: '% of fill',
      basis: 'value', direction: 'down', bands: [95, 90], digits: 1,
      plain: 'Gas suppression only works if the cylinders hold their charge.',
      source: 'Illustrative; BS EN 15004 inspection treats a loss of more than 10 % as a fault.',
    },
    {
      key: 'pue', domain: 'energy', label: 'PUE (power usage effectiveness)', unit: '',
      basis: 'value', direction: 'up', bands: [1.2, 1.35], digits: 2,
      plain: 'Total facility power divided by IT power; 1.0 would mean no overhead at all.',
      source: 'Illustrative targets for a liquid-cooled, chiller-free design.',
    },
    {
      key: 'free_cooling', domain: 'energy', label: 'Chiller-free share (last 24 h)', unit: '%',
      basis: 'value', direction: 'down', bands: [85, 60], digits: 0,
      plain: 'Share of time the dry coolers alone handled the heat, without the trim chiller.',
      source: 'Illustrative; depends on climate and supply-water setpoint.',
    },
    {
      key: 'dc_approach', domain: 'cooling', label: 'Dry-cooler approach residual', unit: '°C',
      basis: 'residual', direction: 'up', bands: [1.5, 3], digits: 1,
      plain: 'How much warmer the fluid leaves the dry cooler than the model expects; fouled coils push this up.',
      source: 'Illustrative. Calibrate against the dry-cooler selection data.',
    },
    {
      key: 'cdu_flow', domain: 'cooling', label: 'CDU coolant flow residual', unit: '%',
      basis: 'residual', direction: 'down', bands: [-5, -15], digits: 1,
      plain: 'Coolant flow from the coolant distribution unit (CDU) compared with the pump-curve model.',
      source: 'Illustrative. Use CDU manufacturer data.',
    },
    {
      key: 'wue', domain: 'water', label: 'WUE (water usage effectiveness)', unit: 'L/kWh',
      basis: 'value', direction: 'up', bands: [0.02, 0.2], digits: 3,
      plain: 'Litres of water used per kWh of IT energy; the zero-water target is about 0.',
      source: 'Illustrative; industry average is around 1.8 L/kWh, zero-water designs aim near 0.',
    },
    {
      key: 'makeup', domain: 'water', label: 'Closed-loop make-up water', unit: 'L/h',
      basis: 'value', direction: 'up', bands: [1, 10], digits: 1,
      plain: 'Water added to the sealed cooling loop; it should be zero, so any flow means a leak.',
      source: 'Illustrative.',
    },
    {
      key: 'adiabatic', domain: 'water', label: 'Adiabatic spray water', unit: 'L/h',
      basis: 'value', direction: 'up', bands: [0.1, 150], digits: 0,
      plain: 'Water sprayed on dry coolers to cool them on hot days; any use breaks the zero-water policy.',
      source: 'Policy choice: any use is at least Medium.',
    },
  ];

  E.DIM = {};
  E.DIMENSIONS.forEach(function (d) { E.DIM[d.key] = d; });

  E.classify = function (dimKey, v) {
    const d = E.DIM[dimKey];
    if (!d || v === null || v === undefined || isNaN(v)) return 'UNKNOWN';
    const a = d.bands[0];
    const b = d.bands[1];
    if (d.direction === 'down') return v > a ? 'LOW' : v > b ? 'MEDIUM' : 'HIGH';
    return v < a ? 'LOW' : v < b ? 'MEDIUM' : 'HIGH';
  };

  E.bandText = function (d) {
    const u = d.unit ? ' ' + d.unit : '';
    const a = d.bands[0];
    const b = d.bands[1];
    if (d.direction === 'down') {
      return { LOW: '> ' + a + u, MEDIUM: b + '–' + a + u, HIGH: '≤ ' + b + u };
    }
    return { LOW: '< ' + a + u, MEDIUM: a + '–' + b + u, HIGH: '≥ ' + b + u };
  };

  // ----------------------------------------------------------------- zones
  // Floor-plan coordinates are in a 1000 x 600 SVG viewBox.
  E.ZONES = [
    { id: 'HALL_A', label: 'Data hall A', short: 'HA', x: 20, y: 20, w: 500, h: 270 },
    { id: 'HALL_B', label: 'Data hall B', short: 'HB', x: 20, y: 310, w: 500, h: 270 },
    { id: 'UPS', label: 'UPS & battery room', short: 'UPS', x: 540, y: 20, w: 220, h: 270 },
    { id: 'ELEC', label: 'Electrical room', short: 'EL', x: 540, y: 310, w: 220, h: 270 },
    { id: 'PLANT', label: 'Cooling plant', short: 'CP', x: 780, y: 20, w: 200, h: 560 },
  ];
  E.ZONE = {};
  E.ZONES.forEach(function (z) { E.ZONE[z.id] = z; });

  // ---------------------------------------------------------------- assets
  E.ASSETS = [
    { id: 'B1', zone: 'UPS', type: 'battery', label: 'Li-ion string B1', x: 560, y: 78, w: 40, h: 145 },
    { id: 'B2', zone: 'UPS', type: 'battery', label: 'Li-ion string B2', x: 615, y: 78, w: 40, h: 145 },
    { id: 'B3', zone: 'UPS', type: 'battery', label: 'Li-ion string B3', x: 670, y: 78, w: 40, h: 145 },
    { id: 'UPS1', zone: 'UPS', type: 'ups', label: 'UPS modules', x: 560, y: 235, w: 150, h: 35 },
    { id: 'SWB1', zone: 'ELEC', type: 'switchboard', label: 'Main switchboard SWB-1', x: 560, y: 365, w: 180, h: 60 },
    { id: 'PDUA', zone: 'ELEC', type: 'pdu', label: 'PDU-A (hall A)', x: 560, y: 450, w: 80, h: 50 },
    { id: 'PDUB', zone: 'ELEC', type: 'pdu', label: 'PDU-B (hall B)', x: 660, y: 450, w: 80, h: 50 },
    { id: 'CDU1', zone: 'PLANT', type: 'cdu', label: 'CDU-1 (liquid loop)', x: 800, y: 70, w: 75, h: 60 },
    { id: 'CDU2', zone: 'PLANT', type: 'cdu', label: 'CDU-2 (liquid loop)', x: 885, y: 70, w: 75, h: 60 },
    { id: 'CH1', zone: 'PLANT', type: 'chiller', label: 'Trim chiller (A2L refrigerant)', x: 800, y: 170, w: 160, h: 70 },
    { id: 'DC', zone: 'PLANT', type: 'drycooler', label: 'Dry coolers DC-1..3 (roof)', x: 800, y: 280, w: 160, h: 110 },
    { id: 'LOOP', zone: 'PLANT', type: 'loop', label: 'Closed loop & make-up meter', x: 800, y: 430, w: 160, h: 50 },
    { id: 'SUPP', zone: 'PLANT', type: 'suppression', label: 'Gas suppression cylinders', x: 800, y: 510, w: 160, h: 45 },
  ];

  // Racks are generated: 2 rows of 10 per hall, cold aisle between rows.
  E.RACKS = [];
  ['HALL_A', 'HALL_B'].forEach(function (zid) {
    const z = E.ZONE[zid];
    const prefix = zid === 'HALL_A' ? 'A' : 'B';
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 10; i++) {
        E.RACKS.push({
          id: prefix + (row + 1) + '-' + String(i + 1).padStart(2, '0'),
          zone: zid, row: row, index: i,
          x: z.x + 30 + i * 46, y: z.y + (row === 0 ? 55 : 165), w: 38, h: 50,
        });
      }
    }
  });

  // ---------------------------------------------------------------- points
  // A point is one measured signal. 'metric' links it to a dimension.
  // 'raw' describes what the sensor reads (for the measured-vs-expected chart).
  function pt(id, zone, asset, metric, label, x, y) {
    return { id: id, zone: zone, asset: asset, metric: metric, label: label, x: x, y: y };
  }
  E.POINTS = [
    // Hall A
    pt('ASD-HA', 'HALL_A', null, 'asd_obs', 'Aspirating detector, hall A (incl. sub-floor)', 130, 272),
    pt('CO-HA', 'HALL_A', null, 'co', 'CO detector, hall A sub-floor', 410, 272),
    pt('PR-HA', 'HALL_A', null, 'particle_ratio', 'Particle counter, hall A', 480, 155),
    pt('RI-HA', 'HALL_A', null, 'rack_inlet', 'Rack inlet (mean), hall A', 270, 272),
    pt('AF-HA', 'HALL_A', null, 'asd_flow', 'ASD airflow, hall A', 50, 272),
    // Hall B
    pt('ASD-HB', 'HALL_B', null, 'asd_obs', 'Aspirating detector, hall B (incl. sub-floor)', 130, 562),
    pt('CO-HB', 'HALL_B', null, 'co', 'CO detector, hall B sub-floor', 410, 562),
    pt('PR-HB', 'HALL_B', null, 'particle_ratio', 'Particle counter, hall B', 480, 445),
    pt('RI-HB', 'HALL_B', null, 'rack_inlet', 'Rack inlet (mean), hall B', 270, 562),
    pt('AF-HB', 'HALL_B', null, 'asd_flow', 'ASD airflow, hall B', 50, 562),
    // UPS & battery room
    pt('ASD-UPS', 'UPS', null, 'asd_obs', 'Aspirating detector, UPS room', 570, 63),
    pt('CO-UPS', 'UPS', null, 'co', 'CO detector, UPS room', 610, 63),
    pt('H2-UPS', 'UPS', null, 'h2', 'Hydrogen detector, UPS room', 650, 63),
    pt('PR-UPS', 'UPS', null, 'particle_ratio', 'Particle counter, UPS room', 690, 63),
    pt('OG-B1', 'UPS', 'B1', 'voc', 'Off-gas sensor, string B1', 580, 96),
    pt('OG-B2', 'UPS', 'B2', 'voc', 'Off-gas sensor, string B2', 635, 96),
    pt('OG-B3', 'UPS', 'B3', 'voc', 'Off-gas sensor, string B3', 690, 96),
    pt('CT-B1', 'UPS', 'B1', 'cell_temp', 'Max cell temperature, string B1', 580, 145),
    pt('CT-B2', 'UPS', 'B2', 'cell_temp', 'Max cell temperature, string B2', 635, 145),
    pt('CT-B3', 'UPS', 'B3', 'cell_temp', 'Max cell temperature, string B3', 690, 145),
    pt('CV-B1', 'UPS', 'B1', 'cell_imb', 'Cell voltage spread, string B1', 580, 192),
    pt('CV-B2', 'UPS', 'B2', 'cell_imb', 'Cell voltage spread, string B2', 635, 192),
    pt('CV-B3', 'UPS', 'B3', 'cell_imb', 'Cell voltage spread, string B3', 690, 192),
    // Electrical room
    pt('ASD-EL', 'ELEC', null, 'asd_obs', 'Aspirating detector, electrical room', 570, 352),
    pt('CO-EL', 'ELEC', null, 'co', 'CO detector, electrical room', 610, 352),
    pt('PR-EL', 'ELEC', null, 'particle_ratio', 'Particle counter, electrical room', 650, 352),
    pt('JT-L1', 'ELEC', 'SWB1', 'joint_dt', 'Busbar joint L1 (thermal camera)', 600, 402),
    pt('JT-L2', 'ELEC', 'SWB1', 'joint_dt', 'Busbar joint L2 (thermal camera)', 650, 402),
    pt('JT-L3', 'ELEC', 'SWB1', 'joint_dt', 'Busbar joint L3 (thermal camera)', 700, 402),
    pt('VOC-EL', 'ELEC', null, 'voc', 'VOC sensor, electrical room', 700, 540),
    // Cooling plant
    pt('RF-CH', 'PLANT', 'CH1', 'refrig', 'A2L refrigerant detector, chiller', 880, 225),
    pt('FL-CDU', 'PLANT', 'CDU1', 'cdu_flow', 'CDU coolant flow', 837, 120),
    pt('AP-DC', 'PLANT', 'DC', 'dc_approach', 'Dry-cooler approach temperature', 880, 375),
    pt('MU-LOOP', 'PLANT', 'LOOP', 'makeup', 'Make-up water meter', 880, 470),
    pt('AD-DC', 'PLANT', 'DC', 'adiabatic', 'Adiabatic spray meter', 940, 375),
    pt('SP-SUPP', 'PLANT', 'SUPP', 'supp_pressure', 'Suppression cylinder pressure', 880, 545),
  ];
  E.POINT = {};
  E.POINTS.forEach(function (p) { E.POINT[p.id] = p; });

  // Non-dimension signals used only as SOM features.
  E.EXTRA_SIGNALS = {
    particle_ratio: {
      label: 'Large-to-small particle ratio', unit: '',
      plain: 'Dust has larger particles than smoke: high ratio suggests dust, low ratio suggests smoke.',
    },
  };

  // ------------------------------------------------------------------ SOMs
  // Each map has: features (how a zone snapshot becomes a vector, scaled so 1
  // = "notable"), classes (synthetic training clusters in scaled units) and a
  // hexagonal grid size.
  E.SOMS = {
    fire: {
      title: 'Fire, battery & electrical (P1)',
      cols: 16, rows: 12, seed: 7,
      zones: ['HALL_A', 'HALL_B', 'UPS', 'ELEC'],
      features: [
        { key: 'asd_obs', label: 'Smoke obscuration', centre: 0.01, scale: 0.04 },
        { key: 'co', label: 'CO', centre: 1.5, scale: 8 },
        { key: 'voc', label: 'Off-gas / VOC', centre: 0.3, scale: 5 },
        { key: 'h2', label: 'Hydrogen', centre: 0.5, scale: 8 },
        { key: 'cell_temp', label: 'Cell temp residual', centre: 0, scale: 2 },
        { key: 'cell_imb', label: 'Cell imbalance', centre: 12, scale: 25 },
        { key: 'joint_dt', label: 'Joint ΔT', centre: 0.8, scale: 4 },
        { key: 'particle_ratio', label: 'Particle ratio', centre: 1, scale: 1 },
      ],
      classes: [
        { id: 'NORMAL', label: 'Normal', level: 'LOW', n: 700, sd: 0.3, c: {} },
        { id: 'DUST', label: 'Dust / maintenance nuisance', level: 'MEDIUM', n: 140, sd: 0.4,
          c: { asd_obs: 2.6, voc: 0.3, particle_ratio: 2.4 } },
        { id: 'BATT_DRIFT', label: 'Battery cell drift', level: 'MEDIUM', n: 140, sd: 0.4,
          c: { cell_temp: 1.6, cell_imb: 1.6 } },
        { id: 'BATT_OFFGAS', label: 'Li-ion off-gas (runaway precursor)', level: 'HIGH', n: 140, sd: 0.6,
          c: { voc: 4, cell_temp: 3, cell_imb: 3.2, h2: 1.2, asd_obs: 0.8 } },
        { id: 'JOINT_EARLY', label: 'Electrical joint heating', level: 'MEDIUM', n: 140, sd: 0.4,
          c: { joint_dt: 2 } },
        { id: 'JOINT_SEVERE', label: 'Electrical hot spot', level: 'HIGH', n: 140, sd: 0.6,
          c: { joint_dt: 4.5, co: 1.2, voc: 1.2, asd_obs: 1.2, particle_ratio: -0.5 } },
        { id: 'SMOULDER', label: 'Smouldering / early smoke', level: 'HIGH', n: 140, sd: 0.6,
          c: { asd_obs: 3.5, co: 3, voc: 1.2, particle_ratio: -0.7 } },
        { id: 'SENSOR', label: 'Single-sensor spike (suspect sensor)', level: 'UNKNOWN', n: 100, sd: 0.35,
          c: { h2: 4 } },
      ],
    },
    cooling: {
      title: 'Energy efficiency & zero-water cooling (P2)',
      cols: 14, rows: 10, seed: 11,
      zones: ['PLANT'],
      features: [
        { key: 'pue_res', label: 'PUE residual', centre: 0, scale: 0.04 },
        { key: 'wue', label: 'WUE', centre: 0, scale: 0.05 },
        { key: 'makeup', label: 'Make-up water', centre: 0, scale: 5 },
        { key: 'adiabatic', label: 'Adiabatic spray', centre: 0, scale: 100 },
        { key: 'dc_approach', label: 'Dry-cooler approach residual', centre: 0, scale: 1.5 },
        { key: 'cdu_flow', label: 'CDU flow residual', centre: 0, scale: 6 },
        { key: 'rack_inlet_res', label: 'Rack inlet residual', centre: 0, scale: 2 },
      ],
      classes: [
        { id: 'EFFICIENT', label: 'Efficient, zero water', level: 'LOW', n: 700, sd: 0.3, c: {} },
        { id: 'FOULING', label: 'Dry-cooler fouling', level: 'MEDIUM', n: 140, sd: 0.4,
          c: { dc_approach: 2.5, pue_res: 1.8 } },
        { id: 'LEAK', label: 'Closed-loop leak', level: 'HIGH', n: 140, sd: 0.5,
          c: { makeup: 4, wue: 2, cdu_flow: -1 } },
        { id: 'SPRAY', label: 'Adiabatic water in use', level: 'MEDIUM', n: 140, sd: 0.4,
          c: { adiabatic: 2.5, wue: 3.5 } },
        { id: 'OVERCOOL', label: 'Overcooling (energy waste)', level: 'MEDIUM', n: 140, sd: 0.4,
          c: { pue_res: 2, rack_inlet_res: -2.5 } },
        { id: 'PUMP', label: 'CDU pump degradation', level: 'HIGH', n: 140, sd: 0.5,
          c: { cdu_flow: -3, rack_inlet_res: 2.5, pue_res: 0.5 } },
      ],
    },
  };
})(globalThis.EMBER = globalThis.EMBER || {});
