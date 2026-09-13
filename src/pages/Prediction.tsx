import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ArrowRight, BrainCircuit, Info, MapPin, Network, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Card, CardHeader, DemoDataBadge, InfoDot, Select, SkeletonCard } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { ContributorBars } from '@/components/explain/Contributors';
import { DependencyNetwork } from '@/components/network/DependencyNetwork';
import { RecommendationList } from '@/components/workflow';
import { RiskGauge } from '@/components/charts';
import { RISK_HEX } from '@/lib/risk';
import { useApi } from '@/hooks';
import { fetchPredictionSpec, fetchScenarioOptions, fetchScenarioSeed, scoreScenario } from '@/api/client';
import { LIFECYCLE_STAGES, type ProjectType, type ScenarioContext, type ScenarioResponse, type StageName } from '@/data/types';

type Signals = Record<string, string | number>;

const SIGNAL_FIELDS: Array<{ field: string; label: string; min: number; max: number; step: number; unit?: string; group: string }> = [
  { field: 'compensation_completion_percentage', label: 'Compensation completion', min: 0, max: 100, step: 1, unit: '%', group: 'Compensation' },
  { field: 'compensation_pending_days', label: 'Days compensation pending', min: 0, max: 520, step: 5, unit: 'd', group: 'Compensation' },
  { field: 'legal_case_count', label: 'Open legal cases (per parcel)', min: 0, max: 12, step: 0.1, group: 'Legal' },
  { field: 'document_completeness', label: 'Documentation completeness', min: 10, max: 100, step: 1, unit: '%', group: 'Records' },
  { field: 'approval_delay_days', label: 'Approval / clearance pending', min: 0, max: 365, step: 5, unit: 'd', group: 'Departments' },
  { field: 'department_response_days', label: 'Departmental response time', min: 3, max: 120, step: 1, unit: 'd', group: 'Departments' },
  { field: 'inactivity_days', label: 'Days since last action', min: 0, max: 400, step: 5, unit: 'd', group: 'Schedule' },
  { field: 'elapsed_stage_days', label: 'Days elapsed in stage', min: 1, max: 400, step: 1, unit: 'd', group: 'Schedule' },
  { field: 'expected_stage_days', label: 'Days allowed for stage', min: 14, max: 260, step: 1, unit: 'd', group: 'Schedule' },
  { field: 'rr_progress_percentage', label: 'R&R progress', min: 0, max: 100, step: 1, unit: '%', group: 'R&R' },
];

const PRESETS: Array<{ id: string; label: string; description: string; patch: Signals; clearPending?: string[] }> = [
  { id: 'compensation', label: 'Clear the compensation backlog', description: 'Disbursement to 90%, pending days to a fortnight, treasury release cleared', patch: { compensation_completion_percentage: 90, compensation_pending_days: 14, compensation_status: 'Paid' }, clearPending: ['TREASURY'] },
  { id: 'legal', label: 'Consolidate the litigation', description: 'Legal cases down to 0.1 per parcel, dispute complexity Low', patch: { legal_case_count: 0.1, dispute_complexity: 'Low' }, clearPending: ['DISPUTE_FORUM'] },
  { id: 'records', label: 'Close the land-record gaps', description: 'Documentation to 95%, records verified, land-records actions cleared', patch: { document_completeness: 95, verification_status: 'Verified' }, clearPending: ['LAND_RECORDS', 'SUB_DIVISION'] },
  { id: 'approvals', label: 'Escalate pending approvals', description: 'Approvals and clearances disposed; gating dependencies cleared', patch: { approval_delay_days: 0, approval_status: 'Approved', department_response_days: 18 }, clearPending: ['CENTRAL_SANCTION', 'FOREST', 'SIA_UNIT', 'AVIATION', 'RAILWAY_INTERFACE'] },
];

