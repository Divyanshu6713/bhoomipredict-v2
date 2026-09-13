# BhoomiPredict

**AI-enabled land acquisition delay risk and decision-support platform**

Data → acquisition workflow → state & project-type authority logic → stage / case status → ML risk →
explanation → recommendation → intervention → alert → role / department action → audit trail

> **SYNTHETIC DEMO DATA**
>
> Every project, case, parcel, village, owner, date, amount and outcome in this prototype is synthetic,
> generated for demonstration and model development. Project names describe the *kind* of work; they are
> not real government projects, and project/parcel coordinates are not real sites. Administrative
> boundaries, state/district/taluk names and statutory frameworks are real. Real-world deployment would
> require authorised acquisition records.

---

## Running it

```bash
npm install
npm run data        # one-time: generate → train → store → PDF (~10 min, needs Python)
npm run dev         # API (5179) + Vite (5178): http://localhost:5178
```

Sign in by choosing a **demo profile** (national, Karnataka, Uttar Pradesh, NHAI, legal, revenue, field and
read-only roles). Profiles carry real permissions and jurisdiction that the API enforces.

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite dev server (the API is pinned to 5179 even if `PORT` is set) |
| `npm run build` | type-check + production bundle |
| `npm start` | single process: API + built front end on `PORT` (default 5179) |
| `npm run test:smoke` | 110 end-to-end functional tests against an isolated API instance |
| `npm run data:verify` | 40 checks across corpus, model, store and deliverables |
| `npm run data` | full data pipeline |
| `npm run data:geo` | rebuild boundary layers from source (downloads ~100 MB, uses mapshaper via npx) |

Python 3.10+ with `numpy`, `pandas`, `scikit-learn`, `shap` is needed for training and for the in-app
**Retrain** action (`pip install -r ml/requirements.txt`).

---

## What's in it

| Route | Screen |
| --- | --- |
| `/login` | Department profile selection |
| `/dashboard` | KPIs (total, High, Critical, delayed, immediate action, mean delay probability) and analytics: risk, state, district, type, stage, delay drivers, compensation, legal, R&R, timeline, department bottlenecks — every chart clicks through |
| `/projects`, `/projects/:id` | Registry with state/district/type/stage/status filters; project intelligence page: overview, authority network, AI risk, SHAP explanation, stage timeline with case backlog, next milestone, recommendations, interventions, alerts, GIS, cases, documents, audit |
| `/projects/new`, `/projects/:id/edit` | Validated create / edit; *Record milestone achieved* advances the lifecycle |
| `/cases`, `/cases/:id` | 350,000 parcel-level cases; case page shows pending department actions, case rules, case status workflow, documents |
| `/map` | GIS: India → state → district → project on real boundaries, risk/state/district/type/stage/search filters, clustering, popups, state & district summaries |
| `/predict` | Scenario scoring driven by the authority registry and the model |
| `/queue` | Intervention queue with OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED / DISMISSED |
| `/alerts` | Alert centre with UNREAD → ACKNOWLEDGED → RESOLVED |
| `/documents` | Document repository (upload from project / case pages; versions, review, download) |
| `/registry` | Authority & dependency registry explorer, frameworks, rule thresholds |
| `/admin` | CSV upload & validation, retraining job, model metrics, consistency validation, deleted-project restore |
| `/audit`, `/profile` | Audit trail; role, jurisdiction, assignments, notifications |
| `/risk`, `/analytics`, `/reports`, `/data`, `/about` | Model decomposition, analytics, MIS reports, model card, methodology |

---

## Architecture

