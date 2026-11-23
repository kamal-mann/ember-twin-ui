# EMBER UI prototype: fire-safety and zero-water cooling digital twin (dummy data)

A reusable, browser-only dashboard for the data-centre digital twin. It runs on **simulated data** and
puts **fire safety first (P1)**: battery, electrical, smoke, refrigerant and fire-protection readiness. **Energy
efficiency and zero-water cooling (P2)** sit alongside.

> **Research prototype on simulated data. It is not a fire-safety system** and must not be used to make safety decisions.

It is a companion to the EMBER research plan, which is kept separately and is not part of this repository.

**Open it:** double-click `index.html` (Chrome or Safari). It works offline and has no installs or external libraries.
Deep links work too: `index.html#scenario=smoulder&tab=som`.

## Plain-language glossary
- **Digital twin**: a live software copy of the building. It predicts what each sensor *should* read and runs safe what-if tests.
- **Residual**: the measured value minus the model's expected value. It stays near zero when load or weather changes, so it flags faults rather than hot days.
- **SOM (self-organizing map)**: a neural network that lays typical situations out on a 2-D map, with similar ones next to each other.
- **Hexagonal SOM**: a SOM whose cells are hexagons. Each cell has six equally distant neighbours, so regions look natural and show no square-grid bias.
- **BMU (best-matching unit)**: the map cell closest to the current situation. A zone's dot sits on its BMU.
- **QE (quantization error)**: the distance from the current situation to its BMU. A large QE means "never seen this before", so the twin reports Unknown.
- **U-matrix**: map shading that shows how different neighbouring cells are. Light ridges are boundaries between situations.
- **RAG**: Red / Amber / Green status colours.
- **ASD (aspirating smoke detector)**: draws air through pipes to a very sensitive smoke sensor.
- **Off-gas**: electrolyte vapour that a lithium-ion cell vents before thermal runaway (an uncontrollable self-heating fire).
- **%LEL / %LFL**: gas concentration as a percentage of the lowest concentration that can ignite.
- **PUE (power usage effectiveness)**: facility power ÷ IT power. 1.0 is perfect.
- **WUE (water usage effectiveness)**: litres of water per kWh of IT energy. The zero-water target is about 0.
- **Dry cooler / trim chiller / adiabatic spray**: the cooling plant's three parts. The dry cooler is a fan radiator that uses no water. The trim chiller is a refrigeration machine that runs only on hot days. Adiabatic spray mists water onto the dry coolers to save energy, but uses water.
- **CDU (coolant distribution unit)**: pumps the liquid that cools the racks.
- **A2L refrigerant**: a newer, mildly flammable refrigerant, so a leak is a fire-related hazard.
- **Tier A / B / X actions**: A runs automatically (low risk), B needs an engineer to approve it, X is never automated (the fire systems).

All the tools here are free. The data is synthetic and contains nothing confidential.

## What the screens show
| Tab | What it is for |
|---|---|
| **Digital twin** | A floor plan with live colours: halls, UPS & battery room, electrical room and cooling plant. It shows the twin-located hazard, the early-warning lead time against the certified system, alerts with evidence, the diagnosis and whitelisted actions, measured-vs-expected charts, a live mini fire SOM, the read-only fire-panel mirror and readiness checks P1–P4. |
| **SOM maps** | Two hexagonal SOMs: *Fire, battery & electrical* (16×12) and *Energy & zero-water cooling* (14×10). They show regions, U-matrix or training hits, plus live zone dots with their trails and a hover inspector. |
| **Energy & zero water** | PUE measured vs model, WUE and make-up water, temperatures, and a **what-if** panel that compares the zero-water policy with adiabatic assist using the same physics model. |
| **Dimensions** | Severity levels, every dimension with its Low/Medium/High bands, and the SOM input features. All of it is generated from `js/config.js`. |
| **How it works** | The twin loop, how the hex SOM regions are built, the glossary and the reuse notes. |

## SOM map dots and the smoothing toggle
**Each dot on a SOM map is one zone of the data centre, drawn on the cell that best matches its current situation.**

