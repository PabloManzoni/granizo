# Hail Guard / Hail Risk — Product & Technical Brief

## 1. Product idea
A focused product for one decision: **“Can I leave my car outside, or should I protect/move it because hail conditions are meaningful?”**

The product is not a generic weather app. It is a **decision-support tool for hail risk**, initially designed for Uruguay and the Río de la Plata region.

Primary situations:
- Before going to work: “Is today a day where I should avoid leaving the car exposed?”
- When arriving somewhere: “Can I park here for the next 3–8 hours without worrying?”
- Before sleeping: “Can I leave the car outside tonight?”
- When the weather starts looking bad: “Are the atmospheric conditions actually favorable for hail, or is this just rain/stormy weather?”

The MVP can be a PWA. The user opens it, allows location access, taps one button, chooses a time horizon, and gets a simple result. Continuous GPS tracking is not required for the first version.

## 2. Core product question
The product should avoid claiming “it will hail”. The correct question is:

**“How favorable are the conditions for hail at this location during this time window, and is the risk high enough that protecting the car is a sensible precaution?”**

This distinction matters because hail forecasting is probabilistic. A dangerous environment can exist without a storm forming exactly over the user, and a storm can form but miss the point location.

## 3. Desired user experience
Suggested main CTA:

**Can I leave my car outside?**

Inputs:
- Current location or chosen location
- Time window: next 1 h / 3 h / 6 h / tonight / until morning / custom

Possible output states:
- **Low** — little support for hail-producing storms
- **Possible** — some ingredients exist, but the signal is weak or incomplete
- **Elevated** — several important ingredients align
- **Protect** — environment is strongly favorable and/or observed evidence confirms severe convection nearby

Example copy:
- “Low risk until 08:00. I would leave the car outside.”
- “Some hail ingredients are present, but storm initiation is uncertain. Check again in 2 hours.”
- “Elevated hail risk between 17:00 and 21:00. If a garage is available, protecting the car is reasonable.”
- “Protect the car. Severe convection is already developing and official warnings are active.”

The app should also explain *why* in one or two short bullets, e.g. “high instability + strong wind shear” or “official storm warning + rapid convective growth nearby”.

## 4. How a meteorologist evaluates hail potential
A meteorologist does not look at one variable. The assessment is a synthesis of several layers.

### A. Fuel / instability
Question: **Can the atmosphere support strong upward motion?**

Useful variables:
- CAPE, especially MUCAPE
- Surface/dew point temperature
- Low-level moisture
- Potential temperature / parcel characteristics

High CAPE alone is not enough. It means the atmosphere has energy available if convection can actually initiate.

### B. Convective initiation / trigger
Question: **Is there a mechanism that can start storms?**

Useful signals:
- CIN (convective inhibition)
- Surface fronts
- Low-level convergence
- Troughs / shortwaves
- Pressure tendencies
- Lift from mesoscale boundaries

Example: very high CAPE with strong CIN can mean “loaded atmosphere, but capped”. The risk may remain limited until the cap breaks.

### C. Storm organization
Question: **Can storms remain organized long enough to produce severe hail?**

Useful variables:
- 0–6 km bulk shear
- Effective bulk shear
- Wind profile at multiple levels
- Storm-relative helicity as a secondary indicator for supercell potential

Strong deep-layer shear helps separate the updraft and downdraft, allowing a storm to sustain a strong updraft for longer.

### D. Hail growth environment
Question: **Can hailstones grow efficiently inside the cloud?**

Useful variables:
- 700–500 hPa lapse rate
- Temperature at 500 hPa
- Height/depth of the hail growth zone
- Supercooled liquid water availability
- Updraft strength through subfreezing levels

The most useful conceptual region is the cold cloud layer where supercooled water and strong ascent support repeated accretion of ice.

### E. Hail survival to the ground
Question: **Will hail melt before reaching the car?**

Useful variables:
- Freezing level height
- Wet-bulb zero height
- Depth and temperature of the warm layer below freezing level
- Precipitation loading / downdraft characteristics

A very high freezing level can reduce the chance that smaller hail reaches the ground intact, although large hail can still survive.

### F. Real-world confirmation
Question: **Is the potential already becoming reality?**

Useful sources:
- Weather radar, if reliable regional coverage is available
- Geostationary satellite imagery
- Lightning data
- Official severe-weather warnings
- Surface observations

This layer should increase confidence sharply because it moves the system from “environmental potential” toward “observed severe convection”.

