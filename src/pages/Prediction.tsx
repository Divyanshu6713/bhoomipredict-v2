import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Info, Loader2, Minus, RotateCcw, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, InfoDot, Select, Skeleton } from '@/components/ui';
import { ErrorState, RiskPill, RiskVerdict } from '@/components/ui/primitives';
import { ContributorBars } from '@/components/explain/Contributors';
import { DependencyNetwork } from '@/components/network/DependencyNetwork';
import { RecommendationList } from '@/components/workflow';
import { useApi } from '@/hooks';
import { fetchPredictionSpec, fetchScenarioOptions, fetchScenarioSeed, scoreScenario } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { IssueProfilePanel } from '@/components/issues/IssueProfilePanel';
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

const SIGNAL_GROUPS = Array.from(new Set(SIGNAL_FIELDS.map((f) => f.group)));

const PRESETS: Array<{ id: string; label: string; description: string; patch: Signals; clearPending?: string[] }> = [
  { id: 'compensation', label: 'Clear the compensation backlog', description: 'Disbursement to 90%, pending days to a fortnight, treasury release cleared', patch: { compensation_completion_percentage: 90, compensation_pending_days: 14, compensation_status: 'Paid' }, clearPending: ['TREASURY'] },
  { id: 'legal', label: 'Consolidate the litigation', description: 'Legal cases down to 0.1 per parcel, dispute complexity Low', patch: { legal_case_count: 0.1, dispute_complexity: 'Low' }, clearPending: ['DISPUTE_FORUM'] },
  { id: 'records', label: 'Close the land-record gaps', description: 'Documentation to 95%, records verified, land-records actions cleared', patch: { document_completeness: 95, verification_status: 'Verified' }, clearPending: ['LAND_RECORDS', 'SUB_DIVISION'] },
  { id: 'approvals', label: 'Escalate pending approvals', description: 'Approvals and clearances disposed; gating dependencies cleared', patch: { approval_delay_days: 0, approval_status: 'Approved', department_response_days: 18 }, clearPending: ['CENTRAL_SANCTION', 'FOREST', 'SIA_UNIT', 'AVIATION', 'RAILWAY_INTERFACE'] },
];