| Dot | Zone | Map |
|---|---|---|
| **HA** | Data hall A | Fire, battery & electrical |
| **HB** | Data hall B | Fire, battery & electrical |
| **UPS** | UPS & battery room | Fire, battery & electrical |
| **EL** | Electrical room | Fire, battery & electrical |
| **CP** | Cooling plant | Energy & zero-water cooling |

**How a dot gets its position (every tick, for every zone):**
1. The zone's readings become the map's input vector, using the features listed on the Dimensions tab. For the fire map these
   are smoke, CO, off-gas, hydrogen, cell-temperature residual, cell imbalance, joint ΔT and particle ratio.
2. The twin finds the **best-matching cell** (BMU), the hexagon whose learned pattern is closest.
3. The dot is drawn there. Zones that share a cell are drawn side by side.

The dot answers one question: *which known situation does this zone look like right now?*

**Reading the dots:**
- **Hops inside the green region are normal sensor noise.** The fire map's "Normal" region has 84 cells, each a slightly
  different version of normal, so small random changes move the best match between neighbouring green cells.
- **Crossing a border is what matters:** green → amber is a precursor or drift; amber → red is a hazard developing.
- **Dotted trail:** the zone's path since it left Low, e.g. UPS Normal → Battery cell drift → Li-ion off-gas (details below).
- **Pulsing outline:** the zone is at High or above.
- **Grey dot:** an unfamiliar pattern (QE above the novelty threshold), so the twin says Unknown instead of guessing.
- The table "Where each zone is now" under the maps lists the same thing as text: zone, region, level and QE.

### Why some hexagons are red and amber from the start
**The coloured hexagons do not mean anything is wrong. They are a fixed map of every situation the twin knows about,
including faults. Only the dots show live status.**

- When the page loads, the SOM is trained on examples of **normal operation and of each fault type** (dust, battery drift,
  off-gas, joint heating, hot spot, smoulder, suspect sensor). Training places each kind of situation in its own area,
  coloured by how serious it would be:

  | Colour | Means "if a zone lands here…" | Regions on the fire map |
  |---|---|---|
  | Green | it is normal | Normal (84 cells) |
  | Amber | a precursor or nuisance | Dust / maintenance nuisance, Battery cell drift, Electrical joint heating |
  | Red | a hazard is developing | Li-ion off-gas, Electrical hot spot, Smouldering / early smoke |
  | Grey | a sensor is probably faulty | Single-sensor spike |

- The map works like a **map of territories**: the red areas are places a zone *could* go, not places it is now. The fault
  regions have to be there from the start, otherwise the map could not recognise a fault when it appears.
- **An alarm means a dot has moved into an amber or red area.** In the battery scenario the UPS dot goes from green into
  "Battery cell drift" and then "Li-ion off-gas". The regions themselves never change while the page is open.
- The page opens on the battery scenario, which is already running, so the UPS dot leaves green at about T+29 min. For a
  calm start, choose **Normal operation**: every dot stays in green.

**To make this clear on screen:**
- **Faded regions:** a region is drawn at full colour only while at least one zone's dot is in it; all others are faded.
  At start-up only the green Normal region is bright. When the UPS dot enters "Li-ion off-gas", that region lights up.
  This applies to both large maps (in *Regions* mode) and the mini map on the Digital twin tab.
- **Caption above each map:** "Colours = what each area means (fixed). Dots = live status. Faded areas = no zone there now."

### The dotted lines (trails)
**A dotted line is a zone's trail: the cells its dot has passed through, joined in order, ending at the dot.**
- A trail starts **when the zone leaves Low**. While a zone is Low only its current cell is kept, so normal noise never
  draws a trail.
- It keeps the last 18 cells. A typical battery trail runs from the edge of Normal, through Battery cell drift, into Li-ion off-gas.
- Long straight segments are jumps: the zone's situation changed enough between two ticks to match a cell further away.
- When the zone returns to Low, its trail disappears.