## 5. Important derived parameters
The system should calculate or ingest a small set of derived indicators rather than giving an LLM raw atmospheric grids.

Recommended initial set:
- MUCAPE
- CIN
- 0–6 km bulk shear
- Effective bulk shear if available
- 700–500 hPa lapse rate
- 500 hPa temperature
- Freezing level
- Wet-bulb zero height
- Precipitable water / low-level moisture
- Convective precipitation probability or convective signal
- Hail-related composite indices where available

One existing reference is the **Significant Hail Parameter (SHIP)** used in severe-weather analysis. Its value is not “hail probability”; it is a compact indicator of an environment supportive of significant hail. The product can use the same philosophy without depending on SHIP as a single truth source.

## 6. Recommended architecture of the “Hail Risk Engine”
Do not ask the LLM to invent meteorology from raw values.

Preferred pipeline:

**Weather data → deterministic calculations → evidence fusion → LLM explanation → user decision message**

Example intermediate payload:

```json
{
  "location": "-34.8,-56.1",
  "window": "18:00-02:00",
  "mucape": 1850,
  "cin": -18,
  "shear_0_6km_ms": 21,
  "lapse_700_500": 7.1,
  "freezing_level_m": 3100,
  "wet_bulb_zero_m": 2700,
  "model_agreement": "moderate",
  "official_warning": true,
  "satellite_convection": "developing",
  "lightning_trend": "increasing"
}
```

The deterministic layer can classify each ingredient as unfavorable / marginal / favorable / strongly favorable. The LLM then has a small, structured problem: reconcile signals, explain contradictions, and write user-facing language.

## 7. What the LLM should and should not do
### Good uses
- Explain why the risk is low/elevated
- Reconcile conflicting models
- Explain uncertainty
- Turn technical variables into clear language
- Produce concise recommendations appropriate to the time window

### Bad uses
- Calculate CAPE or shear from scratch
- Guess missing data
- Invent thresholds
- Decide solely from prose such as “hot and humid today, cold tonight”
- Replace official warnings or nowcasting data

For cost control, the prompt can be very small. A compact JSON plus a short system prompt is enough, so token cost should be minor during early validation.

## 8. Data sources: open-first strategy
The preferred strategy is to use open meteorological data where practical, process only what the product needs, and pay for convenience later if scale or maintenance justifies it.

### ECMWF Open Data
ECMWF publishes a subset of real-time IFS/AIFS forecast data as open data. It may be redistributed and used commercially under CC BY 4.0 with attribution. This is a strong candidate for a high-quality global model input.

Official source: https://www.ecmwf.int/en/forecasts/datasets/open-data
License/terms: https://apps.ecmwf.int/datasets/licences/general/

### NOAA / NCEP global models
GFS can provide deterministic global forecast fields. GEFS adds ensemble members, which are valuable for uncertainty and model spread. For this product, ensemble agreement is useful because the user is not asking for exact rain totals; they are asking whether a dangerous convective setup is plausible enough to act on.

Potential use:
- GFS: baseline deterministic forecast
- GEFS: uncertainty / probability / spread

### INUMET
INUMET should be treated as a first-class local source, especially for:
- Official warnings
- Local forecast context
- Surface observations
- Historical warning archive
- Open-data catalog where usable

The current INUMET site exposes meteorological warnings and a historical warning archive, making it useful both operationally and for later validation/backtesting.

Official site: https://www.inumet.gub.uy/
Warnings: https://www.inumet.gub.uy/alerta

### Satellite
GOES imagery can help detect rapidly growing convection before hail is confirmed at the surface. Useful derived concepts include:
- Rapid cloud-top cooling
- Overshooting tops
- Convective growth
- Infrared cloud-top temperatures

Satellite should be a confirmation/nowcast layer, not the sole forecast source.

### Lightning
A fast increase in lightning activity can be a useful supporting signal that a convective cell is intensifying. It should be treated as additional evidence, not a direct hail detector.

### Radar
Radar is extremely valuable when coverage and access are reliable because it can move the product from “conditions exist” to “a severe cell is actually nearby”. However, the MVP should not depend on radar if regional access is inconsistent.

## 9. Multi-source evidence fusion
The product should never trust one model blindly.

A simple first-generation approach:
- ECMWF environmental signal
- GFS environmental signal
- GEFS probability/spread
- INUMET official warning status
- Satellite convective development
- Lightning trend
- Radar confirmation when available

