import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrainCircuit, CheckCircle2, Download, FilePlus2, FileUp, RotateCcw, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge } from '@/components/ui';
import { ErrorState, KeyValue } from '@/components/ui/primitives';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchDeletedProjects, fetchRetrainStatus, fetchSummary, fetchValidation, restoreProject, startRetrain, uploadProjectsCsv, uploadTemplateUrl } from '@/api/client';
import { formatDate } from '@/lib/format';
import type { UploadResult } from '@/data/types';

export default function Admin() {
  const { can } = useAuth();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-3">Every action on this screen is permission-checked by the API and written to the audit trail.</p>
        <div className="flex gap-2">
          <DemoDataBadge />
          {can('project.create') && (
            <Link to="/projects/new">
              <Button size="sm" className="gap-1.5">
                <FilePlus2 className="h-3.5 w-3.5" /> Add project
              </Button>
            </Link>
          )}
        </div>
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        {can('data.upload') ? <CsvUpload /> : <Unavailable title="CSV upload" permission="data.upload" />}
        <ModelPanel canRetrain={can('model.retrain')} />
      </section>
      <ValidationPanel />
      {can('project.delete') && <DeletedProjects />}
    </div>
  );
}

function Unavailable({ title, permission }: { title: string; permission: string }) {
  return (
    <Card className="p-6">
      <p className="text-md font-bold text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-3">Your role does not have the {permission} permission.</p>
    </Card>
  );
}