function Slider({ label, value, min, max, step, unit, baseline, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; baseline?: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  const changed = baseline !== undefined && Math.abs(baseline - value) > 1e-6;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="label-xs">{label}</label>
        <span className="flex items-baseline gap-1.5">
          {changed && <span className="text-[10.5px] text-ink-3 num line-through">{Number(baseline).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>}
          <span className={cn('text-[12px] font-bold num', changed ? 'text-brand' : 'text-ink')}>
            {value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
        style={{ background: `linear-gradient(to right, rgb(var(--c-brand)) 0%, rgb(var(--c-brand)) ${pct}%, rgb(var(--c-surface-3)) ${pct}%, rgb(var(--c-surface-3)) 100%)` }}
      />
    </div>
  );
}

const DEFAULT_CONTEXT: ScenarioContext = { state: 'Karnataka', district: 'Mandya', projectType: 'Irrigation', stage: 'Compensation', affectedFamilies: 120, flags: {} };

export default function Prediction() {
  const [params] = useSearchParams();
  const projectId = params.get('project');

  const spec = useApi((signal) => fetchPredictionSpec(signal), []);
  const seed = useApi((signal) => (projectId ? fetchScenarioSeed(projectId, signal) : Promise.resolve(null)), [projectId]);

  const [context, setContext] = useState<ScenarioContext | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [signals, setSignals] = useState<Signals>({});
  const [baseline, setBaseline] = useState<{ context: ScenarioContext; pending: string[]; signals: Signals } | null>(null);
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [scoring, setScoring] = useState(false);
  const request = useRef(0);

  // Seed from a project when linked, otherwise from a neutral context and the corpus medians.
  useEffect(() => {
    if (projectId && !seed.data) return;
    if (!spec.data) return;
    if (seed.data) {
      const s = seed.data.seed;
      setContext(s.context);
      setPending(s.pending);
      setSignals(s.signals);
      setBaseline({ context: s.context, pending: s.pending, signals: s.signals });
    } else {
      const base: Signals = {};
      for (const f of SIGNAL_FIELDS) base[f.field] = Number(spec.data.defaults[f.field] ?? f.min);
      setContext(DEFAULT_CONTEXT);
      setPending([]);
      setSignals(base);
      setBaseline({ context: DEFAULT_CONTEXT, pending: [], signals: base });
    }
  }, [spec.data, seed.data, projectId]);

  const options = useApi(
    (signal) => (context ? fetchScenarioOptions({ state: context.state, district: context.district, projectType: context.projectType, subtype: context.subtype }, signal) : Promise.resolve(null)),
    [context?.state, context?.district, context?.projectType, context?.subtype],
  );

  // Re-score on every change, debounced.
  useEffect(() => {
    if (!context || !baseline || !context.district) return;
    const n = ++request.current;
    const t = setTimeout(async () => {
      setScoring(true);
      try {
        const res = await scoreScenario({ context, pending, signals, seedProjectId: projectId ?? undefined, baseline });
        if (n === request.current) {
          setResult(res);
          setError(null);
          // The server resolves the acquiring body; adopt it so the select shows the eligible one.
          if (res.context.primaryAuthority && res.context.primaryAuthority !== context.primaryAuthority) setContext((c) => (c ? { ...c, primaryAuthority: res.context.primaryAuthority } : c));
        }
      } catch (err) {
        if (n === request.current) setError(err as Error);
      } finally {
        if (n === request.current) setScoring(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [context, pending, signals, baseline, projectId]);

  // A state change leaves the district unset until its district list arrives; pick the first valid one.
  useEffect(() => {
    const list = options.data?.districts;
    if (!options.refreshing && !options.loading && list?.length && context && !list.some((d) => d.district === context.district)) {
      setContext((c) => (c ? { ...c, district: (list.find((d) => d.inCorpus) ?? list[0]).district, subDistrict: null } : c));
    }
  }, [options.data?.districts, options.refreshing, options.loading, context]);

  const setCtx = (patch: Partial<ScenarioContext>) => setContext((c) => (c ? { ...c, ...patch } : c));
  const typeDef = options.data?.projectTypes.find((t) => t.name === context?.projectType);
  const districtDef = options.data?.districts?.find((d) => d.district === context?.district);
  const changedCount = useMemo(() => {
    if (!baseline || !context) return 0;
    let n = Object.keys(signals).filter((k) => String(signals[k]) !== String(baseline.signals[k])).length;
    n += (['state', 'district', 'projectType', 'subtype', 'primaryAuthority', 'stage'] as const).filter((k) => (context[k] ?? '') !== (baseline.context[k] ?? '')).length;
    n += pending.length !== baseline.pending.length || pending.some((p) => !baseline.pending.includes(p)) ? 1 : 0;
    return n;
  }, [signals, context, pending, baseline]);

  if (spec.error) return <ErrorState error={spec.error} onRetry={spec.reload} />;
  if (seed.error) return <ErrorState error={seed.error} onRetry={seed.reload} />;
  if (!context || !baseline) return <SkeletonCard lines={12} />;

  const r = result?.result;
  const b = result?.baseline;

  return (
    <div className="space-y-4">
      <Card className="animate-fade-up overflow-hidden">
        <div className="relative bg-navy-900 px-5 py-6 grid-lines sm:px-7">
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-brand/30 bg-brand/15 text-[#8FB4FF]" dot="bg-brand">
                  Scenario scoring
                </Badge>
                <DemoDataBadge />
                {seed.data && <Badge className="border-white/15 bg-white/10 text-white/70">seeded from {seed.data.project.id}</Badge>}
              </div>
              <h2 className="mt-3 font-display text-[23px] font-extrabold tracking-tight text-white sm:text-[28px]">Which authorities hold this acquisition, and what would change if they acted?</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
                Choose the state, district and project type: the registry builds the dependency network for that context — framework, acquiring body, district offices, land records and clearances. Mark which department actions are pending, adjust the signals, and the model re-scores.
              </p>
            </div>
            {spec.data && (
              <div className="grid grid-cols-3 gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5">
                {[
                  { label: 'Surrogate R²', value: spec.data.fidelity.logOddsR2.toFixed(2) },
                  { label: 'Band match', value: `${(spec.data.fidelity.bandAgreement * 100).toFixed(0)}%` },
                  { label: 'Dependencies', value: String(result?.dependencies.count ?? '—') },
                ].map((m) => (
                  <div key={m.label} className="text-center">
                    <p className="font-display text-[17px] font-extrabold leading-none text-white num">{m.value}</p>
                    <p className="mt-1 text-[10px] text-white/40">{m.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,430px)_1fr]">
        {/* --------------------------------------------------- inputs */}
        <div className="space-y-4">
          <Card className="animate-fade-up">
            <CardHeader
              title="Project context"
              subtitle="Drives the authority network and the model's categorical inputs"
              icon={<MapPin className="h-4 w-4" />}
              action={
                <button
                  onClick={() => {
                    setContext(baseline.context);
                    setPending(baseline.pending);
                    setSignals(baseline.signals);
                  }}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-3 hover:text-brand"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              }
            />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              <Select label="State" value={context.state} onChange={(v) => setCtx({ state: v, district: '', subDistrict: null, primaryAuthority: undefined })} options={(options.data?.states ?? [context.state]).map((s) => ({ label: s, value: s }))} />
              <Select
                label="District"
                value={context.district}
                onChange={(v) => setCtx({ district: v, subDistrict: null, primaryAuthority: undefined })}
                options={[...(context.district ? [] : [{ label: 'Select district', value: '' }]), ...(options.data?.districts ?? []).map((d) => ({ label: `${d.district}${d.inCorpus ? '' : ' ·'}`, value: d.district }))]}
              />
              <Select label="Project type" value={context.projectType} onChange={(v) => setCtx({ projectType: v as ProjectType, subtype: undefined, primaryAuthority: undefined })} options={(options.data?.projectTypes ?? []).map((t) => ({ label: t.name, value: t.name }))} />
              <Select label="Subtype" value={context.subtype ?? typeDef?.subtypes[0] ?? ''} onChange={(v) => setCtx({ subtype: v, primaryAuthority: undefined })} options={(typeDef?.subtypes ?? []).map((s) => ({ label: s, value: s }))} />
              <div className="sm:col-span-2">
                <Select label="Primary acquiring / requiring body" value={context.primaryAuthority ?? options.data?.authorityOptions?.[0] ?? ''} onChange={(v) => setCtx({ primaryAuthority: v })} options={(options.data?.authorityOptions ?? []).map((a) => ({ label: a, value: a }))} />
                <p className="mt-1 text-[10.5px] text-ink-3">Only bodies eligible for this type in this state and district are offered.</p>
              </div>
              <Select label="Current stage" value={context.stage} onChange={(v) => setCtx({ stage: v as StageName })} options={LIFECYCLE_STAGES.map((s) => ({ label: s, value: s }))} />
              <Select label={districtDef ? 'Taluk / tehsil' : 'Sub-district'} value={context.subDistrict ?? districtDef?.subDistricts[0] ?? ''} onChange={(v) => setCtx({ subDistrict: v })} options={(districtDef?.subDistricts ?? []).map((s) => ({ label: s, value: s }))} />
              <div className="sm:col-span-2">
                <label className="label-xs mb-1.5 block">Affected families</label>
                <input type="number" min={0} value={context.affectedFamilies ?? 0} onChange={(e) => setCtx({ affectedFamilies: Number(e.target.value) })} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink focus-ring" />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                {(
                  [
                    ['forestLand', 'Forest land'],
                    ['crossesRailway', 'Crosses railway'],
                    ['crossesHighway', 'Crosses NH'],
                    ['consolidationOpen', 'Consolidation open'],
                  ] as const
                ).map(([k, label]) => {
                  const on = Boolean(context.flags?.[k]);
                  return (
                    <button key={k} onClick={() => setCtx({ flags: { ...context.flags, [k]: !on } })} className={cn('rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-colors', on ? 'border-brand/45 bg-brand/[0.08] text-brand' : 'border-line bg-surface-2 text-ink-3')}>
                      {label}: {on ? 'yes' : 'no'}
                    </button>
                  );
                })}
              </div>
              {result && (
                <p className="text-[10.5px] leading-relaxed text-ink-3 sm:col-span-2">
                  District history {Math.round(result.context.districtRate * 100)}% ({result.context.districtRateBasis}); authority history {Math.round(result.context.authorityRate * 100)}% ({result.context.authorityRateBasis}).
                </p>
              )}
            </div>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader title="Apply an intervention" subtitle="Moves the signals and clears the matching department actions" icon={<Wand2 className="h-4 w-4" />} />
            <div className="grid gap-2 px-5 pb-5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSignals((s) => ({ ...s, ...p.patch }));
                    if (p.clearPending) setPending((list) => list.filter((c) => !p.clearPending!.includes(c)));
                  }}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-all hover:border-brand/40 hover:bg-brand/5"
                >
                  <Wand2 className="h-3.5 w-3.5 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-ink">{p.label}</span>
                    <span className="block text-[11px] text-ink-3">{p.description}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader title="Signals" subtitle="Project-level values in the model's vocabulary" icon={<BrainCircuit className="h-4 w-4" />} />
            <div className="space-y-4 px-5 pb-5">
              {SIGNAL_FIELDS.map((f) => (
                <Slider key={f.field} label={f.label} value={Number(signals[f.field] ?? f.min)} baseline={Number(baseline.signals[f.field] ?? f.min)} min={f.min} max={f.max} step={f.step} unit={f.unit} onChange={(v) => setSignals((s) => ({ ...s, [f.field]: v }))} />
              ))}
            </div>
          </Card>
        </div>

        {/* -------------------------------------------------- results */}
        <div className="space-y-4">
          {error && <ErrorState error={error} title="Scenario could not be scored" />}

          <Card className="animate-fade-up">
            <CardHeader
              title="Model-based scenario estimate"
              subtitle={seed.data ? `Baseline is ${seed.data.project.name} as recorded` : 'Baseline is the starting scenario'}
              icon={<Sparkles className="h-4 w-4" />}
              action={<InfoDot text="Scored by the linear surrogate of the deployed ensemble, so every contribution — including each pending department action — is exact. It is an estimate, not a guaranteed outcome." />}
            />
            {r ? (
              <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[1fr_1fr_1.1fr]">
                <div className="rounded-2xl border border-line bg-surface-2 p-4">
                  <p className="label-xs">Baseline</p>
                  <p className="mt-2 font-display text-[34px] font-extrabold leading-none num" style={{ color: b ? RISK_HEX[b.riskBand] : undefined }}>
                    {b ? `${Math.round(b.probability * 100)}%` : '—'}
                  </p>
                  <p className="mt-1.5 text-[11.5px] font-bold uppercase tracking-wider" style={{ color: b ? RISK_HEX[b.riskBand] : undefined }}>
                    {b?.riskBand} risk · {b?.predictedDelayDays ?? '—'}d expected slip
                  </p>
                  {seed.data && <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-3">The project's headline risk is {seed.data.project.riskScore}% ({seed.data.project.riskBasis}); the surrogate on its project profile gives {b ? Math.round(b.probability * 100) : '—'}%.</p>}
                </div>
                <div className="rounded-2xl border border-brand/30 bg-brand/[0.06] p-4">
                  <p className="label-xs text-brand">Scenario</p>
                  <p className="mt-2 font-display text-[34px] font-extrabold leading-none num" style={{ color: RISK_HEX[r.riskBand] }}>
                    {Math.round(r.probability * 100)}%
                  </p>
                  <p className="mt-1.5 text-[11.5px] font-bold uppercase tracking-wider" style={{ color: RISK_HEX[r.riskBand] }}>
                    {r.riskBand} risk · {r.predictedDelayDays ?? '—'}d expected slip
                  </p>
                  {result?.delta && (
                    <p className={cn('mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold num', result.delta.riskScore < 0 ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : result.delta.riskScore > 0 ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400' : 'bg-surface-3 text-ink-3')}>
                      {result.delta.riskScore > 0 ? '+' : ''}
                      {result.delta.riskScore.toFixed(1)} pts · {result.delta.predictedDelayDays > 0 ? '+' : ''}
                      {result.delta.predictedDelayDays}d
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-ink-3">{changedCount === 0 ? 'Nothing changed yet.' : `${changedCount} input group${changedCount > 1 ? 's' : ''} changed.`}{scoring ? ' Re-scoring…' : ''}</p>
                  {result?.delta && (result.delta.addedDependencies.length > 0 || result.delta.removedDependencies.length > 0) && (
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-2">
                      {result.delta.addedDependencies.length > 0 && <>Added: {result.delta.addedDependencies.join('; ')}. </>}
                      {result.delta.removedDependencies.length > 0 && <>Removed: {result.delta.removedDependencies.join('; ')}.</>}
                    </p>
                  )}
                </div>
                <div className="grid place-items-center">
                  <RiskGauge score={r.riskScore} label={r.riskBand} sublabel={`${result?.dependencies.pendingCount ?? 0} department actions pending`} color={RISK_HEX[r.riskBand]} size={180} />
                </div>
              </div>
            ) : (
              <p className="px-5 pb-6 text-[12px] text-ink-3">{scoring ? 'Scoring…' : 'Choose a district to score the scenario.'}</p>
            )}
            <div className="border-t border-line px-5 py-3">
              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                A model-based scenario estimate: what the model would predict if the record looked like this. It says nothing about whether an intervention is achievable.
              </p>
            </div>
          </Card>

          {result && (
            <Card className="animate-fade-up">
              <CardHeader
                title="Authority & dependency network for this scenario"
                subtitle={`${result.dependencies.count} dependencies · ${result.dependencies.relevantCount} gate ${context.stage} · coordination ${result.dependencies.coordinationScore}/100 · milestone: ${result.milestone}`}
                icon={<Network className="h-4 w-4" />}
              />
              <div className="px-5 pb-5">
                <DependencyNetwork
                  nodes={result.dependencies.nodes}
                  framework={result.framework}
                  currentStage={context.stage}
                  note={result.dependencies.note}
                  onTogglePending={(code) => setPending((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]))}
                />
              </div>
            </Card>
          )}

          {result && r && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="animate-fade-up">
                <CardHeader title="What raises the risk" subtitle="Closed-form contributions in this scenario" icon={<Sparkles className="h-4 w-4" />} />
                <div className="px-5 pb-5">
                  <ContributorBars contributors={r.increasing.map((g) => ({ group: g.group, value: g.value, share: g.share }))} max={7} />
                  {r.reducing.length > 0 && (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="label-xs mb-2">Pulling the risk down</p>
                      <div className="flex flex-wrap gap-1.5">
                        {r.reducing.slice(0, 5).map((x) => (
                          <Badge key={x.group} className="border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                            {x.group} {x.value.toFixed(2)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
              <Card className="animate-fade-up">
                <CardHeader title="Recommendations" subtitle="Rules applied to this scenario, owners from its network" icon={<Activity className="h-4 w-4" />} />
                <div className="px-5 pb-5">
                  <RecommendationList items={result.recommendations} max={8} emptyText="No rule fires for this scenario." />
                </div>
              </Card>
            </div>
          )}

          {r && (
            <Card className="animate-fade-up">
              <CardHeader title="Feature-level detail" subtitle="Largest contributions, in log-odds — they sum exactly to the scenario score" icon={<Activity className="h-4 w-4" />} />
              <div className="overflow-x-auto px-5 pb-5">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr className="border-b border-line">
                      {['Feature', 'Factor group', 'Value used', 'Contribution'].map((h, i) => (
                        <th key={h} className={cn('py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-3', i > 1 ? 'text-right' : 'text-left')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.features.slice(0, 14).map((f) => (
                      <tr key={f.feature} className="border-b border-line/70 last:border-0">
                        <td className="py-2 text-[12.5px] font-semibold text-ink">
                          {f.label}
                          {f.imputed && <Badge className="ml-2 border-amber-500/25 bg-amber-500/10 text-[9.5px] text-amber-600">imputed</Badge>}
                        </td>
                        <td className="py-2 text-[11.5px] text-ink-3">{f.group}</td>
                        <td className="py-2 text-right text-[12px] text-ink-2 num">{f.value}</td>
                        <td className={cn('py-2 text-right text-[12.5px] font-bold num', f.contribution > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          {f.contribution > 0 ? '+' : ''}
                          {f.contribution.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {seed.data && (
                  <p className="mt-3 text-[11px] text-ink-3">
                    For the deployed ensemble's own TreeSHAP attributions on real case records, open{' '}
                    <Link to={`/projects/${seed.data.project.id}`} className="font-semibold text-brand hover:underline">
                      {seed.data.project.id}
                    </Link>{' '}
                    and any of its cases.
                  </p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