The system should explicitly track disagreement.

Examples:
- ECMWF high + GFS high + GEFS clustered + INUMET warning → high confidence
- ECMWF high + GFS low + GEFS broad spread + no observed convection → uncertain / Possible
- Models moderate + severe cell observed nearby + official warning → Protect, because observed evidence dominates forecast uncertainty

## 10. Risk scale design
Avoid fake precision such as “73% chance of hail” unless there is a genuinely calibrated probabilistic model.

A better early scale:

### Low
Few hail ingredients; no meaningful observed confirmation.

### Possible
Some ingredients align, but one or more important elements are missing or uncertain.

### Elevated
Multiple ingredients align across models, with limited contradictions.

### Protect
Very favorable environment and/or real-time evidence indicates severe convection capable of hail near the location/time window.

Each result should also include **confidence** separately:
- Low confidence
- Medium confidence
- High confidence

Risk and confidence are not the same thing.

## 11. Local calibration for Uruguay
Do not copy U.S. thresholds blindly. Severe-weather indices developed in the United States are useful references, but the product should be calibrated against Uruguay and nearby Argentina / southern Brazil.

Recommended validation dataset:
- Historical INUMET warnings
- News reports of damaging hail
- User-submitted hail events
- Radar/satellite archives where obtainable
- Historical GFS/GEFS/ECMWF fields for those dates

Goal: learn which combinations were actually associated with damaging hail in the region.

Possible future approach:
1. Build a historical event list.
2. Extract atmospheric variables 1–12 hours before each event.
3. Create matched “no-hail” control days.
4. Compare distributions.
5. Tune thresholds/weights.
6. Later train a simple interpretable classifier if enough data exists.

Start rule-based. Machine learning should come later, after there is a labeled dataset.

## 12. MVP scope
### Version 0 — personal prototype
One screen:
- Use my location
- Select time window
- Check hail risk

Output:
- Low / Possible / Elevated / Protect
- 1–3 reasons
- Confidence
- Last data refresh
- Official warning indicator

No accounts. No background tracking. No push notifications.

### Version 1 — small friend group
Add:
- Saved locations: Home / Work / Car
- Recent checks
- Shareable result link
- Feedback: “Did hail occur here?”
- Optional manual report/photo

This feedback becomes valuable validation data.

### Version 2 — monitoring
Add:
- “Watch my parked car until 18:00”
- Push notification when risk materially rises
- Background server-side checking by saved point, not continuous device GPS

Important: even this does not require the app to track the phone constantly. The user can explicitly save where the car is parked, and the server monitors that coordinate.

## 13. PWA vs native app
For the first version, a PWA is enough because the core flow is user initiated:
1. Open app
2. Request location
3. Evaluate risk
4. Return answer

Native Android/iOS becomes more valuable if the product later needs:
- More reliable background behavior
- Rich notifications
- OS-level geofencing
- Deeper device integration

Do not let native development delay validation of the decision model.

## 14. Product positioning
Avoid “another weather app”.

Stronger positioning:
**A hail decision assistant for your car.**

The job-to-be-done is not “tell me the weather”. It is:
**“Remove the uncertainty around whether I should protect my car.”**

Potential product questions:
- “Can I leave the car outside tonight?”
- “Should I move the car before the storm?”
- “Is today actually a hail-risk day?”
- “The sky looks terrible — is this hail weather or just rain?”

## 15. Evidence that the problem is real
The recurring behavior observed in discussions is not “I need another forecast”. It is:
- People see ugly weather and do not know whether to protect the car.
- Once hail starts, it may be too late to install a cover or move the vehicle.
- People rely on generic forecasts, news reports, visual intuition, or messages from friends.
- A recent nearby hail event increases anxiety even when users do not know whether the same environment applies to their location.

That suggests a product opportunity around **decision confidence**, not just detection.

Existing hail products tend to cluster around:
- Real-time hail/radar tracking
- Push alerts when hail is detected nearby
- Professional storm intelligence for roofing/insurance

The proposed differentiation is the earlier question:
**“Before hail is detected, are conditions strong enough that I should change what I do with my car?”**

## 16. Safety / trust principles
The product should never claim certainty.

Required language principles:
- Say “risk”, “conditions are favorable”, “possible”, “elevated”
- Never say “hail will definitely occur at your exact location”
- Show data timestamp
- Show model disagreement
- Show official warning status prominently
- Explain that “Low” does not mean impossible
- When observed severe weather is nearby, favor caution in wording