### Smoothing toggle
**Smoothing toggle (SOM maps tab, top right): `Raw` / `Smoothed (5 ticks)`. Smoothed is the default.**
- *Raw:* the map uses only the latest reading.
- *Smoothed:* the map uses the **rolling mean of the last 5 ticks** of each zone's feature vector. This follows the plan's
  feature layer (L2), which works on rolling windows rather than single readings.
- **Hard limits always use the raw reading**, so smoothing never delays a limit alarm. It only affects the SOM region.
- *Measured on the normal scenario:* a zone's dot changes cell on **83 % of ticks raw vs 30 % smoothed**. Real drifts still
  cross borders in both modes.
- *Cost:* no Medium warning changed in any scenario, because those come from the raw hard limits. Some High levels arrive
  1–3 ticks later: battery T+59 vs T+56 min, smoulder T+20 vs T+19 min, CDU pump 22.7 h vs 21.5 h.
- *Window length depends on the scenario's tick:* 5 ticks = 5 min (battery), 2.5 min (smoulder, dust), 5 h (busbar joint),
  50 min (P2 energy and water scenarios). The hint under the map title shows the current value.
- From the console: `EMBER.api.setSmoothing(1)` for raw, `EMBER.api.setSmoothing(5)` for smoothed.

## How to run a simulation
1. Open `index.html`. The **Li-ion battery off-gas** scenario starts playing automatically.
2. Pick a scenario from the **dropdown** at the top. It is grouped into *P1 Fire safety*, *P2 Energy & zero water* and *Baseline*.
3. Use the controls:

   | Control | What it does |
   |---|---|
   | ▶ / ⏸ | Play or pause the simulated clock |
   | ⏭ | Advance one tick (pauses first); good for stepping through a demo |
   | ↺ | Restart the current scenario from the beginning |
   | Speed 1×–25× | Ticks per second. Each scenario sets how much simulated time one tick is (shown in the scenario bar) |

4. Watch the **clock** (`Day 1 09:14 · T+1.2 h`). **T+0** is the moment the fault starts. Before T+0 there is a short
   warm-up of normal data (`T−…`), so the charts show what "normal" looked like.
5. Click any zone, asset, rack or sensor dot on the floor plan to see its **measured vs expected** chart and its bands.
6. Open the **SOM maps** tab to watch each zone's dot move between regions (switch `Raw` / `Smoothed` there), and the
   **Energy & zero water** tab for the P2 scenarios.

**Direct links** open a scenario on a chosen tab:
`index.html#scenario=<id>&tab=<twin|som|energy|dims|how>`, e.g. `index.html#scenario=smoulder&tab=som`.

**From the browser console** (for demos and tests), e.g. to jump straight to the end of a scenario:
```js
EMBER.api.setPlaying(false);
EMBER.api.loadScenario('battery');
for (let i = 0; i < 75; i++) EMBER.api.tick();   // 75 ticks = 75 simulated minutes here
EMBER.api.showTab('twin');
EMBER.api.setSmoothing(1);                         // SOM on raw readings (5 = smoothed, the default)
```

**Without a browser**, check all scenarios at once (needs Node.js):
```
node tests/check_scenarios.js
```
It runs every scenario twice, with the SOM on raw and on smoothed features, and prints for each the SOM regions reached, the first Medium and High times, the certified event and the lead time.
It fails if a scenario misses its expected region, if the twin does not warn before the certified system, or if the
normal scenario raises any alert.

## Early-warning lead time (the card on the Digital twin tab)
**Lead time is how much earlier the twin warned than the certified fire or gas system.**

Example from the battery scenario:

| Event | Time | What happened |
|---|---|---|
| Fault starts | T+0 | One cell in string B2 starts degrading; nothing is visible yet |
| **Twin first warning (Medium, Amber)** | **T+29 min** | Cell temperature more than 2 °C above the battery model's expected value; voltage spread growing |
| Twin High (Red) | T+59 min | Electrolyte off-gas detected; the SOM moves the UPS-room dot into the "Li-ion off-gas" region |
| **Certified system acts** | **T+82 min (1.4 h)** | The UPS-room aspirating smoke detector (ASD) reaches its "Action" stage because smoke is now present |

