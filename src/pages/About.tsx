import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Database,
  Gauge,
  GitBranch,
  Layers,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Card, CardHeader, PageSkeleton, SectionTitle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ErrorState, PrototypeNotice } from '@/components/ui/primitives';
import { RISK_HEX } from '@/lib/risk';
import { formatCompact, formatNumber } from '@/lib/format';
import { useApi } from '@/hooks';
import { fetchSummary } from '@/api/client';
import { BRAND } from '@/lib/brand';
import { LogoMark } from '@/components/layout/Logo';

const PIPELINE = [
  { label: 'Data integration', detail: 'Provider contracts for land records, courts, compensation, notifications, clearances and GIS — synthetic adapters in the prototype', icon: Database },
  { label: 'Validation', detail: 'Completeness scoring, field-gap audit, consistency checks', icon: ShieldCheck },
  { label: 'Hierarchy & dependencies', detail: 'National administrative hierarchy, project-type authorities and nine-stage lifecycle', icon: Layers },
  { label: 'ML prediction', detail: 'Batch-scored delay risk per case and per stage', icon: Gauge },
  { label: 'Explainability', icon: Sparkles, detail: 'Per-case SHAP contributions grouped into operational factors' },
  { label: 'GIS', detail: 'District clusters and parcel-level risk distribution', icon: GitBranch },
  { label: 'Intervention priority', detail: 'Ranked project-stage cells with recommended reviews', icon: ArrowRight },
  { label: 'Human decision maker', detail: 'An officer accepts, defers or rejects each prompt', icon: Users },
];

const IS = [
  'A national land acquisition intelligence platform: one engine across ministries, organisations, all States and UTs, divisions and districts',
  'An issue-aware view of delay: ownership, compensation, documentation, approvals, litigation, R&R, clearances, utilities and coordination, per project type',
  'An interoperable decision-support layer that sits alongside existing land-record, acquisition-workflow and project-monitoring systems',
  'A predictive early-warning tool: it estimates the probability that a specific milestone slips by more than 30 days',
  'An explanation surface: every prediction carries the factors that moved it, with their weights',
  'A prioritisation aid: it ranks where scarce review capacity is most likely to matter',
];

const IS_NOT = [
  'A replacement for BhoomiRashi, DILRMP or any system of record',
  'A predictor of court outcomes or judgments',
  'A causal account of why a delay happened — contributions describe the model, not the world',
  'Evidence of real-world accuracy: every figure here is computed on synthetic data',
  'Connected to any government database — the integration layer is contract-ready, with synthetic adapters only',
  'An automated decision-maker — nothing in the platform actions anything on its own',
];

