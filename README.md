# BhoomiPredict

**AI-powered land acquisition intelligence and early-warning platform**

Track → Predict → Explain → Prioritise → Intervene → Monitor

BhoomiPredict tracks land acquisition cases through the nine-stage statutory lifecycle and adds an
explainable predictive layer on top: it estimates the probability that a given case, stage or project
misses its **next milestone** by more than 30 days, says which recorded factors moved each prediction,
and ranks where early intervention is most likely to be worth someone's week.

> **Prototype data notice**
>
> This prototype uses synthetic data for demonstration and model-development purposes. It does not
> represent actual government acquisition records. Real-world deployment and validation would require
> authorised historical acquisition data.

---

## Positioning

BhoomiPredict is an **interoperable AI decision-support layer** that complements existing land-record,
acquisition-workflow and project-monitoring systems. It consumes case status and returns risk,
explanation and priority — it owns no system of record and makes no decision.

It does **not** replace BhoomiRashi or DILRMP, predict court judgments, establish the cause of a delay,
prove real-world accuracy from synthetic data, guarantee faster acquisition, or action anything itself.
Every recommendation names a human owner who accepts, defers or rejects it.

---

## Running it

```bash
npm install
npm run data      # one-time: generate the corpus, train, build the store, write the PDF (~9 min)
npm run dev       # API + web, http://localhost:5178
```

`npm run dev` starts **two processes**: the API (port 5179) that owns the 350,000-case corpus, and Vite
(port 5178) which proxies `/api` to it. Both are needed — the browser never holds the corpus.

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite dev server together |
| `npm run dev:api` / `npm run dev:web` | either half on its own |
| `npm run build` | type-check + production bundle |
| `npm start` | single process: API + the built front end on `http://localhost:5179` |
| `npm run lint` | type-check only |
| `npm run data` | the full data pipeline, end to end |
| `npm run data:generate` | seeded corpus generator → CSV |
| `npm run data:train` | Python: train, evaluate, score, explain |
| `npm run data:store` | columnar query store + precomputed API payloads |
| `npm run data:pdf` | the documented PDF export |
| `npm run data:pdf:full` | every row, emitted as numbered PDF volumes |
| `npm run data:verify` | 40 checks across corpus, model, store and deliverables |

The ML step needs Python 3.10+ with `numpy`, `pandas`, `scikit-learn` and (optionally) `shap`:

```bash
pip install -r ml/requirements.txt
```

Without `shap` the pipeline still runs; case-level explanations fall back to the linear surrogate and
the UI says so.

---

## What's in it

| Route | Screen | What it does |
| --- | --- | --- |
| `/` | Landing | Problem → solution → capabilities → impact → pipeline, with live portfolio figures |
| `/dashboard` | Command Centre | Portfolio totals, risk distribution, stage and state risk, top cases requiring attention, predicted-vs-observed trend |
| `/projects` | Project registry | Server-side filtered registry with lifecycle position, milestone status and next-milestone risk |
| `/projects/:id` | Project intelligence | Nine-stage lifecycle, per-stage risk, explanation, intervention, risk trend, parcel map, case table |
| `/cases` | Case registry | 350,000 parcel-level cases, filtered/sorted/paged server-side |
| `/cases/:id` | Case intelligence | One case, its SHAP contributions, record detail and recommended review |
| `/risk` | AI Risk | Stage-level decomposition, contributor leaderboard, score distribution, calibration |
| `/predict` | Scenario scoring | What-if on a real case or an ad-hoc scenario, with a live re-score and contribution breakdown |
| `/queue` | Intervention queue | Ranked project-stage cells with contributors, recommended review and named owner |
| `/map` | GIS risk map | District clusters and the parcel layer over a schematic projection, plus the state cartogram |
| `/analytics` | Analytics | Any dimension of the corpus, stage throughput, litigation-vs-risk, project comparison |
| `/data` | Data & Model | Corpus composition, data-quality audit, model card, feature importance, exports |
| `/alerts` | Early warnings | Milestones flagged for review this fortnight, from the same scoring as the queue |
| `/reports` | Reports | Six standard review packs plus the dataset deliverables |
| `/about` | Methodology | Architecture, positioning, model card, explanation limits, known limitations |

---

## Architecture

```
Data → Validation → Case management → ML prediction → Explainability → GIS → Intervention priority → Human decision maker
```

