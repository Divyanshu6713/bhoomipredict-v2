import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BrainCircuit, CheckCircle2, Clock3, Download, FastForward, FileUp, GitBranch, RotateCcw, ShieldCheck, TriangleAlert, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, SkeletonCard } from '@/components/ui';
import { ErrorState, KeyValue } from '@/components/ui/primitives';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { advanceSimulationClock, fetchDrift, fetchLearningStatus, outcomesTemplateUrl, rollbackModel, startRetrain, updateLearningSettings, uploadOutcomesCsv } from '@/api/client';
import { formatDate, formatNumber } from '@/lib/format';
import type { LearningStatus, ModelVersion } from '@/data/types';

const f3 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(3));

/**
 * Continuous learning, end to end:
 * new outcomes → live monitoring → drift → gated retraining → registry → rollback.
 */
export default function ModelLifecycle() {
  const { can } = useAuth();
  const [tick, setTick] = useState(0);
  const status = useApi((signal) => fetchLearningStatus(signal), [tick]);
  const drift = useApi((signal) => fetchDrift({ days: 120 }, signal), [tick]);
  const running = status.data?.job.status === 'running';

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [running]);

  if (status.error) return <ErrorState error={status.error} onRetry={status.reload} />;
  if (!status.data) return <SkeletonCard lines={10} />;
  const s = status.data;
  const refresh = () => setTick((n) => n + 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-3xl">
          <p className="label-xs">Continuous learning loop</p>
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            New milestone outcomes <Arrow /> prospective monitoring <Arrow /> drift check <Arrow /> retraining <Arrow /> champion vs challenger on the latest window <Arrow /> promote only if not worse <Arrow /> versioned registry with rollback.
          </p>
        </div>
        <DemoDataBadge />
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        <LoopStep icon={GitBranch} title="Serving model" value={s.registry.servingVersion ?? '—'} note={`${s.registry.versions.length} version${s.registry.versions.length === 1 ? '' : 's'} in the registry`} />
        <LoopStep icon={Upload} title="New outcomes" value={formatNumber(s.live.all.outcomes)} note={Object.entries(s.live.bySource).map(([k, v]) => `${k} ${formatNumber(v)}`).join(' · ') || 'none recorded yet'} />
        <LoopStep icon={Clock3} title="Awaiting retraining" value={formatNumber(s.live.awaitingRetrain)} note={`${formatNumber(s.live.appliedToChampion)} already in the serving model`} tone={s.retrainRecommended ? 'warn' : undefined} />
        <LoopStep icon={Activity} title="Drift (last 120 days)" value={drift.data?.overall ?? '…'} note="Population Stability Index vs training window" tone={drift.data?.overall === 'significant' ? 'bad' : drift.data?.overall === 'watch' ? 'warn' : undefined} />
      </section>

      {s.retrainRecommended && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-[12.5px] text-ink-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> Retraining recommended: {s.retrainReasons.join('; ')}.
        </p>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <LiveMonitoring s={s} />
        <Card>
          <CardHeader title="Data drift" subtitle={drift.data ? `${drift.data.recent.label} vs ${drift.data.reference.label}` : 'Recent population vs training window'} icon={<Activity className="h-4 w-4" />} />
          {drift.error && <ErrorState error={drift.error} />}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-surface-2 text-left text-[10.5px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="px-5 py-2">Signal</th>
                  <th className="px-3 py-2 text-right">Training mean</th>
                  <th className="px-3 py-2 text-right">Recent mean</th>
                  <th className="px-3 py-2 text-right">PSI</th>
                  <th className="px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(drift.data?.features ?? []).map((f) => (
                  <tr key={f.feature}>
                    <td className="px-5 py-1.5 font-semibold text-ink">{f.label}</td>
                    <td className="px-3 py-1.5 text-right num">{f.referenceMean ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right num">{f.recentMean ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-bold num">{f3(f.psi)}</td>
                    <td className="px-5 py-1.5">
                      <Badge className={cn(f.status === 'significant' ? 'border-rose-500/25 bg-rose-500/10 text-rose-600' : f.status === 'watch' ? 'border-amber-500/25 bg-amber-500/10 text-amber-600' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600')}>{f.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {drift.data && <p className="border-t border-line px-5 py-2.5 text-[10.5px] leading-relaxed text-ink-3">PSI &lt; 0.10 stable · 0.10–0.25 watch · &gt; 0.25 significant. Stage-mix PSI {drift.data.stageMix.psi}. {drift.data.note}</p>}
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <NewData canRecord={can('learning.record')} canSimulate={can('model.retrain')} s={s} onChange={refresh} />
        <Retraining canRetrain={can('model.retrain')} s={s} onChange={refresh} />
      </section>

      <Registry versions={s.registry.versions} champion={s.registry.champion} canRollback={can('model.retrain')} busy={running} onChange={refresh} />
    </div>
  );
}

const Arrow = () => <span className="mx-0.5 text-brand">→</span>;

function LoopStep({ icon: Icon, title, value, note, tone }: { icon: typeof GitBranch; title: string; value: string; note: string; tone?: 'warn' | 'bad' }) {
  return (
    <Card className={cn('p-4', tone === 'warn' && 'border-amber-500/40', tone === 'bad' && 'border-rose-500/40')}>
      <p className="flex items-center gap-1.5 label-xs">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <p className="mt-2 truncate font-display text-[20px] font-extrabold leading-none text-ink num">{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-3">{note}</p>
    </Card>
  );
}

function LiveMonitoring({ s }: { s: LearningStatus }) {
  const a = s.live.all;
  return (
    <Card>
      <CardHeader title="Prospective monitoring" subtitle="How the serving model did on outcomes recorded after it predicted them" icon={<ShieldCheck className="h-4 w-4" />} />
      <div className="space-y-3 px-5 pb-5">
        {a.outcomes === 0 ? (
          <p className="text-[12px] text-ink-3">No outcomes recorded yet. Record one from a case page, upload a CSV, or advance the simulation clock below.</p>
        ) : (
          <>
            <KeyValue
              columns={3}
              rows={[
                { label: 'Live ROC-AUC', value: f3(a.rocAuc), hint: s.live.offlineTest ? `offline test ${s.live.offlineTest.rocAuc.toFixed(3)}` : undefined, tone: s.live.rocAucDropVsTest !== null && s.live.rocAucDropVsTest > 0.05 ? 'text-rose-600' : undefined },
                { label: 'Precision / recall', value: `${f3(a.precision)} / ${f3(a.recall)}`, hint: `at threshold ${s.live.operatingThreshold}` },
                { label: 'Brier', value: f3(a.brier), hint: s.live.offlineTest ? `offline ${s.live.offlineTest.brier.toFixed(3)}` : undefined },
                { label: 'Outcomes', value: formatNumber(a.outcomes) },
                { label: 'Observed delayed', value: `${Math.round((a.delayedRate ?? 0) * 100)}%` },
                { label: 'Mean predicted', value: `${Math.round((a.meanPredicted ?? 0) * 100)}%` },
              ]}
            />
            <div>
              <p className="label-xs mb-1.5">Calibration on new outcomes</p>
              <div className="space-y-1">
                {(a.calibration ?? []).map((b) => (
                  <div key={b.bin} className="flex items-center gap-2 text-[11px]">
                    <span className="w-16 text-ink-3 num">{b.bin}</span>
                    <span className="relative h-3 flex-1 overflow-hidden rounded bg-surface-3">
                      <span className="absolute inset-y-0 left-0 bg-brand/35" style={{ width: `${(b.predicted ?? 0) * 100}%` }} />
                      <span className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: `${(b.observed ?? 0) * 100}%` }} />
                    </span>
                    <span className="w-28 text-right text-ink-2 num">
                      {b.count ? `${Math.round((b.predicted ?? 0) * 100)}% vs ${Math.round((b.observed ?? 0) * 100)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10.5px] text-ink-3">Bar = mean predicted probability · orange mark = observed delay rate. {s.live.note}</p>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function NewData({ canRecord, canSimulate, s, onChange }: { canRecord: boolean; canSimulate: boolean; s: LearningStatus; onChange: () => void }) {
  const [days, setDays] = useState(60);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [csvResult, setCsvResult] = useState<Awaited<ReturnType<typeof uploadOutcomesCsv>> | null>(null);

  const simulate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await advanceSimulationClock(days);
      setMsg(`Clock moved ${r.from} → ${r.to}: ${formatNumber(r.released)} outcomes released (${formatNumber(r.delayed)} delayed). Alert scan: ${r.scan?.newAlerts ?? 0} new alerts, ${r.scan?.escalations ?? 0} escalations.`);
      onChange();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const runCsv = async (commit: boolean) => {
    if (!csv) return;
    setBusy(true);
    try {
      setCsvResult(await uploadOutcomesCsv(csv, commit));
      if (commit) onChange();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="xl:col-span-2">
      <CardHeader title="New project data" subtitle="Three ways outcomes arrive; each is validated against the case and keeps the prediction made before it" icon={<Upload className="h-4 w-4" />} />
      <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <p className="text-[12.5px] font-semibold text-ink">1 · Officer records a milestone</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">On any open case page, a Land Acquisition Officer or administrator records the date the milestone was achieved (or that it is still pending past 30 days).</p>
          <Link to="/cases?status=open" className="mt-2 inline-block text-[12px] font-semibold text-brand hover:underline">
            Open cases →
          </Link>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <p className="text-[12.5px] font-semibold text-ink">2 · CSV or API ingestion</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">Bulk outcomes from a state system: every row validated; committed only if all pass. Systems can also POST /api/v1/outcomes with an API key.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a href={outcomesTemplateUrl()}>
              <Button size="sm" variant="outline" className="gap-1">
                <Download className="h-3.5 w-3.5" /> Template
              </Button>
            </a>
            <label className={cn('inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-2 hover:border-brand/50', !canRecord && 'pointer-events-none opacity-50')}>
              <FileUp className="h-3.5 w-3.5" /> Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCsv(await f.text());
                    setCsvResult(null);
                  }
                }}
              />
            </label>
          </div>
          {csv && (
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => runCsv(false)}>
                Validate
              </Button>
              <Button size="sm" disabled={busy || !csvResult || csvResult.summary.invalid > 0} onClick={() => runCsv(true)}>
                Commit
              </Button>
            </div>
          )}
          {csvResult && (
            <div className="mt-2 text-[11px] text-ink-2">
              {csvResult.summary.valid} valid · {csvResult.summary.invalid} invalid{csvResult.summary.committed ? ' · committed' : ''}
              {csvResult.errors.slice(0, 4).map((e) => (
                <p key={e.row} className="font-mono text-[10.5px] text-rose-600">
                  row {e.row}: {e.error}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5">
          <p className="text-[12.5px] font-semibold text-ink">3 · Simulation clock (demo)</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
            Releases the withheld synthetic outcomes of open cases that would become knowable by the new date, standing in for field data. Current date: <span className="font-semibold text-ink">{s.effectiveDate}</span>
            {s.simulationDate ? ` (snapshot ${s.snapshotDate})` : ''}.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px]">
              {[30, 60, 90, 180].map((d) => (
                <option key={d} value={d}>
                  +{d} days
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!canSimulate || busy || !s.withheldOutcomesAvailable} onClick={simulate} className="gap-1">
              <FastForward className="h-3.5 w-3.5" /> Advance
            </Button>
          </div>
        </div>
        {msg && <p className="md:col-span-3 text-[12px] text-ink-2">{msg}</p>}
      </div>
    </Card>
  );
}

function Retraining({ canRetrain, s, onChange }: { canRetrain: boolean; s: LearningStatus; onChange: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [minOutcomes, setMinOutcomes] = useState(s.autoRetrainMinOutcomes);
  const job = s.job;
  const running = job.status === 'running';
  return (
    <Card>
      <CardHeader title="Retraining" subtitle="Gated: the challenger must not be worse than the champion on the latest window" icon={<BrainCircuit className="h-4 w-4" />} />
      <div className="space-y-3 px-5 pb-5">
        <p className="text-[11px] text-ink-3">{s.environment.ok ? `Environment: ${s.environment.detail}` : `Environment unavailable: ${s.environment.detail}`}</p>
        <Button
          className="w-full gap-1.5"
          disabled={!canRetrain || running || !s.environment.ok}
          onClick={async () => {
            const r = await startRetrain().catch((e: Error) => ({ started: false, reason: e.message }));
            setMsg(r.started ? 'Retraining started (about 15–20 minutes with TreeSHAP on every case).' : r.reason ?? 'Could not start');
            onChange();
          }}
        >
          <RotateCcw className={cn('h-4 w-4', running && 'animate-spin')} /> {running ? `${job.kind === 'rollback' ? 'Rolling back' : 'Retraining'}…` : `Retrain with ${formatNumber(s.live.awaitingRetrain)} new outcomes`}
        </Button>
        <label className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[12px]">
          <span>
            <span className="font-semibold text-ink">Automatic retraining</span>
            <span className="block text-[10.5px] text-ink-3">when at least</span>
          </span>
          <input type="number" min={100} step={100} value={minOutcomes} onChange={(e) => setMinOutcomes(Number(e.target.value))} className="h-8 w-20 rounded-lg border border-line bg-surface px-2 text-right text-[12px] num" disabled={!canRetrain} />
          <span className="text-[10.5px] text-ink-3">outcomes</span>
          <input
            type="checkbox"
            checked={s.autoRetrain}
            disabled={!canRetrain}
            onChange={async (e) => {
              await updateLearningSettings({ autoRetrain: e.target.checked, autoRetrainMinOutcomes: minOutcomes });
              onChange();
            }}
          />
        </label>
        {msg && <p className="text-[11.5px] text-ink-2">{msg}</p>}
        {job.status !== 'idle' && (
          <div className="space-y-1">
            <p className="text-[11.5px] font-semibold text-ink">
              {job.kind ?? 'job'} {job.id} · <span className={cn(job.status === 'rejected' && 'text-amber-600', job.status === 'failed' && 'text-rose-600', job.status === 'succeeded' && 'text-emerald-600')}>{job.status}</span>
            </p>
            {job.steps.map((st) => (
              <p key={st.name} className="text-[10.5px] text-ink-2">
                <Badge className="mr-1">{st.status}</Badge>
                {st.name}
              </p>
            ))}
            {job.result?.gate?.reason && <p className="text-[11px] text-ink-2">Gate: {job.result.gate.reason}</p>}
            <pre className="max-h-32 overflow-auto rounded-lg bg-navy-900 p-2 font-mono text-[10px] leading-relaxed text-white/80">{job.log.slice(-14).join('\n')}</pre>
          </div>
        )}
      </div>
    </Card>
  );
}

function Registry({ versions, champion, canRollback, busy, onChange }: { versions: ModelVersion[]; champion: string | null; canRollback: boolean; busy: boolean; onChange: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Model registry" subtitle="Every training run with its data, metrics and gate decision; archived versions can be restored" icon={<GitBranch className="h-4 w-4" />} />
      {msg && <p className="px-5 pb-2 text-[12px] text-ink-2">{msg}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[12px]">
          <thead className="bg-surface-2 text-left text-[10.5px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-5 py-2">Version</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Trained</th>
              <th className="px-3 py-2 text-right">Labelled rows</th>
              <th className="px-3 py-2 text-right">New outcomes</th>
              <th className="px-3 py-2 text-right">ROC-AUC</th>
              <th className="px-3 py-2 text-right">PR-AUC</th>
              <th className="px-3 py-2 text-right">Brier</th>
              <th className="px-3 py-2">Gate decision</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {versions.map((v) => (
              <tr key={v.id} className={cn(v.id === champion && 'bg-brand/[0.04]')}>
                <td className="px-5 py-2 font-mono text-[11.5px] font-semibold text-ink">{v.id}</td>
                <td className="px-3 py-2">
                  <Badge className={cn(v.status === 'champion' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600' : v.status === 'rejected' ? 'border-amber-500/25 bg-amber-500/10 text-amber-600' : 'border-line bg-surface-2 text-ink-3')}>
                    {v.status === 'champion' ? <CheckCircle2 className="h-3 w-3" /> : v.status === 'rejected' ? <XCircle className="h-3 w-3" /> : null} {v.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-ink-2">
                  {formatDate(v.createdAt)}
                  <span className="block text-[10.5px] text-ink-3">{v.triggeredBy}</span>
                </td>
                <td className="px-3 py-2 text-right num">{formatNumber(v.observedRows)}</td>
                <td className="px-3 py-2 text-right num">{formatNumber(v.outcomesApplied)}</td>
                <td className="px-3 py-2 text-right num">{f3(v.test.rocAuc)}</td>
                <td className="px-3 py-2 text-right num">{f3(v.test.prAuc)}</td>
                <td className="px-3 py-2 text-right num">{f3(v.test.brier)}</td>
                <td className="max-w-[340px] px-3 py-2 text-[11px] leading-snug text-ink-2">{v.gate.reason}</td>
                <td className="px-5 py-2 text-right">
                  {v.status === 'archived' && v.archived !== false && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canRollback || busy}
                      onClick={async () => {
                        const r = await rollbackModel(v.id).catch((e: Error) => ({ started: false, reason: e.message }));
                        setMsg(r.started ? `Rolling back to ${v.id}…` : r.reason ?? 'Could not roll back');
                        onChange();
                      }}
                    >
                      Restore
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
