import { useMemo } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Database, Download, FileSpreadsheet, FileText, Gauge, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, InfoDot, MetricStrip, PageSkeleton, Tabs } from '@/components/ui';
import { ChartTooltip } from '@/components/charts';
import { ErrorState, KeyValue, PrototypeNotice, QualityBadge } from '@/components/ui/primitives';
import { AXIS_TICK, CHART_COLORS, RISK_HEX, groupColor, shortStage } from '@/lib/risk';
import { formatCompact, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import { datasetCsvUrl, datasetPdfUrl, fetchExportManifest, fetchModel, fetchSummary } from '@/api/client';
import type { ModelScore } from '@/data/types';

const mb = (bytes: number) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`);

export default function DataAndModel() {
  const { values, set } = useFilters({ tab: 'dataset' });
  const summary = useApi((signal) => fetchSummary(signal), []);
  const model = useApi((signal) => fetchModel(signal), []);
  const manifest = useApi((signal) => fetchExportManifest(signal), []);

  const s = summary.data;
  const dataset = model.data?.dataset;
  const metrics = model.data?.metrics as
    | {
        models: Record<string, { label: string; test: ModelScore; validation: ModelScore; iterations?: number }>;
        deployed: string;
        operatingThreshold: number;
        split: { strategy: string; train: { rows: number; from: string; to: string }; validation: { rows: number; from: string; to: string }; test: { rows: number; from: string; to: string }; openRows: number };
        leakageControls: string[];
        shap: { available: boolean; rows?: number; topK?: number; seconds?: number };
        surrogateFidelity: { logOddsR2: number; spearman: number; meanAbsProbDiff: number; bandAgreement: number };
        features: number;
        target: { name: string; definition: string; positiveRateObserved: number };
        riskBandMix?: Record<string, number>;
        trainingSeconds?: number;
      }
    | undefined;

  const stageDist = useMemo(() => {
    const d = dataset?.distributions?.stage as Record<string, number> | undefined;
    return Object.entries(d ?? {}).map(([stage, count]) => ({ stage: stage.split(' ')[0], full: stage, count }));
  }, [dataset]);

  const missing = useMemo(() => {
    const rates = s?.dataQuality.missingRates ?? {};
    return Object.entries(rates)
      .map(([field, rate]) => ({ field, rate: Number((rate * 100).toFixed(2)), count: s?.dataQuality.missingByField[field] ?? 0 }))
      .sort((a, b) => b.rate - a.rate);
  }, [s]);

  const importance = model.data?.importance;

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  if (summary.loading || !s) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <PrototypeNotice />

      <MetricStrip
        items={[
          { label: 'Records', value: formatNumber(s.totals.cases) },
          { label: 'Columns', value: formatNumber(s.dataQuality.columns) },
          { label: 'Projects', value: formatNumber(s.totals.projects) },
          { label: 'Labelled rows', value: formatCompact(s.totals.observedCases) },
          { label: 'Open rows (scored only)', value: formatCompact(s.totals.openCases) },
          { label: 'Mean data quality', value: `${s.dataQuality.meanScore}%` },
        ]}
      />

      <Card>
        <CardHeader
          title="Dataset and model documentation"
          subtitle="What the corpus contains, how complete it is, and how the deployed model was trained and evaluated"
          icon={<Database className="h-4 w-4" />}
          action={
            <Tabs
              tabs={[
                { id: 'dataset', label: 'Dataset' },
                { id: 'quality', label: 'Data quality' },
                { id: 'model', label: 'Model card' },
                { id: 'features', label: 'Feature importance' },
                { id: 'exports', label: 'Exports' },
              ]}
              active={values.tab}
              onChange={(v) => set({ tab: v })}
            />
          }
        />

        {/* -------------------------------------------------------- dataset */}
        {values.tab === 'dataset' && (
          <div className="grid gap-5 px-5 pb-5 xl:grid-cols-[1fr_1fr]">
            <div>
              <p className="label-xs mb-2">Composition</p>
              <KeyValue
                columns={2}
                rows={[
                  { label: 'Dataset', value: dataset?.name ?? 'land_acquisition_synthetic_350k' },
                  { label: 'Records', value: formatNumber(s.totals.cases) },
                  { label: 'Snapshot date', value: s.today },
                  { label: 'Delay threshold', value: `${dataset?.delayThresholdDays ?? 30} days` },
                  { label: 'States', value: formatNumber(s.totals.states) },
                  { label: 'Districts', value: formatNumber(s.totals.districts) },
                  { label: 'Parcel area', value: `${formatCompact(s.totals.parcelAreaHa)} ha` },
                  { label: 'Affected families', value: formatCompact(s.totals.affectedFamilies) },
                  {
                    label: 'Positive rate (labelled)',
                    value: `${((dataset?.labels?.positiveRate ?? 0) * 100).toFixed(2)}%`,
                    hint: 'milestones that slipped >30 days',
                  },
                  {
                    label: 'Label availability',
                    value: `${((s.totals.observedCases / s.totals.cases) * 100).toFixed(1)}%`,
                    hint: 'the rest are still inside their window',
                  },
                ]}
              />
              <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
                <p className="text-sm font-bold text-ink">How a row is framed</p>
                <p className="mt-1.5 text-xs text-ink-2">
                  Each row is one acquisition case captured at a point inside its current statutory stage, paired with
                  the outcome of that stage's next milestone. The target is{' '}
                  <code className="font-mono text-xs">next_milestone_delayed</code>: 1 when the milestone slips
                  more than {dataset?.delayThresholdDays ?? 30} days. Rows whose milestone is still inside its window
                  carry no target at all — they are the live portfolio the model predicts on.
                </p>
              </div>
            </div>

            <div>
              <p className="label-xs mb-2">Stage distribution</p>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageDist} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
                    <XAxis dataKey="stage" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} tickFormatter={shortStage} height={24} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} width={46} tickFormatter={(v) => formatCompact(v as number)} />
                    <Tooltip
                      cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                      content={
                        <ChartTooltip
                          formatter={(v) => `${formatNumber(v as number)} records`}
                          labelFormatter={(l) => stageDist.find((d) => d.stage === l)?.full ?? l}
                        />
                      }
                    />
                    <Bar dataKey="count" name="Records" radius={[4, 4, 0, 0]} fill={CHART_COLORS.brand} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="label-xs mb-2 mt-4">Ground-truth risk bands</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries((dataset?.distributions?.riskBand ?? {}) as Record<string, number>).map(([band, count]) => (
                  <div key={band} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: RISK_HEX[band as 'Low'] }} />
                    <span className="text-xs font-medium text-ink-2">{band}</span>
                    <span className="ml-auto text-xs font-bold text-ink num">{formatCompact(count)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-3">
                Ground-truth bands come from the generator's latent propensity and are only populated for labelled rows.
                Everywhere else in the platform, bands are the deployed model's own output.
              </p>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------- quality */}
        {values.tab === 'quality' && (
          <div className="grid gap-5 px-5 pb-5 xl:grid-cols-[1fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <QualityBadge score={s.dataQuality.meanScore} />
                <Badge className="border-line bg-surface-2 text-ink-2">
                  {formatNumber(s.dataQuality.totalMissingCells)} blank cells across {s.dataQuality.auditedFields} audited fields
                </Badge>
              </div>
              <p className="mt-3 text-xs text-ink-2">
                Data quality is scored per case from the fields the model consumes: each missing field costs 9 points, a
                pending verification 6 and an unfiled approval 5, floored at 25. The score travels with the case, so a
                prediction built on a thin record is visibly flagged as such rather than presented with false
                confidence.
              </p>
              <p className="label-xs mb-2 mt-5">Field-reporting gaps</p>
              <div className="space-y-2.5">
                {missing.map((m) => (
                  <div key={m.field}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-mono text-xs text-ink-2">{m.field}</p>
                      <p className="text-xs font-bold text-ink num">{m.rate}%</p>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-amber-500 animate-grow-bar"
                        style={{ ['--bar-w' as string]: `${Math.min(100, m.rate * 14)}%`, width: `${Math.min(100, m.rate * 14)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-ink-3 num">{formatNumber(m.count)} records</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="label-xs mb-2">Quality score distribution</p>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={s.qualityHistogram.map((count, i) => ({
                      bucket: `${i * 10}`,
                      label: `${i * 10}–${i * 10 + 10}`,
                      count,
                    }))}
                    margin={{ top: 8, right: 12, left: -10, bottom: 4 }}
                  >
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))', fontSize: 10 }} unit="%" />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-ink-3))' }} width={46} tickFormatter={(v) => formatCompact(v as number)} />
                    <Tooltip
                      cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                      content={<ChartTooltip formatter={(v) => `${formatNumber(v as number)} cases`} labelFormatter={(l) => `quality ${l}–${Number(l) + 10}%`} />}
                    />
                    <Bar dataKey="count" name="Cases" radius={[4, 4, 0, 0]} animationDuration={800}>
                      {s.qualityHistogram.map((_, i) => (
                        <Cell key={i} fill={i >= 9 ? '#10B981' : i >= 8 ? '#0EA5A4' : i >= 6 ? '#F59E0B' : '#E11D48'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="h-4 w-4" /> What a low score means
                </p>
                <p className="mt-1.5 text-xs text-ink-2">
                  A weak data-quality score does not invalidate the prediction, but it does mean more of the feature
                  vector was imputed. Treat those cases as needing a record check before acting on the risk score.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------- model */}
        {values.tab === 'model' && metrics && (
          <div className="space-y-5 px-5 pb-5">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <div className="relative overflow-x-auto">
                <p className="label-xs mb-2">Held-out test performance</p>
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-line">
                      {['Model', 'ROC-AUC', 'PR-AUC', 'Precision', 'Recall', 'F1', 'Brier'].map((h, i) => (
                        <th
                          key={h}
                          className={cn('py-2.5 text-xs font-medium text-ink-3', i === 0 ? 'text-left' : 'text-right')}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(metrics.models).map(([key, m]) => (
                      <tr key={key} className={cn('border-b border-line/70 last:border-0', key === metrics.deployed && 'bg-brand/[0.04]')}>
                        <td className="py-2.5 text-sm font-semibold text-ink">
                          {m.label}
                          {key === metrics.deployed && (
                            <Badge className="ml-2 border-brand/25 bg-brand/10 text-brand">deployed</Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-right text-sm font-bold text-ink num">{m.test.rocAuc.toFixed(4)}</td>
                        <td className="py-2.5 text-right text-sm text-ink-2 num">{m.test.prAuc.toFixed(4)}</td>
                        <td className="py-2.5 text-right text-sm text-ink-2 num">{m.test.at_threshold.precision.toFixed(4)}</td>
                        <td className="py-2.5 text-right text-sm text-ink-2 num">{m.test.at_threshold.recall.toFixed(4)}</td>
                        <td className="py-2.5 text-right text-sm text-ink-2 num">{m.test.at_threshold.f1.toFixed(4)}</td>
                        <td className="py-2.5 text-right text-sm text-ink-2 num">{m.test.brier.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-ink-3">
                  Precision, recall and F1 are reported at the operating threshold {metrics.operatingThreshold}, chosen
                  on the validation window to maximise F1 — not tuned on the test set. The confusion matrix at that
                  threshold is{' '}
                  {(() => {
                    const c = metrics.models[metrics.deployed].test.at_threshold.confusion;
                    return `TP ${formatNumber(c.tp)} · FP ${formatNumber(c.fp)} · FN ${formatNumber(c.fn)} · TN ${formatNumber(c.tn)}`;
                  })()}
                  .
                </p>
              </div>

              <div>
                <p className="label-xs mb-2">Time-aware split</p>
                <KeyValue
                  columns={1}
                  rows={[
                    { label: 'Strategy', value: metrics.split.strategy },
                    { label: 'Train', value: `${formatNumber(metrics.split.train.rows)} rows · ${metrics.split.train.from} → ${metrics.split.train.to}` },
                    { label: 'Validation', value: `${formatNumber(metrics.split.validation.rows)} rows · ${metrics.split.validation.from} → ${metrics.split.validation.to}` },
                    { label: 'Test', value: `${formatNumber(metrics.split.test.rows)} rows · ${metrics.split.test.from} → ${metrics.split.test.to}` },
                    { label: 'Scored but unlabelled', value: `${formatNumber(metrics.split.openRows)} open rows` },
                    { label: 'Features', value: formatNumber(metrics.features) },
                  ]}
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" /> Leakage controls
                </p>
                <ul className="mt-2 space-y-1.5">
                  {metrics.leakageControls.map((c) => (
                    <li key={c} className="flex gap-2 text-xs text-ink-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Sparkles className="h-4 w-4 text-brand" /> Explainability
                </p>
                <p className="mt-2 text-xs text-ink-2">
                  {metrics.shap.available
                    ? `TreeSHAP values are precomputed for all ${formatNumber(metrics.shap.rows ?? 0)} rows, keeping the top ${
                        metrics.shap.topK ?? 6
                      } contributors per case. Case-level explanations are therefore the ensemble's own attributions, not an approximation.`
                    : 'SHAP was unavailable at training time, so explanations fall back to the linear surrogate.'}
                </p>
                <p className="mt-2 text-xs text-ink-2">
                  Scenarios, edited projects and records sent through the integration API are scored by the deployed
                  ensemble itself — its trees are exported and evaluated in the API, reproducing scikit-learn exactly — with
                  exact TreeSHAP computed per request. A linear reference model is still distilled for transparency
                  (log-odds R² {metrics.surrogateFidelity.logOddsR2}) but no longer scores anything.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <p className="text-sm font-bold text-ink">Target</p>
              <p className="mt-1.5 text-xs text-ink-2">
                <code className="font-mono text-xs">{metrics.target.name}</code> — {metrics.target.definition}.
                Positive rate on labelled rows: {(metrics.target.positiveRateObserved * 100).toFixed(2)}%.
              </p>
              <p className="mt-2 text-xs text-ink-2">
                These figures describe performance on synthetic data generated by a known process. They demonstrate that
                the pipeline learns the structure present in the corpus; they are not evidence of accuracy on real
                acquisition records.
              </p>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- features */}
        {values.tab === 'features' && importance && (
          <div className="grid gap-5 px-5 pb-5 xl:grid-cols-2">
            <div>
              <p className="label-xs mb-2 flex items-center gap-1.5">
                Mean |SHAP| by factor group
                <InfoDot text="Average absolute contribution to the predicted log-odds, summed across the features that make up each factor." />
              </p>
              <div className="space-y-2.5">
                {importance.shapByGroup.slice(0, 12).map((g, i) => {
                  const max = importance.shapByGroup[0].value || 1;
                  return (
                    <div key={g.group}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">{g.group}</p>
                        <p className="text-xs font-bold text-ink num">{g.value.toFixed(3)}</p>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full animate-grow-bar"
                          style={{
                            ['--bar-w' as string]: `${(g.value / max) * 100}%`,
                            width: `${(g.value / max) * 100}%`,
                            background: groupColor(g.group),
                            animationDelay: `${i * 50}ms`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="relative overflow-x-auto">
              <p className="label-xs mb-2 flex items-center gap-1.5">
                Permutation importance
                <InfoDot text="Drop in validation ROC-AUC when a single feature is shuffled. Model-agnostic, and independent of the SHAP attribution above." />
              </p>
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-line">
                    {['Feature', 'Group', 'AUC drop'].map((h, i) => (
                      <th key={h} className={cn('py-2.5 text-xs font-medium text-ink-3', i === 2 ? 'text-right' : 'text-left')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importance.permutation.slice(0, 14).map((r) => (
                    <tr key={r.feature} className="border-b border-line/70 last:border-0">
                      <td className="py-2.5 text-xs font-semibold text-ink">{r.label}</td>
                      <td className="py-2.5 text-xs text-ink-3">{r.group}</td>
                      <td className="py-2.5 text-right text-xs font-bold text-ink num">{r.aucDrop.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-3">
                Importance describes what the model relies on. It is not a causal ranking of what delays acquisitions.
              </p>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------- exports */}
        {values.tab === 'exports' && (
          <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
            {(manifest.data?.files ?? []).map((f) => (
              <div key={f.name} className="rounded-lg border border-line bg-surface-2 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-3 text-ink-2">
                    {f.name.endsWith('.pdf') ? <FileText className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}
                  </span>
                  <Badge className={f.available ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-line bg-surface text-ink-3'}>
                    {f.available ? mb(f.bytes) : 'not generated'}
                  </Badge>
                </div>
                <p className="mt-3 font-mono text-sm font-bold text-ink">{f.name}</p>
                <p className="mt-1.5 text-xs text-ink-2">{f.label}</p>
                {f.generatedAt && (
                  <p className="mt-1.5 text-xs text-ink-3">Generated {f.generatedAt.slice(0, 19).replace('T', ' ')} UTC</p>
                )}
                <a href={f.name.endsWith('.pdf') ? datasetPdfUrl() : datasetCsvUrl()} className="mt-3 block">
                  <Button variant={f.available ? 'primary' : 'outline'} className="w-full gap-2" disabled={!f.available}>
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </a>
              </div>
            ))}

            <div className="rounded-lg border border-line bg-surface-2 p-5 lg:col-span-2">
              <p className="text-sm font-bold text-ink">About these exports</p>
              <p className="mt-1.5 text-xs text-ink-2">
                The CSV is the complete corpus: {formatNumber(s.totals.cases)} rows × {s.dataQuality.columns} columns,
                served gzipped. The PDF carries the full documentation set — title page and prototype-data notice, a
                field dictionary for every column, distribution and data-quality tables, the model card, and a tabular
                export of a documented systematic sample in two column parts joined on{' '}
                <code className="font-mono text-xs">case_id</code>. A single PDF holding all 350,000 rows would run
                to thousands of pages, so <code className="font-mono text-xs">npm run data:pdf:full</code> emits
                the complete row set as numbered volumes instead.
              </p>
              <p className="mt-2 text-xs text-ink-2">
                Filtered case exports are available from the Cases and Projects screens — those respect whatever filter
                is on screen and are generated server-side.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-3">
          <p className="label-xs flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5" /> Reproducibility
          </p>
          <span>Seeded generator — identical corpus on every run</span>
          <span>
            Store <span className="font-bold text-ink num">{s.store ? mb(s.store.bytes) : '—'}</span> loaded in{' '}
            <span className="font-bold text-ink num">{s.store?.loadMs ?? '—'} ms</span>
          </span>
          <span>
            Deployed model <span className="font-bold text-ink">{s.model.deployed}</span>
          </span>
          <span className="ml-auto">
            Pipeline: <code className="font-mono">npm run data</code>
          </span>
        </div>
      </Card>
    </div>
  );
}