```
scripts/
├─ generate-dataset.mjs   seeded corpus generator (CSV + project registry + stats)
├─ build-store.mjs        columnar query store + precomputed API payloads
├─ make-pdf.mjs           dependency-free PDF writer for the dataset export
├─ verify-data.mjs        end-to-end verification of every artefact
└─ dev.mjs                runs the API and Vite together

ml/train.py               time-aware split, LR baseline + GBM + RF, metrics, SHAP, surrogate

server/
├─ index.mjs              dependency-free HTTP API (and static host in production)
└─ lib/
   ├─ store.mjs           typed columnar store, loaded once at boot
   ├─ query.mjs           filter / sort / page / aggregate engine with an LRU cache
   ├─ scorer.mjs          interactive surrogate scoring with closed-form Shapley values
   └─ interventions.mjs   intervention prompts keyed by contributor group

src/
├─ api/client.ts          the ONLY boundary between UI and data
├─ data/types.ts          domain model mirroring the API
├─ components/            ui · charts · lifecycle · explain · gis · map · layout
├─ pages/                 one file per route
└─ hooks/                 useApi (abort + refetch), useFilters (URL-synced), useCountUp, useInView
```

### Why there is a server

350,000 case records cannot be filtered, sorted or aggregated in a browser without freezing it. The API
holds the corpus as **typed columnar arrays** — one block per column, 39 MB, loaded in ~30 ms — and the
browser only ever receives the page or the aggregate it asked for.

- Cases are written project by project, so each project owns a contiguous row range; project, state,
  authority, type and priority filters become range scans.
- Filters compile once into a closure over the typed arrays. A full-corpus scan with a dozen predicates
  costs single-digit milliseconds; the intervention queue, which also aggregates SHAP mass across
  121,000 open cases, costs ~80 ms cold and is then cached.
- Portfolio aggregates, the project registry and the geography rollups are precomputed at build time.

---

## The model

**Task.** Binary classification: will this case's next statutory milestone slip by more than 30 days?
Scored per case, then aggregated to stage and project level.

**Split.** Chronological on `assessment_date` — earliest 70% train, next 15% validation, last 15% test.
No shuffling. Only rows whose outcome is already knowable are used for training; the rest are the live
portfolio the model predicts on.

**Models.** A logistic-regression baseline, a histogram gradient-boosted ensemble (deployed) and a
random-forest comparison, all on the same 116-feature matrix.

| Model | ROC-AUC | PR-AUC | Precision | Recall | F1 | Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gradient boosting (deployed) | 0.840 | 0.740 | 0.605 | 0.756 | 0.672 | 0.147 |
| Logistic regression (baseline) | 0.821 | 0.730 | 0.613 | 0.730 | 0.666 | 0.152 |
| Random forest (comparison) | 0.824 | 0.717 | 0.630 | 0.677 | 0.653 | 0.158 |

Precision, recall and F1 are quoted at the operating threshold 0.309, chosen on the **validation**
window to maximise F1 — not tuned on the test set. The ensemble's margin over the baseline is modest —
the engineered features are close to additive — but it is ahead on every metric and better calibrated,
and the platform reports both rather than quoting only the winner.

**Leakage controls.** Targets and `actual_stage_delay_days` are never features; training uses only rows
whose milestone outcome is knowable; the split is chronological; imputation, scaling and the surrogate
are fitted on the training window only.

**Risk bands.** Calibrated probability cut-offs — Medium 30%, High 55%, Critical 78% — chosen from the
score distribution so Critical stays a reviewable ~10% of the portfolio.

**Explainability.** TreeSHAP contributions are precomputed for all 350,000 rows (top six per case) and
grouped into operational factors: compensation, litigation, ownership complexity, documentation,
inactivity, schedule pressure, stakeholder responsiveness, and the historical performance of the stage,
district and authority. Interactive what-if scoring uses a linear surrogate distilled from the ensemble —
its Shapley values are closed-form, so contributions always sum exactly to the score shown, and its
agreement is measured rather than assumed: log-odds R² 0.941, Spearman 0.974, same risk band 86% of the
time.

> A contribution says what moved the model's prediction. It is not a finding that the factor caused a
> delay, and a risk score is a probability, not an outcome.

---

## The synthetic corpus

`data/land_acquisition_synthetic_350k.csv` — **350,000 rows × 53 columns, 145 MB.**