## 17. Suggested first deterministic scoring model
This is a prototype structure, not a scientifically calibrated final formula.

Create ingredient scores from 0–1 for:
- Instability
- Trigger probability
- Deep-layer shear
- Hail growth thermodynamics
- Hail survival
- Model agreement
- Observed convection
- Official warning

Then combine them with transparent rules rather than a mysterious weighted average.

Example logic:
- If instability is low → cap overall risk unless severe convection is already observed nearby.
- If instability + shear + hail-growth environment are all strong → at least Elevated if initiation is plausible.
- If official severe-storm warning + observed rapidly intensifying convection are relevant to the point → Protect can override moderate model scores.
- If models strongly disagree → lower confidence, not necessarily lower risk.

This rule-based engine will be easier to debug and calibrate than an early ML model.

## 18. What to build first in Codex
Suggested implementation order:
1. PWA shell with geolocation and time-window selection.
2. Define a canonical `HailRiskInput` JSON schema.
3. Connect one model source first, preferably an easy API or preprocessed source.
4. Compute a small set of ingredients.
5. Implement deterministic classification.
6. Add INUMET warning ingestion.
7. Add LLM explanation on top of the deterministic result.
8. Log every check with input variables and outcome.
9. Add a feedback button: “Hail happened / No hail / I don’t know”.
10. Only then add a second/third model, satellite, lightning, radar, and push monitoring.

## 19. Suggested data contract
```ts
interface HailRiskInput {
  lat: number;
  lon: number;
  startTime: string;
  endTime: string;
  modelRuns: {
    source: 'ECMWF' | 'GFS' | 'GEFS';
    mucape?: number;
    cin?: number;
    bulkShear06?: number;
    lapseRate700500?: number;
    temp500?: number;
    freezingLevel?: number;
    wetBulbZero?: number;
  }[];
  inumet: {
    warningActive: boolean;
    phenomenon?: string;
    severity?: string;
  };
  observations?: {
    satelliteConvection?: 'none' | 'developing' | 'strong';
    lightningTrend?: 'none' | 'stable' | 'increasing' | 'rapidly_increasing';
    radarHailSignal?: boolean;
  };
}
```

Output:
```ts
interface HailRiskResult {
  risk: 'low' | 'possible' | 'elevated' | 'protect';
  confidence: 'low' | 'medium' | 'high';
  validFrom: string;
  validTo: string;
  reasons: string[];
  contradictions: string[];
  officialWarning: boolean;
  recommendation: string;
  dataUpdatedAt: string;
}
```

## 20. Key research questions still open
- Which exact free/open endpoints provide the needed variables with the least operational complexity?
- What hail-relevant regional radar data is reliably accessible for Uruguay?
- Which lightning dataset/API has acceptable latency and licensing?
- What thresholds should be used specifically in Uruguay/Río de la Plata?
- How far ahead does the tool remain useful: 3 h, 6 h, 12 h, overnight?
- What is the best action threshold for car owners: probability of any hail vs probability of damaging hail?
- Can historical INUMET warning archives plus news/user reports provide enough labels for initial calibration?

## 21. Success criteria for the prototype
The first goal is not mass adoption. It is to answer:

**“Would I trust this enough to decide whether to leave my own car outside?”**

Track:
- How often the app says Elevated/Protect
- How often hail actually occurs nearby
- False alarms
- Missed events
- Whether the recommendation changed user behavior
- Whether users understand the explanation
- Whether they check proactively before work/sleep/parking

A useful prototype should reduce anxiety without crying wolf every time thunderstorms are forecast.

## 22. Recommended principle
**Meteorology first, AI second.**

Use deterministic meteorological calculations and multiple data sources to establish the risk. Use the LLM to synthesize, explain uncertainty, and communicate the answer in natural language.

That creates a product that is easier to validate, cheaper to run, and much more trustworthy than “ask an AI if it will hail”.

## References / starting points
- ECMWF Open Data: https://www.ecmwf.int/en/forecasts/datasets/open-data
- ECMWF Open Data terms: https://apps.ecmwf.int/datasets/licences/general/
- INUMET: https://www.inumet.gub.uy/
- INUMET warnings: https://www.inumet.gub.uy/alerta
- INUMET historical warnings: https://www.inumet.gub.uy/tiempo/historico-alertas-meteorologicas