**Lead time = certified event − twin first warning = 82 − 29 = 53 min.** Counted from the Red warning it is 82 − 59 = 23 min
(26 min with the SOM on raw readings, where High comes at T+56).

- **Why the twin is earlier:** the certified smoke detector reacts only to smoke, which comes late. The twin watches the
  precursors that come first: temperature and voltage drift, then off-gas, then smoke. This is the incipient-stage gap in
  the plan.
- **The card measures from the first Medium warning.** For the paper, report both the Medium-based and the High-based lead
  time; a Medium warning may not trigger action at every site. This matches the plan's §9 metric (lead time before the first
  certified fire-system stage).
- Before the certified event fires, the card shows **"Ahead by X so far"**. Afterwards it shows the final **"Lead time"**.
- P2 (energy and water) scenarios have no certified alarm, so the card shows only the twin's first warning.
- **The numbers come from the dummy data, not from experiments.** `js/scenarios.js` sets when each signal starts rising and
  when the certified alarm fires. They show how the metric works. Real lead times will come from battery abuse test data,
  FDS fire simulations and lab tests (plan Phases 2 and 6).

## Scenarios covered with dummy data
"Medium lead" = certified event − twin first Medium; "High lead" = certified event − twin first High. A negative value
means the twin reached that level after the certified system.

| Priority | Scenario (`id`) | Twin first Medium | Twin first High | Certified event | Medium lead | High lead |
|---|---|---|---|---|---|---|
| P1 | Li-ion battery off-gas, string B2 (`battery`) | T+29 min | T+59 min (raw 56) | ASD Action, T+82 min | 53 min | 23 min (raw 26) |
| P1 | Loose busbar joint, SWB-1 L2 (`joint`) | day 4 | day 9.2 | ASD Alert, day 13.6 | 9.6 days | 4.4 days |
| P1 | Smouldering cable, hall A sub-floor (`smoulder`) | T+11 min | T+20 min (raw 19) | ASD Action, T+26 min | 15 min | 6 min (raw 7) |
| P1 | Dust from maintenance, hall B (`dust`) | T+8.5 min | never (correct) | ASD Alert (nuisance), T+13 min | 4.5 min | n/a |
| P1 | ASD pipe blocked, hall A (`asdblock`) | T+17 min | T+27 min | ASD airflow fault, T+31 min | 14 min | 4 min |
| P1 | A2L refrigerant leak, trim chiller (`refrig`) | T+18 min | T+37 min | Gas alarm 25 %LFL, T+36 min | 18 min | −1 min |
| P2 | Dry-cooler fouling (`fouling`) | 18 h | 1.7 days | none | n/a | n/a |
| P2 | Closed-loop coolant leak (`leak`) | 8.5 h | 21 h | none | n/a | n/a |
| P2 | Heatwave with adiabatic assist (`heatwave`) | day 1 | day 1 | none | n/a | n/a |
| P2 | Overcooling (`overcool`) | 11.7 h (raw 11.5) | never | none | n/a | n/a |
| P2 | CDU pump degradation (`pump`) | 13.8 h | 22.7 h (raw 21.5) | none | n/a | n/a |
| — | Normal operation (`normal`) | none | none | none | n/a | n/a |

Times are from `node tests/check_scenarios.js` (fixed random seed, so they repeat exactly), with the default smoothed SOM;
"raw" in brackets shows the value with the SOM on raw readings where it differs.

### P1: fire safety, battery and fire-related detection

**1. Li-ion battery off-gas → thermal-runaway precursor (`battery`)** · 1 tick = 1 min · runs 95 min
- *Story:* one cell in string B2, module 7, degrades.
- *Dummy signals:* cell temperature rises above the model from T+5 min (+3.5 °C by T+60, +10.5 °C by T+90). Cell voltage spread
  grows from T+10. Off-gas at the B2 sensor from T+30 (20 ppm by T+65, 90 ppm by T+90). Hydrogen from T+55. Smoke and CO in the
  room from T+72–75, with small (smoke) particles.
