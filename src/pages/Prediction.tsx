import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  ClipboardCheck,
  Info,
  RotateCcw,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, InfoDot, Select, SkeletonCard } from '@/components/ui';
import { ErrorState, RiskMeter } from '@/components/ui/primitives';
import { ContributorBars } from '@/components/explain/Contributors';
import { RiskGauge } from '@/components/charts';
import { RISK_HEX } from '@/lib/risk';
import { useApi } from '@/hooks';
import { fetchCaseScenario, fetchPredictionSpec, fetchProject, requestPrediction } from '@/api/client';
import type { PredictResponse, PredictionSpec } from '@/data/types';

type Record_ = Record<string, string | number>;

/** Interventions a reviewer can actually take, expressed as field moves. */
const PRESETS: Array<{ id: string; label: string; description: string; patch: Record_ }> = [
  {
    id: 'compensation',
    label: 'Clear the compensation backlog',
    description: 'Disbursement pushed to 90% and pending days cut to a fortnight',
    patch: { compensation_completion_percentage: 90, compensation_pending_days: 14, compensation_status: 'Paid' },
  },
  {
    id: 'legal',
    label: 'Resolve the litigation',
    description: 'Open cases down to one, dispute complexity reduced to Low',
    patch: { legal_case_count: 1, dispute_complexity: 'Low', legal_dispute: 1 },
  },
  {
    id: 'records',
    label: 'Close the documentation gaps',
    description: 'Records verified to 95% and the file approved',
    patch: { document_completeness: 95, verification_status: 'Verified', approval_status: 'Approved' },
  },
  {
    id: 'cadence',
    label: 'Restore the review cadence',
    description: 'Last action within a week, departmental turnaround inside the 21-day norm',
    patch: { inactivity_days: 7, department_response_days: 18, stakeholder_responsiveness: 'High' },
  },
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  baseline,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  baseline?: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const changed = baseline !== undefined && Math.abs(baseline - value) > 1e-6;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="label-xs">{label}</label>
        <span className="flex items-baseline gap-1.5">
          {changed && (
            <span className="text-[10.5px] text-ink-3 num line-through">{baseline?.toLocaleString('en-IN')}</span>
          )}
          <span className={cn('text-[12px] font-bold num', changed ? 'text-brand' : 'text-ink')}>
            {value.toLocaleString('en-IN')}
            {unit && <span className="ml-0.5 text-[10.5px] font-semibold text-ink-3">{unit}</span>}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full focus-ring"
        style={{
          background: `linear-gradient(to right, rgb(var(--c-brand)) 0%, rgb(var(--c-brand)) ${pct}%, rgb(var(--c-surface-3)) ${pct}%, rgb(var(--c-surface-3)) 100%)`,
        }}
      />
    </div>
  );
}

