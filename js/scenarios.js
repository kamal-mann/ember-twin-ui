/*
 * EMBER UI: scenario catalogue for the simulator (dummy data).
 *
 * Each scenario adds changes ("deltas") to sensor points or to the cooling
 * plant over time. t is simulated minutes since the scenario started.
 * certified: what the certified fire / gas systems would do, and when; used to
 * show how much earlier the twin warned (lead time).
 * Diagnosis text is a stand-in for the guarded LLM diagnosis in the plan.
 */
(function (E) {
  'use strict';

  const H = 60;
  const D = 24 * H;
  function ramp(t, t0, t1, v) {
    if (t <= t0) return 0;
    if (t >= t1) return v;
    return ((t - t0) / (t1 - t0)) * v;
  }
  E.ramp = ramp;

  E.SCENARIOS = [
    {
      id: 'normal', title: 'Normal operation', priority: '—', zone: null,
      minutesPerTick: 5, durationMin: 2 * D, warmupTicks: 60,
      summary: 'Everything healthy. Shows normal noise, daily load and weather cycles, and zero water use.',
      effects: function () { return {}; },
      certified: [],
      diagnosis: null,
    },
    {
      id: 'battery', title: 'Li-ion battery off-gas → thermal-runaway precursor (string B2)', priority: 'P1',
      zone: 'UPS', location: { x: 635, y: 145, label: 'String B2, module 7' },
      minutesPerTick: 1, durationMin: 95, warmupTicks: 30, expectClass: 'BATT_OFFGAS',
      summary: 'One cell in string B2 degrades: temperature and voltage drift first, then electrolyte off-gas, then smoke.',
      effects: function (t) {
        return {
          points: {
            'CT-B2': ramp(t, 5, 60, 3.5) + ramp(t, 60, 90, 7),
            'CV-B2': ramp(t, 10, 60, 45) + ramp(t, 60, 90, 90),
            'OG-B2': ramp(t, 30, 65, 20) + ramp(t, 65, 90, 70),
            'H2-UPS': ramp(t, 55, 90, 22),
            'ASD-UPS': ramp(t, 72, 90, 0.22),
            'CO-UPS': ramp(t, 75, 90, 25),
            'PR-UPS': -ramp(t, 72, 90, 0.6),
          },
        };
      },
      certified: [
        { atMin: 82, zone: 'UPS', state: 'PRE-ALARM', label: 'ASD UPS room: Action stage' },
        { atMin: 88, zone: 'UPS', state: 'FIRE', label: 'ASD UPS room: Fire 1' },
      ],
      diagnosis: {
        issue: 'D1 Li-ion battery thermal-runaway precursor',
        text: 'String B2 module 7: cell temperature is above the battery model for the present float current, ' +
          'the cell voltage spread is growing, and electrolyte off-gas is now detected at the B2 sensor only. ' +
          'Other strings and room smoke are normal, so this is a single-cell fault developing towards venting, ' +
          'not a room-wide event or a sensor fault (three independent signals agree).',
        actions: [
          { tier: 'A', text: 'Notify duty engineer and battery vendor; open P1 ticket (automatic).' },
          { tier: 'A', text: 'Raise UPS-room sampling rate and start thermal camera recording (automatic).' },
          { tier: 'B', text: 'Isolate string B2 via the BMS operator workflow (engineer approval).' },
          { tier: 'B', text: 'Move UPS load to strings B1/B3 and confirm runtime margin (engineer approval).' },
          { tier: 'X', text: 'Fire detection and suppression stay under the certified system; the twin never acts on them.' },
        ],
      },
    },
    {
      id: 'joint', title: 'Loose busbar joint heating (SWB-1, phase L2)', priority: 'P1',
      zone: 'ELEC', location: { x: 650, y: 402, label: 'SWB-1 busbar joint L2' },
      minutesPerTick: 60, durationMin: 14 * D, warmupTicks: 24, expectClass: 'JOINT_SEVERE',
      summary: 'A joint loosens over two weeks. Heating follows load squared, so raw temperature swings daily; the residual does not.',
      effects: function (t, env) {
        const lf = Math.pow(env.itKW / 800, 2);
        return {
          points: {
            'JT-L2': (ramp(t, 0, 7 * D, 5) + ramp(t, 7 * D, 13 * D, 20)) * lf,
            'CO-EL': ramp(t, 12 * D, 14 * D, 15),
            'VOC-EL': ramp(t, 12 * D, 14 * D, 8),
            'ASD-EL': ramp(t, 12.5 * D, 14 * D, 0.12),
            'PR-EL': -ramp(t, 12.5 * D, 14 * D, 0.5),
          },
        };
      },
      certified: [{ atMin: 13.6 * D, zone: 'ELEC', state: 'PRE-ALARM', label: 'ASD electrical room: Alert stage' }],
      diagnosis: {
        issue: 'D3 Electrical hot spot (loose or corroded joint)',
        text: 'Busbar joint L2 on SWB-1 runs hotter than L1 and L3 at the same current, and the gap grows ' +
          'week on week. The rise tracks load squared (I²R heating), which points to rising contact resistance. ' +
          'Late CO, VOC and fine smoke indicate insulation near the joint is now overheating.',
        actions: [
          { tier: 'A', text: 'Open ticket and schedule thermographic survey of SWB-1 (automatic).' },
          { tier: 'B', text: 'Plan a maintenance window to torque or replace the joint (engineer approval).' },
          { tier: 'B', text: 'Reduce load on the affected feeder if temperature keeps rising (engineer approval).' },
          { tier: 'X', text: 'No switching of electrical supplies by the twin.' },
        ],
      },
    },
    {
      id: 'smoulder', title: 'Smouldering cable under raised floor (hall A, row A1)', priority: 'P1',
      zone: 'HALL_A', location: { x: 330, y: 95, label: 'Sub-floor near rack A1-07' },
      minutesPerTick: 0.5, durationMin: 45, warmupTicks: 30, expectClass: 'SMOULDER',
      summary: 'Cable insulation smoulders: fine smoke and CO rise with little heat. Fusion spots it before the fixed ASD stages.',
      effects: function (t) {
        return {
          points: {
            'ASD-HA': ramp(t, 5, 38, 0.24),
            'CO-HA': ramp(t, 8, 40, 35),
            'PR-HA': -ramp(t, 5, 25, 0.65),
          },
        };
      },
      certified: [
        { atMin: 26, zone: 'HALL_A', state: 'PRE-ALARM', label: 'ASD hall A: Action stage' },
        { atMin: 32.5, zone: 'HALL_A', state: 'FIRE', label: 'ASD hall A: Fire 1' },
      ],
      diagnosis: {
        issue: 'D6 Early smoke / smouldering',
        text: 'Hall A obscuration is rising together with CO, and the particle counter shows small particles ' +
          '(smoke, not dust). No maintenance permit is active in hall A and rack temperatures are normal, ' +
          'which fits low-energy smouldering of cable insulation in the sub-floor near row A1.',
        actions: [
          { tier: 'A', text: 'Notify duty engineer and security; show sub-floor tile map near A1-07 (automatic).' },
          { tier: 'B', text: 'Send engineer with handheld detector to inspect sub-floor (engineer decision).' },
          { tier: 'X', text: 'Fire alarm, suppression and HVAC fire mode are controlled only by the certified system.' },
        ],
      },
    },
    {
      id: 'dust', title: 'Dust from maintenance: nuisance (hall B)', priority: 'P1',
      zone: 'HALL_B', location: { x: 200, y: 390, label: 'Floor-tile cutting, row B1' },
      minutesPerTick: 0.5, durationMin: 40, warmupTicks: 30, expectClass: 'DUST',
      permit: 'PTW-0412: floor-tile cutting in hall B, active',
      summary: 'Tile cutting raises obscuration with large particles and no CO. The twin explains it as nuisance instead of fire.',
      effects: function (t) {
        return {
          points: {
            'ASD-HB': ramp(t, 5, 15, 0.11) - ramp(t, 30, 38, 0.11),
            'PR-HB': ramp(t, 5, 15, 2.6) - ramp(t, 30, 38, 2.6),
            'CO-HB': 0,
          },
        };
      },
      certified: [{ atMin: 13, zone: 'HALL_B', state: 'PRE-ALARM', label: 'ASD hall B: Alert stage (nuisance)' }],
      diagnosis: {
        issue: 'Nuisance: dust from maintenance (not a fire precursor)',
        text: 'Hall B obscuration rose, but the particle counter shows large particles (dust), CO and VOC are flat, ' +
          'and permit PTW-0412 for floor-tile cutting is active in the same area. This matches a dust nuisance event.',
        actions: [
          { tier: 'A', text: 'Annotate the ASD pre-alarm as likely nuisance with evidence (automatic).' },
          { tier: 'A', text: 'Remind permit holder to use dust extraction (automatic message).' },
          { tier: 'X', text: 'The twin does not silence, delay or reset the certified alarm.' },
        ],
      },
    },
    {
      id: 'asdblock', title: 'ASD sampling pipe blocked: detection impaired (hall A)', priority: 'P1',
      zone: 'HALL_A', location: { x: 50, y: 272, label: 'ASD pipe, hall A' },
      minutesPerTick: 1, durationMin: 60, warmupTicks: 30,
      summary: 'Fire-protection readiness: airflow through the smoke-sampling pipe drops, so smoke would not be seen.',
      effects: function (t) {
        return { points: { 'AF-HA': ramp(t, 5, 40, 32), 'ASD-HA': -ramp(t, 5, 40, 0.009) } };
      },
      certified: [{ atMin: 31, zone: 'HALL_A', state: 'FAULT', label: 'ASD hall A: airflow fault' }],
      diagnosis: {
        issue: 'P2 Detection impaired',
        text: 'ASD airflow in hall A has fallen steadily while obscuration reads lower than normal background. ' +
          'Together this means the pipe is blocking (dust or a crushed pipe), so part of hall A is not being sampled.',
        actions: [
          { tier: 'A', text: 'Raise readiness ticket P2 to fire-system maintainer (automatic).' },
          { tier: 'B', text: 'Arrange interim fire watch for hall A if the fault persists (responsible person).' },
          { tier: 'X', text: 'Repairs to the certified detection system only by the competent maintainer.' },
        ],
      },
    },
    {
      id: 'refrig', title: 'A2L refrigerant leak at trim chiller', priority: 'P1',
      zone: 'PLANT', location: { x: 880, y: 205, label: 'Trim chiller CH-1' },
      minutesPerTick: 1, durationMin: 50, warmupTicks: 30,
      summary: 'Mildly flammable refrigerant leaks into the plant room. Hard limits flag it even though no SOM covers it.',
      effects: function (t) { return { points: { 'RF-CH': ramp(t, 5, 45, 32) } }; },
      certified: [{ atMin: 36, zone: 'PLANT', state: 'PRE-ALARM', label: 'Gas detection: refrigerant 25 %LFL' }],
      diagnosis: {
        issue: 'H5 Refrigerant leak (A2L, mildly flammable)',
        text: 'Refrigerant concentration at CH-1 is climbing steadily. The hard limit sets the severity even though ' +
          'no SOM covers this zone: limits are the severity floor.',
        actions: [
          { tier: 'A', text: 'Notify plant engineer; open ticket (automatic).' },
          { tier: 'B', text: 'Stop CH-1 and run on dry coolers if weather allows (engineer approval).' },
          { tier: 'X', text: 'Ventilation and ignition-source control stay with the gas detection system.' },
        ],
      },
    },
    {
      id: 'fouling', title: 'Dry-cooler coil fouling', priority: 'P2',
      zone: 'PLANT', location: { x: 880, y: 335, label: 'Dry coolers DC-1..3' },
      minutesPerTick: 10, durationMin: 3 * D, warmupTicks: 144, expectClass: 'FOULING',
      summary: 'Coils clog with debris: the approach temperature drifts up and fans work harder, raising PUE.',
      effects: function (t) { return { energy: { approachDelta: ramp(t, 0, 3 * D, 5) } }; },
      certified: [],
      diagnosis: {
        issue: 'H-DC Dry-cooler fouling',
        text: 'Dry-cooler leaving temperature is higher than the model expects for the outdoor temperature and load, ' +
          'and fan power is rising. Fouled coils reduce heat transfer and will force the trim chiller on earlier.',
        actions: [
          { tier: 'A', text: 'Open maintenance ticket: coil inspection and cleaning (automatic).' },
          { tier: 'B', text: 'Schedule dry (no water) coil cleaning to stay within the zero-water policy.' },
        ],
      },
    },
    {
      id: 'leak', title: 'Closed-loop coolant leak (make-up water)', priority: 'P2',
      zone: 'PLANT', location: { x: 880, y: 455, label: 'Closed loop' },
      minutesPerTick: 10, durationMin: 2.5 * D, warmupTicks: 144, expectClass: 'LEAK',
      summary: 'The sealed loop starts losing coolant; make-up water appears. Breaks zero water and risks water near power.',
      effects: function (t) { return { energy: { makeupLph: ramp(t, 0.3 * D, 2 * D, 30), leakFlowFrac: ramp(t, 0.3 * D, 2 * D, 0.04) } }; },
      certified: [],
      diagnosis: {
        issue: 'H6/D7 Liquid-loop leak',
        text: 'Make-up water flow is no longer zero and is rising while CDU flow drops slightly. A sealed loop ' +
          'should need no top-up, so coolant is leaving the loop. Check leak detection tape near racks and electrics first.',
        actions: [
          { tier: 'A', text: 'Notify engineer; highlight leak-detection zones near electrical equipment (automatic).' },
          { tier: 'B', text: 'Walk the loop; isolate the leaking branch (engineer approval).' },
        ],
      },
    },
    {
      id: 'heatwave', title: 'Heatwave: adiabatic water assist switched on', priority: 'P2',
      zone: 'PLANT', location: { x: 880, y: 335, label: 'Dry coolers DC-1..3' },
      minutesPerTick: 10, durationMin: 3 * D, warmupTicks: 144, expectClass: 'SPRAY',
      summary: 'Outdoor temperature rises 14 °C. Spraying water saves chiller energy but breaks zero water: the trade-off made visible.',
      effects: function (t) {
        return { energy: { outdoorDelta: ramp(t, 0.25 * D, 0.75 * D, 14) - ramp(t, 2.25 * D, 2.75 * D, 14), allowAdiabatic: true } };
      },
      certified: [],
      diagnosis: {
        issue: 'Zero-water policy breach (adiabatic assist)',
        text: 'Adiabatic spray is running because the dry coolers alone cannot meet the supply setpoint. ' +
          'The physics model shows the alternative: chiller trim with zero water at a higher PUE. Use the what-if panel to compare.',
        actions: [
          { tier: 'B', text: 'Choose: chiller trim (energy) or spray (water); record the decision (engineer).' },
          { tier: 'B', text: 'Consider raising supply-water setpoint within the IT envelope (engineer approval).' },
        ],
      },
    },
    {
      id: 'overcool', title: 'Overcooling: setpoint too low (energy waste)', priority: 'P2',
      zone: 'PLANT', location: { x: 837, y: 100, label: 'CDU / air-side setpoints' },
      minutesPerTick: 10, durationMin: 2 * D, warmupTicks: 144, expectClass: 'OVERCOOL',
      summary: 'A setpoint was lowered "to be safe". Racks run cold and cooling energy rises with no benefit.',
      effects: function (t) {
        return { energy: { overcoolFrac: ramp(t, 0.2 * D, 0.6 * D, 0.06), rackDelta: -ramp(t, 0.2 * D, 0.6 * D, 5) } };
      },
      certified: [],
      diagnosis: {
        issue: 'Overcooling (energy waste)',
        text: 'Rack inlet temperatures are about 5 °C below the model while cooling power is higher than expected. ' +
          'The IT envelope allows warmer air, so the setpoint can be raised safely.',
        actions: [
          { tier: 'B', text: 'Restore setpoint to the design value (engineer approval).' },
        ],
      },
    },
    {
      id: 'pump', title: 'CDU pump degradation (liquid cooling)', priority: 'P2',
      zone: 'PLANT', location: { x: 837, y: 100, label: 'CDU-1 pump' }, alsoAffects: ['HALL_A', 'HALL_B'],
      minutesPerTick: 10, durationMin: 2.5 * D, warmupTicks: 144, expectClass: 'PUMP',
      summary: 'Pump wear reduces coolant flow; rack temperatures rise. Also a fire-risk context: hotter electronics.',
      effects: function (t) {
        return { energy: { pumpFlowFrac: 1 - ramp(t, 0.2 * D, 2 * D, 0.22), rackDelta: ramp(t, 0.2 * D, 2 * D, 6) } };
      },
      certified: [],
      diagnosis: {
        issue: 'H6 Liquid-cooling fault (CDU pump)',
        text: 'CDU flow is below the pump-curve model at the same speed and rack inlet temperatures are rising. ' +
          'This points to pump wear or a partially closed valve, not a load change.',
        actions: [
          { tier: 'A', text: 'Open ticket; check duty/standby pump status (automatic).' },
          { tier: 'B', text: 'Switch to standby pump (engineer approval).' },
        ],
      },
    },
  ];

  E.SCENARIO = {};
  E.SCENARIOS.forEach(function (s) { E.SCENARIO[s.id] = s; });
})(globalThis.EMBER = globalThis.EMBER || {});