- *Certified:* ASD Action at T+82, ASD Fire 1 at T+88 (zone turns Critical, flashing).
- *Watch:* string B2 turns Amber then Red; the UPS dot on the fire SOM moves Normal → Battery cell drift → Li-ion off-gas;
  the diagnosis says it is a single-cell fault, not a sensor fault.

**2. Loose busbar joint heating (`joint`)** · 1 tick = 1 h · runs 14 days
- *Story:* a joint on main switchboard SWB-1, phase L2, slowly loosens.
- *Dummy signals:* L2 runs hotter than L1/L3: +5 °C by day 7, +25 °C by day 13. The rise is scaled by load², so it swings with
  the daily load cycle. Late on (day 12–14), CO, VOC and fine smoke appear as nearby insulation overheats.
- *Certified:* ASD Alert in the electrical room at day 13.6.
- *Watch:* the longest lead time (days); the electrical room dot moves Normal → Electrical joint heating → Electrical hot spot.

**3. Smouldering cable under raised floor (`smoulder`)** · 1 tick = 30 s · runs 45 min
- *Story:* cable insulation smoulders in the hall A sub-floor near rack A1-07.
- *Dummy signals:* ASD obscuration rises from T+5 (0.24 %obs/m by T+38). CO from T+8 (35 ppm by T+40). The particle ratio drops
  (small particles = smoke). Rack temperatures stay normal (little heat).
- *Certified:* ASD Action at T+26, Fire 1 at T+32.5.
- *Watch:* multi-sensor fusion. The SOM recognises "Smouldering / early smoke" while obscuration is still below the ASD's fixed stages.

**4. Dust from maintenance: nuisance (`dust`)** · 1 tick = 30 s · runs 40 min
- *Story:* floor-tile cutting in hall B under permit PTW-0412 (shown on the lead-time card).
- *Dummy signals:* obscuration rises to 0.11 %obs/m (T+5 to T+15), then falls after T+30. The particle ratio rises (large
  particles = dust). CO stays flat.
- *Certified:* ASD Alert (nuisance) at T+13.
- *Watch:* the twin stays **Amber** and explains it as "Dust / maintenance nuisance". It reduces nuisance alarms without ever
  silencing the certified alarm.

**5. ASD sampling pipe blocked: detection impaired (`asdblock`)** · 1 tick = 1 min · runs 60 min
- *Story:* the hall A smoke-sampling pipe gradually blocks (fire-protection readiness, P2 Detection impaired).
- *Dummy signals:* airflow deviation rises from T+5 to 32 % by T+40; obscuration reads slightly *below* normal background.
- *Certified:* ASD airflow fault at T+31.
- *Watch:* the readiness panel row "P2 Detection healthy" goes Amber then Red, and hall A turns Red even though there is no smoke.

**6. A2L refrigerant leak at trim chiller (`refrig`)** · 1 tick = 1 min · runs 50 min
- *Story:* mildly flammable refrigerant leaks in the cooling plant.
- *Dummy signals:* refrigerant concentration rises from T+5 to 32 %LFL by T+45.
- *Certified:* gas detection alarm at 25 %LFL, T+36.
- *Watch:* no SOM covers this zone, so the **hard limit alone** sets the severity: limits are the severity floor. The twin's
  Medium comes 18 min before the gas alarm; its High comes 1 min after, because both use 25 %LFL.

### P2: energy efficiency and zero-water cooling

**7. Dry-cooler coil fouling (`fouling`)** · 1 tick = 10 min · runs 3 days
- *Dummy signals:* the dry-cooler approach temperature drifts up by 5 °C over 3 days; fans work harder, so PUE rises above the model.
- *Watch:* "Dry-cooler approach" residual on the chart; the plant dot moves into "Dry-cooler fouling".

**8. Closed-loop coolant leak (`leak`)** · 1 tick = 10 min · runs 2.5 days
- *Dummy signals:* make-up water appears from 0.3 days and reaches 30 L/h by day 2; CDU flow drops 4 %.
- *Watch:* a sealed loop should need zero top-up, so any make-up water is a leak. It breaks zero water and puts water near power.