function CsvUpload() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (commit: boolean) => {
    if (text === null) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await uploadProjectsCsv(text, commit));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="CSV project upload"
        subtitle="Validate every row first; commit only when all rows pass"
        icon={<FileUp className="h-4 w-4" />}
        action={
          <a href={uploadTemplateUrl()}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Template
            </Button>
          </a>
        }
      />
      <div className="space-y-3 px-5 pb-5">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface-2 px-4 py-6 text-center hover:border-brand/40">
          <Upload className="h-5 w-5 text-ink-3" />
          <span className="text-sm font-semibold text-ink">{fileName || 'Choose a CSV file'}</span>
          <span className="text-xs text-ink-3">Up to 500 projects · checks columns, types, state, district, stage, project type, percentages, coordinates, dates and eligible authority</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              setResult(null);
              setText(await f.text());
            }}
          />
        </label>
        <div className="flex gap-2">
          <Button variant="outline" disabled={text === null || busy} onClick={() => run(false)} className="gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Validate
          </Button>
          <Button disabled={!result?.ok || result.committed || busy} onClick={() => run(true)} className="gap-1.5">
            <Upload className="h-4 w-4" /> Commit {result?.summary ? `${result.summary.valid} projects` : ''}
          </Button>
        </div>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        {result && (
          <div className="space-y-2">
            {result.fileErrors.map((e) => (
              <p key={e} className="flex items-start gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
              </p>
            ))}
            {result.warnings.map((w) => (
              <p key={w} className="text-xs text-amber-700 dark:text-amber-400">
                {w}
              </p>
            ))}
            {result.summary && (
              <p className="text-sm font-semibold text-ink">
                {result.summary.valid} of {result.summary.rows} rows valid{result.committed ? ` — ${result.created.length} projects created` : ''}.
              </p>
            )}
            {result.created.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.created.map((c) => (
                  <Link key={c.id} to={`/projects/${c.id}`}>
                    <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-700">
                      {c.id} · {c.riskScore}% {c.riskBand}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
            <div className="max-h-[320px] divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {result.rows.map((r) => (
                <div key={r.row} className="px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    {r.valid ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                    Row {r.row}: {r.name || '(no name)'}
                  </p>
                  {r.errors.map((e, i) => (
                    <p key={i} className="ml-5 text-xs text-red-700 dark:text-red-300">
                      {e.column && <span className="font-mono">{e.column}: </span>}
                      {e.message}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ModelPanel({ canRetrain }: { canRetrain: boolean }) {
  const summary = useApi((signal) => fetchSummary(signal), []);
  const [tick, setTick] = useState(0);
  const status = useApi((signal) => fetchRetrainStatus(signal), [tick]);
  const [message, setMessage] = useState<string | null>(null);
  const running = status.data?.job.status === 'running';

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, [running]);

  const m = summary.data?.model;
  return (
    <Card>
      <CardHeader title="Model metrics & retraining" subtitle={m ? `Deployed: ${m.deployed.replace('_', ' ')} · trained ${status.data?.model ? formatDate(status.data.model) : '—'}` : ''} icon={<BrainCircuit className="h-4 w-4" />} />
      <div className="space-y-3 px-5 pb-5">
        {summary.error && <ErrorState error={summary.error} />}
        {m && (
          <KeyValue
            columns={3}
            rows={[
              { label: 'Test ROC-AUC', value: m.test.rocAuc.toFixed(3), hint: `baseline LR ${m.baseline.rocAuc.toFixed(3)}` },
              { label: 'Test PR-AUC', value: m.test.prAuc.toFixed(3) },
              { label: 'F1 @ threshold', value: m.test.at_threshold.f1.toFixed(3), hint: `threshold ${m.operatingThreshold}` },
              { label: 'Brier', value: m.test.brier.toFixed(3) },
              { label: 'Serving model', value: m.version ?? '—', hint: 'exported trees, exact TreeSHAP' },
              { label: 'Slip MAE (if delayed)', value: m.slipModel ? `${m.slipModel.conditionalTestMae}d` : '—', hint: m.slipModel ? `median baseline ${m.slipModel.conditionalBaselineMae}d` : undefined },
            ]}
          />
        )}
        <div className="rounded-lg border border-line bg-surface-2 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">Retrain with newly recorded outcomes (gated against the champion)</p>
              <p className="text-xs text-ink-3">{status.data?.environment.ok ? `Environment: ${status.data.environment.detail}` : `Environment unavailable: ${status.data?.environment.detail ?? '…'}`}</p>
            </div>
            <Button
              size="sm"
              disabled={!canRetrain || running || !status.data?.environment.ok}
              onClick={async () => {
                const r = await startRetrain().catch((e: Error) => ({ started: false, reason: e.message }));
                setMessage(r.started ? 'Retraining started — about 15–20 minutes including TreeSHAP on every case.' : r.reason ?? 'Could not start');
                setTick((n) => n + 1);
              }}
              className="gap-1.5"
            >
              <RotateCcw className={cn('h-3.5 w-3.5', running && 'animate-spin')} /> {running ? 'Running…' : 'Start retraining'}
            </Button>
          </div>
          {!canRetrain && <p className="mt-1.5 text-xs text-ink-3">Retraining requires the model.retrain permission (National Administrator).</p>}
          {message && <p className="mt-2 text-xs text-ink-2">{message}</p>}
          {status.data && status.data.job.status !== 'idle' && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-semibold text-ink">
                Job {status.data.job.id} · {status.data.job.status}
                {status.data.job.error && <span className="text-red-600"> — {status.data.job.error}</span>}
              </p>
              {status.data.job.steps.map((s) => (
                <p key={s.name} className="text-xs text-ink-2">
                  <Badge className="mr-1.5">{s.status}</Badge>
                  {s.name}
                </p>
              ))}
              <pre className="max-h-40 overflow-auto rounded-lg bg-navy-900 p-2.5 font-mono text-xs text-white/80">{status.data.job.log.slice(-20).join('\n')}</pre>
            </div>
          )}
        </div>
        <p className="text-xs text-ink-3">
          Continuous learning — new outcomes, live monitoring, drift, registry and rollback: <Link to="/learning" className="font-semibold text-brand hover:underline">Model Lifecycle</Link>. Full model card: <Link to="/data" className="font-semibold text-brand hover:underline">Data & Model</Link>.
        </p>
      </div>
    </Card>
  );
}

function ValidationPanel() {
  const [n, setN] = useState(0);
  const report = useApi((signal) => fetchValidation(signal), [n]);
  return (
    <Card>
      <CardHeader
        title="Data consistency validation"
        subtitle={report.data ? `${report.data.passed} passed · ${report.data.failed} failed · ran ${new Date(report.data.ranAt).toLocaleTimeString('en-IN')}` : 'Checks that dashboard, project, GIS, workflow and case data agree'}
        icon={<ShieldCheck className="h-4 w-4" />}
        action={
          <Button size="sm" variant="outline" onClick={() => setN((x) => x + 1)} disabled={report.loading || report.refreshing}>
            Re-run
          </Button>
        }
      />
      {report.error && <ErrorState error={report.error} />}
      <div className="divide-y divide-line border-t border-line">
        {(report.data?.checks ?? []).map((c) => (
          <div key={c.id} className="flex items-start gap-3 px-5 py-2.5">
            {c.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{c.label}</p>
              {c.detail && <p className="text-xs text-ink-3">{c.detail}</p>}
              {c.examples.map((e) => (
                <p key={e} className="font-mono text-xs text-red-700 dark:text-red-300">
                  {e}
                </p>
              ))}
            </div>
            <span className="font-mono text-xs text-ink-3">{c.passed ? 'pass' : `${c.failures} fail`}</span>
          </div>
        ))}
        {report.loading && <p className="px-5 py-6 text-center text-xs text-ink-3">Running checks…</p>}
      </div>
    </Card>
  );
}

function DeletedProjects() {
  const list = useApi((signal) => fetchDeletedProjects(signal), []);
  return (
    <Card>
      <CardHeader title="Deleted projects" subtitle="Soft-deleted and restorable; deletion reasons are in the audit trail" icon={<RotateCcw className="h-4 w-4" />} />
      <div className="divide-y divide-line border-t border-line">
        {(list.data?.projects ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {p.id} · {p.name}
              </p>
              <p className="text-xs text-ink-3">
                {formatDate(p.at)} · {p.reason}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={async () => { await restoreProject(p.id); list.reload(); }}>
              Restore
            </Button>
          </div>
        ))}
        {list.data?.projects.length === 0 && <p className="px-5 py-5 text-xs text-ink-3">No deleted projects.</p>}
      </div>
    </Card>
  );
}