function Slider({ id, label, value, min, max, step, unit, baseline, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; unit?: string; baseline?: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  const changed = baseline !== undefined && Math.abs(baseline - value) > 1e-6;
  const fmt = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm text-ink-2">
          {label}
        </label>
        <span className="flex shrink-0 items-baseline gap-1.5">
          {changed && <span className="text-xs text-ink-3 line-through num">{fmt(Number(baseline))}</span>}
          <span className={cn('text-sm font-medium num', changed ? 'text-brand' : 'text-ink')}>
            {fmt(value)}
            {unit && <span className="ml-0.5 text-xs font-normal text-ink-3">{unit}</span>}
          </span>
        </span>
      </div>
      <input
        id={id}
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

function InputSection({ step, title, description, action, children }: { step: number; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-5 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-surface-3 text-2xs font-medium text-ink-2 num" aria-hidden>
              {step}
            </span>
            {title}
          </h2>
          <p className="mt-0.5 pl-7 text-xs text-ink-3">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A neutral starting context, placed inside the user's own jurisdiction when
 * they have one. An unset district is resolved to the first valid district
 * once the state's district list arrives.
 */
const NATIONAL_DEFAULT: ScenarioContext = { state: 'Maharashtra', district: 'Nagpur', projectType: 'National Highway', stage: 'Compensation', affectedFamilies: 120, flags: {} };

function defaultContext(scope: { state: string | null; district: string | null } | null): ScenarioContext {
  if (!scope?.state) return NATIONAL_DEFAULT;
  return { ...NATIONAL_DEFAULT, state: scope.state, district: scope.district ?? '' };
}

export default function Prediction() {
  const [params] = useSearchParams();
  const projectId = params.get('project');
  const { user } = useAuth();
  const DEFAULT_CONTEXT = useMemo(() => defaultContext(user ? { state: user.state, district: user.district } : null), [user]);

  const spec = useApi((signal) => fetchPredictionSpec(signal), []);
  const seed = useApi((signal) => (projectId ? fetchScenarioSeed(projectId, signal) : Promise.resolve(null)), [projectId]);

  const [context, setContext] = useState<ScenarioContext | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [signals, setSignals] = useState<Signals>({});
  const [baseline, setBaseline] = useState<{ context: ScenarioContext; pending: string[]; signals: Signals } | null>(null);
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [scoring, setScoring] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
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
  }, [spec.data, seed.data, projectId, DEFAULT_CONTEXT]);

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
  if (!context || !baseline) {
    return (
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <div className="card space-y-4 p-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
        <div className="card p-5">
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  const r = result?.result;
  const b = result?.baseline;
  const reset = () => {
    setContext(baseline.context);
    setPending(baseline.pending);
    setSignals(baseline.signals);
  };

  return (
    <div className="space-y-5">
      <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <DemoDataBadge />
        {seed.data ? (
          <span>
            Starting from{' '}
            <Link to={`/projects/${seed.data.project.id}`} className="link">
              {seed.data.project.name}
            </Link>{' '}
            as recorded.
          </span>
        ) : (
          <span>Starting from a neutral scenario with dataset medians.</span>
        )}
        {spec.data && (
          <span className="inline-flex items-center gap-1">
            Scoring fidelity R² <span className="num">{spec.data.fidelity.logOddsR2.toFixed(2)}</span> · band agreement <span className="num">{(spec.data.fidelity.bandAgreement * 100).toFixed(0)}%</span>
            <InfoDot text="How closely scenario scoring reproduces the deployed ensemble on real records. The effect of a pending department action is measured by re-scoring." />
          </span>
        )}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* ------------------------------------------------------ inputs */}
        <Card className="divide-y divide-line xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <InputSection
            step={1}
            title="Describe the project"
            description="Location and type decide the authorities and the model's categorical inputs"
            action={
              <Button size="sm" variant="ghost" onClick={reset} disabled={changedCount === 0} className="-mr-2 -mt-1">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Select label="State" value={context.state} onChange={(v) => setCtx({ state: v, district: '', subDistrict: null, primaryAuthority: undefined })} options={(options.data?.states ?? [context.state]).map((s) => ({ label: s, value: s }))} />
              <Select
                label="District"
                value={context.district}
                onChange={(v) => setCtx({ district: v, subDistrict: null, primaryAuthority: undefined })}
                options={[...(context.district ? [] : [{ label: 'Select district', value: '' }]), ...(options.data?.districts ?? []).map((d) => ({ label: `${d.district}${d.inCorpus ? '' : ' (no history)'}`, value: d.district }))]}
              />
              <Select label="Project type" value={context.projectType} onChange={(v) => setCtx({ projectType: v as ProjectType, subtype: undefined, primaryAuthority: undefined })} options={(options.data?.projectTypes ?? []).map((t) => ({ label: t.name, value: t.name }))} />
              <Select label="Subtype" value={context.subtype ?? typeDef?.subtypes[0] ?? ''} onChange={(v) => setCtx({ subtype: v, primaryAuthority: undefined })} options={(typeDef?.subtypes ?? []).map((s) => ({ label: s, value: s }))} />
              <div className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                <Select label="Acquiring / requiring body" value={context.primaryAuthority ?? options.data?.authorityOptions?.[0] ?? ''} onChange={(v) => setCtx({ primaryAuthority: v })} options={(options.data?.authorityOptions ?? []).map((a) => ({ label: a, value: a }))} />
                <p className="mt-1 text-xs text-ink-3">Only bodies eligible for this type, State and district are offered.</p>
              </div>
              <Select label="Current stage" value={context.stage} onChange={(v) => setCtx({ stage: v as StageName })} options={LIFECYCLE_STAGES.map((s) => ({ label: s, value: s }))} />
              <Select label={districtDef ? 'Taluk / tehsil' : 'Sub-district'} value={context.subDistrict ?? districtDef?.subDistricts[0] ?? ''} onChange={(v) => setCtx({ subDistrict: v })} options={(districtDef?.subDistricts ?? []).map((s) => ({ label: s, value: s }))} />
              <div>
                <label htmlFor="scenario-families" className="mb-1.5 block text-xs font-medium text-ink-2">
                  Affected families
                </label>
                <input id="scenario-families" type="number" min={0} inputMode="numeric" value={context.affectedFamilies ?? 0} onChange={(e) => setCtx({ affectedFamilies: Number(e.target.value) })} className="input" />
              </div>
            </div>
            <fieldset className="mt-4">
              <legend className="mb-1.5 text-xs font-medium text-ink-2">Site conditions</legend>
              <div className="flex flex-wrap gap-1.5">
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
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCtx({ flags: { ...context.flags, [k]: !on } })}
                      className={cn('h-8 rounded-md border px-2.5 text-sm transition-colors focus-ring', on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2')}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </InputSection>

          <InputSection step={2} title="Try an intervention" description="Moves the relevant signals and clears the matching department actions">
            <div className="grid gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSignals((s) => ({ ...s, ...p.patch }));
                    if (p.clearPending) setPending((list) => list.filter((c) => !p.clearPending!.includes(c)));
                  }}
                  className="group flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/40 focus-ring"
                >
                  <Wand2 className="h-4 w-4 shrink-0 text-ink-3 group-hover:text-brand" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{p.label}</span>
                    <span className="block text-xs text-ink-3">{p.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
              ))}
            </div>
          </InputSection>

          <InputSection step={3} title="Fine-tune signals" description="Project-level values in the model's vocabulary">
            <div className="space-y-6">
              {SIGNAL_GROUPS.map((g) => (
                <div key={g} className="space-y-4">
                  <p className="text-2xs font-medium text-ink-3">{g}</p>
                  {SIGNAL_FIELDS.filter((f) => f.group === g).map((f) => (
                    <Slider
                      key={f.field}
                      id={`signal-${f.field}`}
                      label={f.label}
                      value={Number(signals[f.field] ?? f.min)}
                      baseline={Number(baseline.signals[f.field] ?? f.min)}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      unit={f.unit}
                      onChange={(v) => setSignals((s) => ({ ...s, [f.field]: v }))}
                    />
                  ))}
                </div>
              ))}
            </div>
          </InputSection>
        </Card>

        {/* ----------------------------------------------------- results */}
        <div className="min-w-0 space-y-5" aria-live="polite">
          {error && <ErrorState error={error} title="The scenario could not be scored" />}

          <Card>
            <CardHeader
              title="Predicted outcome"
              subtitle={seed.data ? `Compared with ${seed.data.project.name} as recorded` : 'Compared with the starting scenario'}
              action={
                <span className={cn('inline-flex h-6 items-center gap-1.5 text-xs text-ink-3 transition-opacity', scoring ? 'opacity-100' : 'opacity-0')} aria-hidden={!scoring}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Re-scoring
                </span>
              }
            />
            {r && b ? (
              <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <RiskVerdict
                  level={r.riskBand}
                  score={Math.round(r.probability * 100)}
                  label="Scenario — probability the next milestone slips by more than 30 days"
                  detail={
                    <>
                      <span className="num">{r.predictedDelayDays ?? '—'}</span> days expected slip · <span className="num">{result?.dependencies.pendingCount ?? 0}</span> department actions pending
                    </>
                  }
                />
                <div className="rounded-xl border border-line p-4 sm:p-5">
                  <p className="text-xs font-medium text-ink-2">Change from baseline</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div>
                      <p className="text-xs text-ink-3">Baseline</p>
                      <RiskPill level={b.riskBand} score={Math.round(b.probability * 100)} className="mt-1" />
                    </div>
                    <ArrowRight className="mt-4 h-4 w-4 text-ink-3" aria-hidden />
                    <div>
                      <p className="text-xs text-ink-3">Scenario</p>
                      <RiskPill level={r.riskBand} score={Math.round(r.probability * 100)} className="mt-1" />
                    </div>
                  </div>
                  {result?.delta && <DeltaLine points={result.delta.riskScore} days={result.delta.predictedDelayDays} />}
                  <p className="mt-2 text-xs text-ink-3">{changedCount === 0 ? 'No inputs changed yet — adjust the panel on the left.' : `${changedCount} input group${changedCount > 1 ? 's' : ''} changed.`}</p>
                  {result?.delta && (result.delta.addedDependencies.length > 0 || result.delta.removedDependencies.length > 0) && (
                    <p className="mt-2 border-t border-line pt-2 text-xs text-ink-2">
                      {result.delta.addedDependencies.length > 0 && <>Added: {result.delta.addedDependencies.join('; ')}. </>}
                      {result.delta.removedDependencies.length > 0 && <>Removed: {result.delta.removedDependencies.join('; ')}.</>}
                    </p>
                  )}
                  {seed.data && (
                    <p className="mt-2 border-t border-line pt-2 text-xs text-ink-3">
                      Headline project risk is {seed.data.project.riskScore}% ({seed.data.project.riskBasis}).
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
                <Skeleton className="h-36 rounded-xl" />
                <Skeleton className="h-36 rounded-xl" />
              </div>
            )}
            <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-ink-3">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              A model-based estimate of what the prediction would be if the record looked like this. It says nothing about whether an intervention is achievable.
            </p>
          </Card>

          {result && r && (
            <div className="grid gap-5 2xl:grid-cols-2">
              <Card>
                <CardHeader title="Why — what raises the risk" subtitle="Largest contributions to this scenario's score" />
                <div className="px-5 pb-5">
                  <ContributorBars contributors={r.increasing.map((g) => ({ group: g.group, value: g.value, share: g.share }))} max={7} />
                  {r.reducing.length > 0 && (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="mb-2 text-xs font-medium text-ink-2">Pulling the risk down</p>
                      <div className="flex flex-wrap gap-1.5">
                        {r.reducing.slice(0, 5).map((x) => (
                          <Badge key={x.group} tone="success">
                            {x.group} <span className="num">{x.value.toFixed(2)}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="What to do — recommendations" subtitle="Rules that apply to this scenario, with owners from its authority network" />
                <div className="px-5 pb-5">
                  <RecommendationList items={result.recommendations} max={8} emptyText="No rule fires for this scenario — nothing requires escalation at these values." />
                </div>
              </Card>
            </div>
          )}

          {result?.issues && <IssueProfilePanel profile={result.issues} subtitle={`Delay causes that apply to this ${context.projectType.toLowerCase()} scenario at ${context.stage}. Updates as you change pending actions and signals.`} />}

          {result && (
            <Card>
              <CardHeader
                title="Authorities and dependencies"
                subtitle={`${result.dependencies.count} dependencies · ${result.dependencies.relevantCount} gate ${context.stage} · coordination score ${result.dependencies.coordinationScore}/100 · milestone: ${result.milestone}`}
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

          {r && (
            <Card>
              <button type="button" onClick={() => setShowFeatures((v) => !v)} aria-expanded={showFeatures} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left focus-ring">
                <span>
                  <span className="block text-base font-semibold text-ink">Feature-level detail</span>
                  <span className="block text-sm text-ink-3">Largest contributions in log-odds — they sum exactly to the scenario score</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-3 transition-transform', showFeatures && 'rotate-180')} />
              </button>
              {showFeatures && (
                <div className="relative overflow-x-auto border-t border-line">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="bg-surface-2 text-xs text-ink-3">
                        <th scope="col" className="py-2 pl-5 pr-3 text-left font-medium">Feature</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">Factor group</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Value used</th>
                        <th scope="col" className="py-2 pl-3 pr-5 text-right font-medium">Contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {r.features.slice(0, 14).map((f) => (
                        <tr key={f.feature}>
                          <td className="py-2 pl-5 pr-3 text-sm text-ink">
                            {f.label}
                            {f.imputed && (
                              <Badge tone="warning" className="ml-2">
                                imputed
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-ink-3">{f.group}</td>
                          <td className="px-3 py-2 text-right text-sm text-ink-2 num">{f.value}</td>
                          <td className={cn('py-2 pl-3 pr-5 text-right text-sm font-medium num', f.contribution > 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300')}>
                            {f.contribution > 0 ? '+' : ''}
                            {f.contribution.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {seed.data && (
                    <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
                      For the deployed ensemble&rsquo;s own TreeSHAP attributions on real case records, open{' '}
                      <Link to={`/projects/${seed.data.project.id}`} className="link">
                        {seed.data.project.id}
                      </Link>{' '}
                      and any of its cases.
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DeltaLine({ points, days }: { points: number; days: number }) {
  const Icon = points < 0 ? ArrowDownRight : points > 0 ? ArrowUpRight : Minus;
  const tone = points < 0 ? 'text-emerald-700 dark:text-emerald-300' : points > 0 ? 'text-red-700 dark:text-red-300' : 'text-ink-3';
  return (
    <p className={cn('mt-3 flex items-center gap-1.5 text-md font-semibold num', tone)}>
      <Icon className="h-4 w-4" aria-hidden />
      {points > 0 ? '+' : ''}
      {points.toFixed(1)} pts
      <span className="text-sm font-normal text-ink-3">
        · {days > 0 ? '+' : ''}
        {days} days slip
      </span>
    </p>
  );
}