**9. Heatwave: adiabatic water assist switched on (`heatwave`)** · 1 tick = 10 min · runs 3 days
- *Dummy signals:* outdoor temperature rises 14 °C (day 0.25–0.75) and falls back (day 2.25–2.75). Adiabatic spray is allowed,
  so it switches on whenever the chiller would otherwise be needed.
- *Watch:* WUE jumps from 0 to about 0.3 L/kWh. PUE stays *below* the zero-water model, which is the energy-vs-water trade-off.
  Compare both policies in the what-if panel.

**10. Overcooling: setpoint too low (`overcool`)** · 1 tick = 10 min · runs 2 days
- *Dummy signals:* rack inlet temperatures fall 5 °C below the model and cooling power rises by 6 % of the IT load.
- *Watch:* nothing is unsafe (it stays Amber), but energy is wasted. The plant dot moves into "Overcooling".

**11. CDU pump degradation (`pump`)** · 1 tick = 10 min · runs 2.5 days
- *Dummy signals:* CDU coolant flow falls 22 % below the pump-curve model; rack inlet temperatures rise by up to 6 °C.
- *Watch:* the halls also turn Amber because the racks run hotter. That is a real consequence, not a false alarm, so the test allows it.

### Baseline

**12. Normal operation (`normal`)** · 1 tick = 5 min · runs 2 days
- *Dummy signals:* only normal noise, the daily IT-load cycle (±8 %) and the daily outdoor temperature cycle (7–21 °C). Water use is zero.
- *Watch:* everything stays Green and **no alerts** are raised. This is the false-alarm check.

## Adding or changing a scenario
Each scenario is one object in `js/scenarios.js`:
```js
{
  id: 'myscenario', title: '…', priority: 'P1',      // 'P1', 'P2' or '—'
  zone: 'UPS', location: { x: 635, y: 145, label: '…' }, // where the hazard ring is drawn
  minutesPerTick: 1, durationMin: 60, warmupTicks: 30,
  expectClass: 'BATT_OFFGAS',                          // SOM region the test expects (optional)
  effects: function (t, env) {                         // t = simulated minutes since T+0
    return {
      points: { 'CT-B2': E.ramp(t, 5, 60, 3.5) },      // add to a sensor point (ids in js/config.js)
      energy: { approachDelta: 0, makeupLph: 0 },      // or change the cooling plant
    };
  },
  certified: [{ atMin: 50, zone: 'UPS', state: 'PRE-ALARM', label: '…' }], // what the certified system does, and when
  diagnosis: { issue: '…', text: '…', actions: [{ tier: 'A', text: '…' }] },
}
```
`E.ramp(t, start, end, value)` rises linearly from 0 at `start` to `value` at `end`. Add your `id` to `FOCUS` in `js/app.js`
to pick which sensor is charted first, then run `node tests/check_scenarios.js`. The new scenario appears in the dropdown
automatically.

## Dimensions (severity bands)
There is one scale for everything: **Low = Green, Medium = Amber, High = Red, Critical = flashing Red** (a certified fire stage
was reached, mirrored read-only), and **Unknown = Grey** (sensor fault or an unfamiliar pattern). A zone takes the **worst** of:
its dimensions' bands, its SOM region, Unknown if the QE is too high, and the certified panel state.