```
server/
├─ index.mjs                 dependency-free HTTP API: auth, role scoping, all endpoints, static host
├─ domain/                   configuration and deterministic business rules (one place each)
│  ├─ registry.mjs           frameworks, project types, state profiles, authority eligibility, dependency networks
│  ├─ geography.mjs          districts, sub-districts, polygons, point-in-polygon
│  ├─ lifecycle.mjs          stage status vs case backlog vs parcel status
│  ├─ rules.mjs              triggers → recommendations, interventions, alerts; case-level rules
│  ├─ roles.mjs              roles, permissions, scope, focus areas, demo directory
│  └─ validation.mjs         field validation shared by form, edit and CSV upload
└─ lib/
   ├─ store.mjs, query.mjs   columnar case store and query engine
   ├─ scorer.mjs             linear surrogate: probability, closed-form Shapley values, expected slip days
   ├─ projects.mjs           effective projects = corpus + edits + additions − deletions (single source of truth)
   ├─ workflow.mjs           interventions & alerts with persisted status
   ├─ scenario.mjs           scenario scoring through the registry
   ├─ dashboard.mjs          scoped dashboard aggregation
   ├─ documents.mjs          file repository with versions and review
   ├─ upload.mjs             CSV parse / validate / commit
   ├─ jobs.mjs               retraining job (train.py → build-store → hot reload)
   ├─ consistency.mjs        cross-screen data-consistency checks
   └─ persistence.mjs        runtime state (data/runtime/state.json) and append-only audit log
```

Dashboard, registry, GIS, scenario seeding, queue, alerts, profile and reports all read
`effectiveProjects()`; none recomputes status, risk bands or owners on its own.

### Authority & dependency logic

`buildDependencyNetwork({ projectType, subtype, state, district, subDistrict, primaryAuthority, flags })`
returns every body the acquisition depends on, grouped central / state / district / sub-district, each with
*why* it is involved, the stages it gates, whether it can block a stage, and a basis label:
**statute** (the Act and section), **configured** (a designation held in this registry — confirm against the
project notification) or **project** (named by the record).

- **Framework** follows type and subtype: RFCTLARR 2013, NH Act 1956 (ss.3A–3J), Railways Act 1989 Ch. IVA,
  PMP Act 1962 (right of user), Electricity Act RoW, KIAD Act 1966 (Karnataka industrial), MID Act 1961.
  Milestone wording, dispute forum and SIA applicability come from the framework.
- **Eligible acquiring bodies** follow type × state × district (e.g. irrigation in Mandya → CNNL / WRD
  Karnataka; industrial in Aligarh → UPSIDA; greenfield airport in Karnataka → KSIIDC). Unrelated bodies are
  never offered: AAI appears only on airport projects, and the API rejects an ineligible pair.
- **State profiles** set district head (Deputy Commissioner in Karnataka, District Magistrate in UP),
  acquisition officer (SLAO / ADM (LA)), sub-district label (Taluk / Tehsil / Mandal) and land records
  (SSLR with Bhoomi in Karnataka — shown as a land-record dependency, never as the acquiring authority; UP
  Revenue land records with Bhulekh). Karnataka and UP are detailed; 22 more states use a compact profile;
  any other state falls back to generic designations rather than invented ones.
- **Flags** pull in forest clearance, railway / highway crossing approvals and UP consolidation.

Adding a state is a registry entry; adding a project type is a `PROJECT_TYPES` entry.

### Lifecycle: stage status ≠ case status

A statutory stage is **COMPLETED** when its milestone is achieved; individual cases attached to it can
remain open. The engine reports both, separately:

> Objection / Claims — Stage: COMPLETED on 24 Apr 2026 · Case backlog: 27 residual open · 81.1% of 143 resolved

Rules (server/domain/lifecycle.mjs): actual completion ⇒ COMPLETED; frontier past its working deadline ⇒
DELAYED; a gating dependency pending on ≥ 40% of the frontier's open cases with approvals ≥ 45 days
outstanding (or the deadline passed) ⇒ BLOCKED; otherwise IN_PROGRESS; stages ahead ⇒ PENDING (with any
parcels already progressing ahead counted and explained).

### GIS