export default function About() {
  const summary = useApi((signal) => fetchSummary(signal), []);
  const s = summary.data;

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  if (summary.loading || !s) return <PageSkeleton />;

  const m = s.model;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="border-l-4 border-brand px-6 py-7 sm:px-8">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Track, predict, explain, prioritise — then a person decides</h2>
            <p className="mt-3 text-md text-ink-2">
              Existing digital systems can show the current status of an acquisition case. This platform adds an
              explainable predictive layer on top: it identifies the cases and milestones at higher risk of delay, says
              which recorded factors moved each prediction, and ranks where early intervention is most likely to be
              worth someone's week.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex items-start gap-4">
            <LogoMark className="h-14 w-14" />
            <div>
              <p className="text-2xl font-semibold tracking-tight text-ink">{BRAND.product}</p>
              <p className="text-sm font-semibold text-brand">{BRAND.tagline}</p>
              <p className="mt-2 text-sm text-ink-2">
                A land acquisition intelligence, delay-risk prediction and decision support platform. It reads the interconnected causes of acquisition delay — ownership disputes, compensation, documentation, approvals, notifications and objections, litigation, rehabilitation and resettlement, forest and environment clearances, utility shifting and coordination across authorities — and helps the responsible office act before a milestone slips.
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2.5 text-xs">
            {[
              ['Product', BRAND.product],
              ['Built by', BRAND.team],
              ['Stage', 'Hackathon prototype'],
              ['Data', 'Synthetic demo corpus'],
              ['Scope', 'All 28 States & 8 UTs'],
              ['Integrations', 'Contract-ready · none connected'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <dt className="label-xs">{k}</dt>
                <dd className="mt-0.5 font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <Card>
        <CardHeader title="Architecture" subtitle="Data to decision, with the human at the end" icon={<GitBranch className="h-4 w-4" />} />
        <div className="grid gap-x-5 gap-y-6 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((step, i) => (
            <div key={step.label} className={cn('border-t-2 pt-3', i === PIPELINE.length - 1 ? 'border-brand' : 'border-line')}>
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <span className="text-xs font-normal text-ink-3 num">{String(i + 1).padStart(2, '0')}</span>
                <step.icon className="h-4 w-4 text-ink-3" aria-hidden />
                {step.label}
              </p>
              <p className="mt-1 text-sm text-ink-2">{step.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="What this platform is" subtitle="Positioning we can defend" icon={<CheckCircle2 className="h-4 w-4" />} />
          <ul className="space-y-2.5 px-5 pb-5">
            {IS.map((line) => (
              <li key={line} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm text-ink-2">{line}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="What it is not" subtitle="Claims we do not make" icon={<Ban className="h-4 w-4" />} />
          <ul className="space-y-2.5 px-5 pb-5">
            {IS_NOT.map((line) => (
              <li key={line} className="flex gap-2.5">
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <span className="text-sm text-ink-2">{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card>
        <CardHeader title="Model card" subtitle="The deployed model, its evaluation and its bounds" icon={<Gauge className="h-4 w-4" />} />
        <div className="grid gap-5 px-5 pb-5 lg:grid-cols-3">
          <div>
            <p className="label-xs mb-2">Task</p>
            <p className="text-sm text-ink-2">
              Binary classification: will this case's next statutory milestone slip by more than 30 days? Scored per
              case, then aggregated to stage and project level. Features are the operational record — schedule position,
              compensation, litigation, ownership, documentation, responsiveness and the historical delay rates of the
              stage, district and authority.
            </p>
            <p className="label-xs mb-2 mt-4">Models</p>
            <ul className="space-y-1.5 text-sm text-ink-2">
              <li>
                <span className="font-semibold text-ink">Deployed:</span> histogram gradient-boosted ensemble, {m.features}{' '}
                features, batch-scored across the corpus
              </li>
              <li>
                <span className="font-semibold text-ink">Baseline:</span> logistic regression, ROC-AUC{' '}
                {m.baseline.rocAuc.toFixed(3)} on test
              </li>
              {m.comparison && (
                <li>
                  <span className="font-semibold text-ink">Comparison:</span> random forest, ROC-AUC{' '}
                  {m.comparison.rocAuc.toFixed(3)} on test
                </li>
              )}
              <li>
                <span className="font-semibold text-ink">Serving:</span> the deployed trees are exported and scored in the API
                (verified identical to scikit-learn), so scenarios, edits and new projects use the real model with exact TreeSHAP
              </li>
            </ul>
          </div>

          <div>
            <p className="label-xs mb-2">Evaluation</p>
            <div className="space-y-1.5">
              {[
                ['ROC-AUC', m.test.rocAuc.toFixed(4)],
                ['PR-AUC', m.test.prAuc.toFixed(4)],
                ['Precision', m.test.at_threshold.precision.toFixed(4)],
                ['Recall', m.test.at_threshold.recall.toFixed(4)],
                ['F1', m.test.at_threshold.f1.toFixed(4)],
                ['Brier score', m.test.brier.toFixed(4)],
                ['Operating threshold', String(m.operatingThreshold)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between border-b border-line/70 pb-1.5 last:border-0">
                  <span className="text-xs text-ink-3">{label}</span>
                  <span className="text-sm font-bold text-ink num">{value}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Reported on the chronologically last {formatNumber(m.split.test.rows)} labelled rows ({m.split.test.from} to{' '}
              {m.split.test.to}), a window the model never saw. The threshold was chosen on the validation window, not
              the test set.
            </p>
          </div>

          <div>
            <p className="label-xs mb-2">Leakage controls</p>
            <ul className="space-y-2">
              {m.leakageControls.map((c) => (
                <li key={c} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span className="text-xs text-ink-2">{c}</span>
                </li>
              ))}
            </ul>
            <p className="label-xs mb-2 mt-4">Risk banding</p>
            <div className="space-y-1.5">
              {(
                [
                  ['Low', `below ${Math.round(m.riskBands.medium * 100)}%`],
                  ['Medium', `${Math.round(m.riskBands.medium * 100)}–${Math.round(m.riskBands.high * 100)}%`],
                  ['High', `${Math.round(m.riskBands.high * 100)}–${Math.round(m.riskBands.critical * 100)}%`],
                  ['Critical', `${Math.round(m.riskBands.critical * 100)}% and above`],
                ] as const
              ).map(([band, range]) => (
                <div key={band} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: RISK_HEX[band] }} />
                  <span className="text-xs font-semibold text-ink-2">{band}</span>
                  <span className="ml-auto text-xs text-ink-3 num">{range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="How explanations work" subtitle="And what they do not claim" icon={<Sparkles className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <p className="text-sm text-ink-2">
              Every case in the corpus carries precomputed SHAP contributions from the deployed ensemble. The platform
              groups the underlying features into operational factors — compensation, litigation, ownership complexity,
              documentation, inactivity, schedule pressure, stakeholder responsiveness, and the historical performance of
              the stage, district and authority — because a reviewer needs the factor, not the encoding.
            </p>
            <p className="text-sm text-ink-2">
              For an ad-hoc scenario, an edited project or a record arriving through the API there is no stored row, so
              the API scores it with the exported trees of the deployed ensemble and computes exact TreeSHAP on the spot
              (path-dependent algorithm, the same one the SHAP library uses; verified to 1e-7 against it). Contributions
              plus the base value sum exactly to the model's log-odds.
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/5 p-3.5">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">The standing caveat</p>
              <p className="mt-1 text-xs text-ink-2">
                A contribution says what moved the model's prediction. It is not a finding that the factor caused a
                delay, and a high risk score is a probability, not an outcome.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Known limitations" subtitle="Where this prototype stops" icon={<TriangleAlert className="h-4 w-4" />} />
          <ul className="space-y-2.5 px-5 pb-5">
            {[
              'All data is synthetic. Metrics demonstrate that the pipeline learns the structure in the corpus; they say nothing about real-world accuracy.',
              'Administrative boundaries are real (Survey of India depiction, via INDIAN-SHAPEFILES); project and parcel coordinates are synthetic points sampled inside the real district polygon, not surveyed parcel geometry or real project sites.',
              'The corpus has no litigation text, no court calendars, no photographs and no field notes, so none of those signals are modelled.',
              'Risk is estimated for a single milestone horizon. Total project duration is not forecast.',
              'Scenario estimates assume every unchanged field stays as recorded, which real interventions rarely respect.',
              'Historical delay rates for districts and authorities are corpus-level artefacts; in deployment they would need auditing for fairness before use.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span className="text-sm text-ink-2">{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card>
        <CardHeader title="Data provenance" subtitle="Where every figure on screen comes from" icon={<Database className="h-4 w-4" />} />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Corpus', value: `${formatNumber(s.totals.cases)} case records`, hint: `${s.dataQuality.columns} columns, seeded generator` },
            { label: 'Labelled rows', value: formatCompact(s.totals.observedCases), hint: 'milestone outcome already knowable' },
            { label: 'Scored, unlabelled', value: formatCompact(s.totals.openCases), hint: 'the live portfolio' },
            { label: 'Coverage', value: `${s.totals.states} states`, hint: `${s.totals.districts} districts, ${s.totals.projects} projects` },
          ].map((d) => (
            <div key={d.label} className="rounded-lg border border-line bg-surface-2 p-4">
              <p className="label-xs">{d.label}</p>
              <p className="mt-1.5 text-xl font-semibold leading-none text-ink num">{d.value}</p>
              <p className="mt-1 text-xs text-ink-3">{d.hint}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-5 py-4">
          <PrototypeNotice />
          <p className="mt-3 text-xs text-ink-2">
            The full corpus and its documentation are downloadable from the{' '}
            <Link to="/data" className="font-semibold text-brand hover:underline">
              Data &amp; Model
            </Link>{' '}
            screen. The pipeline that produces them is reproducible end to end with{' '}
            <code className="font-mono text-xs">npm run data</code>: seeded generation, training with a time-aware
            split, batch scoring, SHAP, and the store the API queries.
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle
          eyebrow="Interoperability"
          title="Designed to complement, not replace"
          description="The platform is designed to consume what systems of record already hold — case status, stage dates, compensation state, litigation flags — through its data integration layer, and return a risk score, an explanation and a priority. It writes nothing back, owns no system of record, and makes no decision. In this prototype every provider is a synthetic adapter."
        />
        <Link to="/data-sources" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          See the data sources and provider contracts <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Consumes', value: 'Case and project status, stage dates, compensation and litigation state, administrative timings' },
            { label: 'Produces', value: 'Per-case delay risk, per-stage risk, grouped contributions, a ranked intervention queue' },
            { label: 'Decides', value: 'Nothing. Every prompt names a human owner who accepts, defers or rejects it' },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-line bg-surface-2 p-4">
              <p className="label-xs">{c.label}</p>
              <p className="mt-1.5 text-sm text-ink-2">{c.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