| Priority | Dimension | Basis | Low | Medium | High |
|---|---|---|---|---|---|
| P1 | ASD smoke obscuration | measured | < 0.05 %obs/m | 0.05–0.15 | ≥ 0.15 |
| P1 | Carbon monoxide | measured | < 10 ppm | 10–30 | ≥ 30 |
| P1 | Li-ion off-gas | measured | < 5 ppm | 5–25 | ≥ 25 |
| P1 | Hydrogen | measured | < 10 %LEL | 10–25 | ≥ 25 |
| P1 | Battery cell temperature | residual | < 2 °C | 2–5 | ≥ 5 |
| P1 | Cell voltage imbalance | measured | < 30 mV | 30–80 | ≥ 80 |
| P1 | Joint ΔT vs similar phase | measured | < 4 °C | 4–15 | ≥ 15 (NETA thermography guidance) |
| P1 | A2L refrigerant | measured | < 10 %LFL | 10–25 | ≥ 25 |
| P1 | ASD airflow deviation | measured | < 10 % | 10–20 | ≥ 20 |
| P1 | Suppression cylinder pressure | measured | > 95 % | 90–95 | ≤ 90 |
| P2 | Rack inlet temperature | measured | < 27 °C | 27–32 | ≥ 32 (ASHRAE) |
| P2 | PUE | measured | < 1.20 | 1.20–1.35 | ≥ 1.35 |
| P2 | Chiller-free share (24 h) | measured | > 85 % | 60–85 | ≤ 60 |
| P2 | Dry-cooler approach | residual | < 1.5 °C | 1.5–3 | ≥ 3 |
| P2 | CDU flow | residual | > −5 % | −5 to −15 | ≤ −15 |
| P2 | WUE | measured | < 0.02 L/kWh | 0.02–0.2 | ≥ 0.2 |
| P2 | Closed-loop make-up water | measured | < 1 L/h | 1–10 | ≥ 10 |
| P2 | Adiabatic spray water | measured | < 0.1 L/h | 0.1–150 | ≥ 150 |

**All bands are illustrative.** Real values must come from the site fire strategy, manufacturers' limits, the insurer and
the standards. To change a band, edit `js/config.js`; the UI and the Dimensions tab update automatically.

## How the hexagonal SOM regions are made
1. **Grid.** The cells use an "odd-r" offset hexagonal layout. Cell (col, row) is drawn at `x = col·√3·r + (row odd ? √3·r/2 : 0)`,
   `y = row·1.5·r`. The training neighbourhood uses distances between those positions, as MiniSom's `topology='hexagonal'` does.
2. **Train.** Each sample finds its BMU. The BMU and its neighbours move towards the sample, using a Gaussian neighbourhood that
   shrinks over time (7,000 steps, about 70 ms in the browser).
3. **Label.** Each cell takes the most common class among the samples it wins. Empty cells copy their nearest labelled cell.
4. **Colour.** The class's severity level sets its RAG colour. Thick borders are drawn wherever neighbouring cells have different labels.
5. **Live.** Each tick, every zone's feature vector `(signal − centre) / scale` finds its BMU, and the zone's dot moves there.
   QE above 1.5 × the training 99th percentile reports **Unknown** instead of guessing.

The prototype trains on synthetic clusters (`E.SOMS[...].classes`). With real data, train in Python (MiniSom) on normal
residuals plus labelled simulated faults (FDS, fault injection), export the weights and labels as JSON, and load them in
place of `E.buildSOM`.

## Files (built for reuse)
| File | Role | Keep when real data arrives? |
|---|---|---|
| `js/config.js` | Levels, dimensions, zones, assets, sensor points, SOM definitions | Yes, edit for the site |
| `js/engine.js` | Cooling-plant physics model and the evidence layer (bands + SOM + panel → zone level), incl. optional SOM feature smoothing | Yes |
| `js/som.js` | Hex SOM: training, labelling, U-matrix, rendering (incl. fading unoccupied regions) | Yes (rendering); training moves to Python |
| `js/twin.js`, `js/charts.js` | Floor plan and charts | Yes |
| `js/app.js` | Wiring, alerts, tabs; `EMBER.api` for tests and demos | Yes |
| `js/sim.js`, `js/scenarios.js` | **Dummy data source** and scenario catalogue | Replace with a feed returning the same snapshot shape |
| `tests/check_scenarios.js` | Headless check, raw and smoothed: each scenario reaches its SOM region and warns before the certified system; normal runs raise no alerts | Yes |

## Limits of this prototype
- The data, the physics coefficients and the diagnosis text are all illustrative. The diagnosis is a fixed stand-in for the guarded LLM.
- Readiness items P3 (enclosure integrity) and P4 (pre-action water system) are static placeholders.
- The twin never controls the certified fire systems; the UI only mirrors their state.