Each row is one acquisition case (a land parcel under acquisition) captured at a point inside its current
statutory stage, together with the outcome of that stage's next milestone:

```
milestone_due_date      = stage_start_date + expected_stage_days
next_milestone_delayed  = 1 when that milestone slips by more than 30 days
label_observed          = 1 when milestone_due_date + 31 days is already in the past
```

Rows with `label_observed = 0` are the live portfolio: their outcome is not yet knowable, so every target
column is blank and the model has to predict them. That is what keeps the training set free of
look-ahead leakage.

| Figure | Value |
| --- | --- |
| Records | 350,000 |
| Columns | 53 |
| Projects · states · districts | 312 · 24 · 176 |
| Labelled rows | 228,702 (65.3%) |
| Open rows (scored, unlabelled) | 121,298 |
| Positive rate on labelled rows | 35.9% |
| Ground-truth risk bands | Low 54% · Medium 16% · High 13% · Critical 17% |
| Assessment window | Apr 2023 – Sep 2026 |
| Deliberate field gaps | 7 fields, 0.5–4% each |

**Correlation design.** The outcome is drawn from a latent propensity built from *combinations* of
signals — time consumed in the stage against work actually completed, compensation still unpaid,
litigation load, ownership complexity, inactivity, documentation gaps, stakeholder responsiveness, and
the historical delay rates of the stage, district and authority — plus interaction terms and an
unobserved-heterogeneity term. No single column determines the outcome: a rule such as
"legal_dispute = 1 implies delayed" does not hold, and the achievable ROC-AUC is bounded around 0.85.

Everything is seeded, so the corpus is byte-identical on every run.

### Deliverables

| File | What it is |
| --- | --- |
| `data/land_acquisition_synthetic_350k.csv` | the complete corpus, 350,000 rows (served gzipped, ~22 MB over the wire) |
| `data/land_acquisition_synthetic_350k.pdf` | 205 pages: title page and prototype-data notice, field dictionary for all 53 columns, distribution and data-quality tables, model card, and a tabular export of a documented systematic sample in two column parts joined on `case_id` |

A single PDF holding all 350,000 rows runs to thousands of pages and exhausts memory, so
`npm run data:pdf:full` emits the complete row set as numbered volumes
(`..._full_part01.pdf`, …) instead. Both variants state on their title page which they are.

Both files download from **Data & Model → Exports** and from the Reports screen. Filtered case exports
are available from Cases and Projects and are generated server-side against the full corpus.

---

## Data quality

Every case carries a quality score: each missing field costs 9 points, a pending verification 6 and an
unfiled approval 5, floored at 25. The score travels with the case, so a prediction built on a thin
record is visibly flagged rather than presented with false confidence. Portfolio mean: 92%.

---

## Design notes

- **Palette.** Navy chrome with a light working surface, one brand blue and a saffron accent. Risk is the
  only place colour carries meaning: green / amber / orange / rose for Low / Medium / High / Critical.
- **Theming.** Light and dark are driven entirely by CSS custom properties in `index.css`. The toggle
  persists to `localStorage`.
- **Motion.** Counters, chart entries, staggered reveals and bar growth — all under 1.4s, all suppressed
  under `prefers-reduced-motion`.
- **The maps.** Two of them, deliberately. The geographic layer projects district centroids and parcel
  points over a simplified national outline; the tile cartogram keeps every state equally legible for
  comparison. Positions are schematic — the corpus carries centroids with jitter, not surveyed parcel
  geometry, and a production deployment would render the survey layer instead.
- **Provenance.** A "Synthetic Demo Data" badge sits in the topbar, a prototype-data notice on the
  landing page, Command Centre and Data screen, and a standing disclaimer in the footer.

---

## Verification

```bash
npm run data:verify
```

Checks record count and schema, duplicate ids and duplicate records, required fields, stage validity,
date ordering, milestone arithmetic, target distribution and leakage, model metrics and split ordering,
score and SHAP coverage, surrogate fidelity, store/registry consistency, and the CSV and PDF
deliverables. 40 checks, all currently passing.

---

## Stack

React 18 · TypeScript (strict) · Vite 5 · Tailwind CSS 3 · Recharts 2 · Lucide · React Router 6 ·
Node HTTP API with **zero runtime dependencies** · Python (scikit-learn, SHAP) for the offline pipeline.
