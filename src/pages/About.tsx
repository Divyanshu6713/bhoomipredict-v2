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
import { Badge, Card, CardHeader, SectionTitle, SkeletonCard } from '@/components/ui';
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
  if (summary.loading || !s) return <SkeletonCard lines={10} />;

  const m = s.model;

  return (
    <div className="space-y-5">
      <Card className="animate-fade-up overflow-hidden">
        <div className="relative bg-navy-900 px-6 py-8 grid-lines sm:px-8">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/20 blur-[100px]" />
          <div className="relative max-w-3xl">
            <Badge className="border-brand/30 bg-brand/15 text-[#8FB4FF]" dot="bg-brand">
              Methodology
            </Badge>
            <h2 className="mt-3 font-display text-[25px] font-extrabold leading-tight tracking-tight text-white sm:text-[31px]">
              Track, predict, explain, prioritise — then a person decides
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-white/60">
              Existing digital systems can show the current status of an acquisition case. This platform adds an
              explainable predictive layer on top: it identifies the cases and milestones at higher risk of delay, says
              which recorded factors moved each prediction, and ranks where early intervention is most likely to be
              worth someone's week.
            </p>
          </div>
        </div>
      </Card>

      <Card className="animate-fade-up">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex items-start gap-4">
            <LogoMark className="h-14 w-14" />
            <div>
              <p className="font-display text-[22px] font-extrabold tracking-tight text-ink">{BRAND.product}</p>
              <p className="text-[13px] font-semibold text-brand">{BRAND.tagline}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                A land acquisition intelligence, delay-risk prediction and decision support platform. It reads the interconnected causes of acquisition delay — ownership disputes, compensation, documentation, approvals, notifications and objections, litigation, rehabilitation and resettlement, forest and environment clearances, utility shifting and coordination across authorities — and helps the responsible office act before a milestone slips.
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2.5 text-[12px]">
            {[
              ['Product', BRAND.product],
              ['Built by', BRAND.team],
              ['Stage', 'Hackathon prototype'],
              ['Data', 'Synthetic demo corpus'],
              ['Scope', 'All 28 States & 8 UTs'],
              ['Integrations', 'Contract-ready · none connected'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                <dt className="label-xs">{k}</dt>
                <dd className="mt-0.5 font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <Card className="animate-fade-up">
        <CardHeader title="Architecture" subtitle="Data to decision, with the human at the end" icon={<GitBranch className="h-4 w-4" />} />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((step, i) => (
            <div
              key={step.label}
              className="relative rounded-2xl border border-line bg-surface-2 p-4 animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                  <step.icon className="h-4 w-4" />
                </span>
                <p className="text-[13px] font-bold text-ink">{step.label}</p>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">{step.detail}</p>
              <span className="absolute right-3 top-3 text-[10px] font-bold text-ink-3 num">
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader title="What this platform is" subtitle="Positioning we can defend" icon={<CheckCircle2 className="h-4 w-4" />} />
          <ul className="space-y-2.5 px-5 pb-5">
            {IS.map((line) => (
              <li key={line} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-[12.5px] leading-relaxed text-ink-2">{line}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <CardHeader title="What it is not" subtitle="Claims we do not make" icon={<Ban className="h-4 w-4" />} />
          <ul className="space-y-2.5 px-5 pb-5">
            {IS_NOT.map((line) => (
              <li key={line} className="flex gap-2.5">
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <span className="text-[12.5px] leading-relaxed text-ink-2">{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card className="animate-fade-up">
        <CardHeader title="Model card" subtitle="The deployed model, its evaluation and its bounds" icon={<Gauge className="h-4 w-4" />} />
        <div className="grid gap-5 px-5 pb-5 lg:grid-cols-3">
          <div>
            <p className="label-xs mb-2">Task</p>
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              Binary classification: will this case's next statutory milestone slip by more than 30 days? Scored per
              case, then aggregated to stage and project level. Features are the operational record — schedule position,
              compensation, litigation, ownership, documentation, responsiveness and the historical delay rates of the
              stage, district and authority.
            </p>
            <p className="label-xs mb-2 mt-4">Models</p>
            <ul className="space-y-1.5 text-[12.5px] text-ink-2">
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
                <span className="font-semibold text-ink">Interactive surrogate:</span> linear model distilled from the
                ensemble for what-if scoring, log-odds R² {m.surrogateFidelity.logOddsR2}
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
                  <span className="text-[12px] text-ink-3">{label}</span>
                  <span className="text-[12.5px] font-bold text-ink num">{value}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
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
                  <span className="text-[12px] leading-relaxed text-ink-2">{c}</span>
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
                  <span className="text-[12px] font-semibold text-ink-2">{band}</span>
                  <span className="ml-auto text-[11.5px] text-ink-3 num">{range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader title="How explanations work" subtitle="And what they do not claim" icon={<Sparkles className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              Every case in the corpus carries precomputed SHAP contributions from the deployed ensemble. The platform
              groups the underlying features into operational factors — compensation, litigation, ownership complexity,
              documentation, inactivity, schedule pressure, stakeholder responsiveness, and the historical performance of
              the stage, district and authority — because a reviewer needs the factor, not the encoding.
            </p>
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              For an ad-hoc scenario there is no stored row, so scoring runs through a linear surrogate distilled from
              the ensemble. Its Shapley values are closed-form, so contributions always sum exactly to the score shown,
              and its agreement with the ensemble is measured rather than assumed: log-odds R²{' '}
              {m.surrogateFidelity.logOddsR2}, Spearman {m.surrogateFidelity.spearman}, same risk band{' '}
              {(m.surrogateFidelity.bandAgreement * 100).toFixed(0)}% of the time.
            </p>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5">
              <p className="text-[12px] font-bold text-amber-700 dark:text-amber-400">The standing caveat</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                A contribution says what moved the model's prediction. It is not a finding that the factor caused a
                delay, and a high risk score is a probability, not an outcome.
              </p>
            </div>
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
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
                <span className="text-[12.5px] leading-relaxed text-ink-2">{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card className="animate-fade-up">
        <CardHeader title="Data provenance" subtitle="Where every figure on screen comes from" icon={<Database className="h-4 w-4" />} />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Corpus', value: `${formatNumber(s.totals.cases)} case records`, hint: `${s.dataQuality.columns} columns, seeded generator` },
            { label: 'Labelled rows', value: formatCompact(s.totals.observedCases), hint: 'milestone outcome already knowable' },
            { label: 'Scored, unlabelled', value: formatCompact(s.totals.openCases), hint: 'the live portfolio' },
            { label: 'Coverage', value: `${s.totals.states} states`, hint: `${s.totals.districts} districts, ${s.totals.projects} projects` },
          ].map((d) => (
            <div key={d.label} className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="label-xs">{d.label}</p>
              <p className="mt-1.5 font-display text-[19px] font-extrabold leading-none text-ink num">{d.value}</p>
              <p className="mt-1 text-[11px] text-ink-3">{d.hint}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-5 py-4">
          <PrototypeNotice />
          <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
            The full corpus and its documentation are downloadable from the{' '}
            <Link to="/data" className="font-semibold text-brand hover:underline">
              Data &amp; Model
            </Link>{' '}
            screen. The pipeline that produces them is reproducible end to end with{' '}
            <code className="font-mono text-[11.5px]">npm run data</code>: seeded generation, training with a time-aware
            split, batch scoring, SHAP, and the store the API queries.
          </p>
        </div>
      </Card>

      <Card className="animate-fade-up p-6">
        <SectionTitle
          eyebrow="Interoperability"
          title="Designed to complement, not replace"
          description="The platform is designed to consume what systems of record already hold — case status, stage dates, compensation state, litigation flags — through its data integration layer, and return a risk score, an explanation and a priority. It writes nothing back, owns no system of record, and makes no decision. In this prototype every provider is a synthetic adapter."
        />
        <Link to="/data-sources" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline">
          See the data sources and provider contracts <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Consumes', value: 'Case and project status, stage dates, compensation and litigation state, administrative timings' },
            { label: 'Produces', value: 'Per-case delay risk, per-stage risk, grouped contributions, a ranked intervention queue' },
            { label: 'Decides', value: 'Nothing. Every prompt names a human owner who accepts, defers or rejects it' },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-line bg-surface-2 p-4">
              <p className="label-xs">{c.label}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{c.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