Boundaries come from **INDIAN-SHAPEFILES** (github.com/datta07/INDIAN-SHAPEFILES, MIT licence), which follows
the Survey of India depiction of the national boundary — the whole of Jammu & Kashmir and Ladakh included —
with LGD / Census codes. `scripts/build-geo.mjs` simplifies them (mapshaper, ~600 m) and repairs broken
transliterated names; outputs in `data/geo/` are committed. The map renders national, state and district
layers with an equirectangular projection, zoom/pan, choropleth, clustering and project popups linking to
the project page. The corpus samples case coordinates inside the real district polygon, and every project
location is verified to fall inside its state.

### Roles

| Role | Scope | Can |
| --- | --- | --- |
| National Administrator | All India | everything, including retraining and deletion |
| State Administrator | state | create/edit projects, CSV upload, assign interventions, review documents |
| District Administrator | district | edit, advance stages, assign interventions, review documents |
| Land Acquisition Officer | district | advance stages, update interventions / cases, file awards & compensation documents |
| Project Implementing Agency | own authority's projects | update interventions, file survey documents |
| Legal Officer | state | legal interventions, case status, legal documents |
| Revenue / Land Records Officer | district | documentation interventions, land-record documents, reviews |
| Field Verification Officer | district | field interventions, case status, survey / R&R documents |
| Policy Viewer | All India | read-only |

Scope filters every data endpoint server-side; focus areas route alerts and "my actions".

---

## The model

**Task.** Will this case's next statutory milestone slip by more than 30 days? Scored per case, aggregated to
stage and project. **Expected slip days** = P(delay) × a conditional slip regressor trained on delayed,
resolved milestones.

**Split.** Chronological on `assessment_date`: earliest 70% train, next 15% validation, last 15% test.

| Model | ROC-AUC | PR-AUC | Precision | Recall | F1 | Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gradient boosting (deployed) | 0.835 | 0.730 | 0.623 | 0.710 | 0.664 | 0.149 |
| Logistic regression (baseline) | 0.811 | 0.717 | 0.609 | 0.702 | 0.652 | 0.155 |
| Random forest (comparison) | 0.817 | 0.703 | 0.634 | 0.644 | 0.639 | 0.161 |

Threshold 0.348 chosen on validation. 239 features, now including **authority dependency count, pending
department actions, approval delay and inter-department coordination** — pending department actions is the
fifth-largest mean |SHAP| feature. Surrogate fidelity: log-odds R² 0.951, Spearman 0.977, band agreement
86%. Conditional slip MAE 26.9 days vs 29.1 for a median baseline (right-censored; understates real error).

**Explainability.** TreeSHAP on the deployed ensemble for all 350,000 cases (top six per case); scenario
and project-edit contributions are the surrogate's closed-form Shapley values and are labelled as such.
A contribution explains a prediction; it is not a finding of cause.

**Risk basis on projects.** Unedited corpus projects: ensemble mean over the current stage's open cases.
Edited projects: ensemble figure moved by the surrogate's estimate of the edit. Projects added by form or
CSV: surrogate on the project record. The basis is shown wherever the figure is.

---

## The synthetic corpus

`data/land_acquisition_synthetic_350k.csv` — **350,000 rows × 60 columns**, 312 projects, 25 states, 265
districts, 11 project types. 237,746 labelled rows (positive rate 36.5%); 112,254 open rows scored live.
Real district and taluk names; coordinates sampled inside real district polygons; authorities from the
registry; per-case pending dependency codes and approval delays drive both the outcome and the model.
Everything is seeded and byte-identical on every run.

---

## Verification

```bash
npm run data:verify   # 40 corpus / model / store / deliverable checks
npm run test:smoke    # 110 functional checks: scenarios A–J, roles, CRUD, CSV, documents, workflow, audit, consistency
```

The Administration screen runs the same 14 consistency checks live (case counts equal the store, no
aviation bodies outside airports, state-specific authority sets, coordinates inside state and district,
stage-status order, residual backlog explained, risk bands on cut-offs, workflow references valid).

## Stack

React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · Recharts · Lucide · React Router 6 · Node HTTP API with
**zero runtime dependencies** · Python (scikit-learn, SHAP) offline pipeline.