export default function Prediction() {
  const [params] = useSearchParams();
  const caseId = params.get('case');
  const projectId = params.get('project');

  const spec = useApi((signal) => fetchPredictionSpec(signal), []);

  // A project link scores that project's worst open case.
  const project = useApi(
    (signal) => (projectId && !caseId ? fetchProject(projectId, signal) : Promise.resolve(null)),
    [projectId, caseId],
  );
  const seedCaseId = caseId ?? project.data?.topCases[0]?.caseId ?? null;
  const seed = useApi(
    (signal) => (seedCaseId ? fetchCaseScenario(seedCaseId, signal) : Promise.resolve(null)),
    [seedCaseId],
  );

  const [baseline, setBaseline] = useState<Record_ | null>(null);
  const [current, setCurrent] = useState<Record_ | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Seed the form from the spec defaults, or from a real case when one is linked.
  useEffect(() => {
    if (!spec.data) return;
    const base = seed.data?.record ?? (spec.data.defaults as Record_);
    setBaseline(base);
    setCurrent({ ...base });
  }, [spec.data, seed.data]);

  const score = useCallback(
    async (record: Record_, base: Record_) => {
      setPending(true);
      setError(null);
      try {
        setResult(await requestPrediction(record, base));
      } catch (err) {
        setError(err as Error);
      } finally {
        setPending(false);
      }
    },
    [],
  );

  // Re-score on every change, debounced so a slider drag does not flood the API.
  useEffect(() => {
    if (!current || !baseline) return;
    const id = setTimeout(() => void score(current, baseline), 220);
    return () => clearTimeout(id);
  }, [current, baseline, score]);

  const set = (field: string, value: string | number) => setCurrent((c) => (c ? { ...c, [field]: value } : c));

  const applyPreset = (patch: Record_) => setCurrent((c) => (c ? { ...c, ...patch } : c));

  const changedFields = useMemo(() => {
    if (!current || !baseline) return [];
    return Object.keys(current).filter((k) => String(current[k]) !== String(baseline[k]));
  }, [current, baseline]);

  if (spec.error) return <ErrorState error={spec.error} onRetry={spec.reload} />;
  if (spec.loading || !spec.data || !current || !baseline) return <SkeletonCard lines={12} />;

  const s: PredictionSpec = spec.data;
  const groups = new Map<string, PredictionSpec['numeric']>();
  for (const f of s.numeric) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group)!.push(f);
  }

  const now = result?.baseline;
  const projected = result?.result;

  return (
    <div className="space-y-4">
      <Card className="animate-fade-up overflow-hidden">
        <div className="relative bg-navy-900 px-5 py-6 grid-lines sm:px-7">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/20 blur-[90px]" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-brand/30 bg-brand/15 text-[#8FB4FF]" dot="bg-brand">
                  Scenario scoring
                </Badge>
                <DemoDataBadge />
                {seedCaseId && (
                  <Badge className="border-white/15 bg-white/10 text-white/70">
                    seeded from {seedCaseId}
                  </Badge>
                )}
              </div>
              <h2 className="mt-3 font-display text-[23px] font-extrabold tracking-tight text-white sm:text-[28px]">
                What would change if we intervened?
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
                Adjust the signals a department can actually move — compensation disbursement, litigation, record
                verification, review cadence — and the model re-scores the milestone. Both numbers are model-based
                estimates, not guaranteed outcomes.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5">
              {[
                { label: 'Features', value: String(s.numeric.length + s.categorical.length + s.binary.length) },
                { label: 'Surrogate R²', value: s.fidelity.logOddsR2.toFixed(2) },
                { label: 'Band match', value: `${(s.fidelity.bandAgreement * 100).toFixed(0)}%` },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <p className="font-display text-[17px] font-extrabold leading-none text-white num">{m.value}</p>
                  <p className="mt-1 text-[10px] text-white/40">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,440px)_1fr]">
        {/* ------------------------------------------------------- controls */}
        <Card className="h-fit animate-fade-up">
          <CardHeader
            title="Scenario inputs"
            subtitle={seedCaseId ? 'Loaded from a real case in the corpus' : 'Starting from the corpus medians'}
            icon={<BrainCircuit className="h-4 w-4" />}
            action={
              <button
                onClick={() => setCurrent({ ...baseline })}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-3 transition-colors hover:text-brand"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            }
          />

          <div className="border-b border-line px-5 pb-4">
            <p className="label-xs mb-2">Apply an intervention</p>
            <div className="grid gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.patch)}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-all hover:border-brand/40 hover:bg-brand/5"
                >
                  <Wand2 className="h-3.5 w-3.5 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-ink">{p.label}</span>
                    <span className="block truncate text-[11px] text-ink-3">{p.description}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {s.categorical.map((f) => (
                <Select
                  key={f.field}
                  label={f.label}
                  value={String(current[f.field] ?? f.default)}
                  onChange={(v) => set(f.field, v)}
                  options={f.options.map((o) => ({ label: o, value: o }))}
                />
              ))}
            </div>

            {Array.from(groups.entries()).map(([group, fields]) => (
              <div key={group}>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.09em] text-brand">{group}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fields.map((f) => (
                    <Slider
                      key={f.field}
                      label={f.label}
                      value={Number(current[f.field] ?? f.default)}
                      baseline={Number(baseline[f.field] ?? f.default)}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      unit={f.unit}
                      onChange={(v) => set(f.field, v)}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              {s.binary.map((f) => {
                const on = Number(current[f.field] ?? f.default) === 1;
                return (
                  <button
                    key={f.field}
                    onClick={() => set(f.field, on ? 0 : 1)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-[12px] font-semibold capitalize transition-colors',
                      on ? 'border-brand/45 bg-brand/[0.08] text-brand' : 'border-line bg-surface-2 text-ink-3',
                    )}
                  >
                    {f.label}: {on ? 'yes' : 'no'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-line p-5">
            <Button size="lg" className="w-full gap-2" onClick={() => void score(current, baseline)} disabled={pending}>
              {pending ? (
                <>
                  <Activity className="h-4 w-4 animate-pulse" /> Re-scoring…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" /> Re-score scenario
                </>
              )}
            </Button>
            <p className="mt-2.5 text-center text-[11px] leading-relaxed text-ink-3">
              Scored server-side by the linear surrogate of the deployed ensemble, so contributions sum exactly to the
              score shown.
            </p>
          </div>
        </Card>

        {/* -------------------------------------------------------- results */}
        <div className="space-y-4">
          {error && <ErrorState error={error} onRetry={() => void score(current, baseline)} title="Scoring failed" />}

          <Card className="animate-fade-up">
            <CardHeader
              title="Model-based scenario estimate"
              subtitle="Baseline against the adjusted scenario"
              icon={<Sparkles className="h-4 w-4" />}
              action={
                <InfoDot text="A scenario estimate assumes every other signal stays as recorded. It is not a forecast of what an intervention will achieve." />
              }
            />
            <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[1fr_1fr_1.1fr]">
              <div className="rounded-2xl border border-line bg-surface-2 p-4">
                <p className="label-xs">Baseline — as recorded</p>
                <p className="mt-2 font-display text-[34px] font-extrabold leading-none num" style={{ color: now ? RISK_HEX[now.riskBand] : undefined }}>
                  {now ? `${now.riskScore}%` : '—'}
                </p>
                <p className="mt-1.5 text-[11.5px] font-bold uppercase tracking-wider" style={{ color: now ? RISK_HEX[now.riskBand] : undefined }}>
                  {now?.riskBand ?? ''} risk
                </p>
                {seed.data && (
                  <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-3">
                    The deployed ensemble scores this case at{' '}
                    <span className="font-bold text-ink-2 num">{seed.data.ensemble.riskScore}%</span>; the surrogate
                    reproduces it as {now?.riskScore ?? '—'}%.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-brand/30 bg-brand/[0.06] p-4">
                <p className="label-xs text-brand">Projected — adjusted</p>
                <p
                  className="mt-2 font-display text-[34px] font-extrabold leading-none num"
                  style={{ color: projected ? RISK_HEX[projected.riskBand] : undefined }}
                >
                  {projected ? `${projected.riskScore}%` : '—'}
                </p>
                <p
                  className="mt-1.5 text-[11.5px] font-bold uppercase tracking-wider"
                  style={{ color: projected ? RISK_HEX[projected.riskBand] : undefined }}
                >
                  {projected?.riskBand ?? ''} risk
                </p>
                {result?.delta && (
                  <p
                    className={cn(
                      'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold num',
                      result.delta.riskScore < 0
                        ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                        : result.delta.riskScore > 0
                          ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                          : 'bg-surface-3 text-ink-3',
                    )}
                  >
                    {result.delta.riskScore > 0 ? '+' : ''}
                    {Math.abs(result.delta.riskScore) < 1 && result.delta.riskScore !== 0
                      ? result.delta.riskScore.toFixed(1)
                      : Math.round(result.delta.riskScore)}{' '}
                    percentage points
                  </p>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                  {changedFields.length === 0
                    ? 'No fields changed yet — adjust an input or apply an intervention.'
                    : `${changedFields.length} field${changedFields.length > 1 ? 's' : ''} changed from the baseline.`}
                </p>
              </div>

              <div className="grid place-items-center">
                {projected && (
                  <RiskGauge
                    score={projected.riskScore}
                    label={projected.riskBand}
                    sublabel={`${projected.imputedFields} field${projected.imputedFields === 1 ? '' : 's'} imputed`}
                    color={RISK_HEX[projected.riskBand]}
                  />
                )}
              </div>
            </div>
            <div className="border-t border-line px-5 py-3">
              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                This is a <span className="font-semibold">model-based scenario estimate</span>, not a guaranteed outcome.
                It answers &ldquo;what would the model predict if the record looked like this?&rdquo; — nothing about
                whether the intervention is achievable, or whether other factors would move with it.
              </p>
            </div>
          </Card>

          {projected && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="animate-fade-up">
                <CardHeader
                  title="What raises the risk"
                  subtitle="Contributions in the adjusted scenario"
                  icon={<Sparkles className="h-4 w-4" />}
                />
                <div className="px-5 pb-5">
                  <ContributorBars
                    contributors={projected.increasing.map((g) => ({ group: g.group, value: g.value, share: g.share }))}
                    max={7}
                  />
                </div>
              </Card>

              <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
                <CardHeader title="Recommended next step" subtitle="Prompted by the leading contributor" icon={<ClipboardCheck className="h-4 w-4" />} />
                <div className="space-y-3 px-5 pb-5">
                  {result?.intervention && (
                    <div className="rounded-xl border border-brand/25 bg-brand/[0.06] p-4">
                      <p className="text-[13.5px] font-bold leading-snug text-ink">{result.intervention.action}</p>
                      {result.intervention.detail && (
                        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{result.intervention.detail}</p>
                      )}
                      <p className="mt-2.5 text-[11px] text-ink-3">Owner: {result.intervention.owner}</p>
                    </div>
                  )}
                  <div>
                    <p className="label-xs mb-2">Factors reducing the risk</p>
                    {projected.reducing.length === 0 ? (
                      <p className="text-[12px] text-ink-3">Nothing in this record is pulling the prediction down.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {projected.reducing.slice(0, 5).map((r) => (
                          <div key={r.group} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-1.5">
                            <span className="text-[12px] font-medium text-ink-2">{r.group}</span>
                            <span className="text-[11.5px] font-bold text-emerald-600 dark:text-emerald-400 num">
                              {r.value.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <RiskMeter score={projected.riskScore} level={projected.riskBand} label="Projected risk" compact />
                </div>
              </Card>
            </div>
          )}

          {projected && (
            <Card className="animate-fade-up">
              <CardHeader
                title="Feature-level detail"
                subtitle="Every contribution in the scenario, largest first — these sum exactly to the score"
                icon={<Activity className="h-4 w-4" />}
              />
              <div className="overflow-x-auto px-5 pb-5">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr className="border-b border-line">
                      {['Feature', 'Factor group', 'Value used', 'Contribution'].map((h, i) => (
                        <th
                          key={h}
                          className={cn('py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-3', i > 1 ? 'text-right' : 'text-left')}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projected.features.slice(0, 14).map((f) => (
                      <tr key={f.feature} className="border-b border-line/70 last:border-0">
                        <td className="py-2.5 text-[12.5px] font-semibold text-ink">
                          {f.label}
                          {f.imputed && (
                            <Badge className="ml-2 border-amber-500/25 bg-amber-500/10 text-[9.5px] text-amber-600 dark:text-amber-400">
                              imputed
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-[11.5px] text-ink-3">{f.group}</td>
                        <td className="py-2.5 text-right text-[12px] text-ink-2 num">{f.value}</td>
                        <td
                          className={cn(
                            'py-2.5 text-right text-[12.5px] font-bold num',
                            f.contribution > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
                          )}
                        >
                          {f.contribution > 0 ? '+' : ''}
                          {f.contribution.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-3">
                Contributions are the closed-form Shapley values of the surrogate, in log-odds. For a case already in the
                corpus, the case screen shows the deployed ensemble's own TreeSHAP attributions instead —{' '}
                {seedCaseId ? (
                  <Link to={`/cases/${seedCaseId}`} className="font-semibold text-brand hover:underline">
                    open {seedCaseId}
                  </Link>
                ) : (
                  'open any case from the registry'
                )}
                .
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
