import { useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  Download,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Table2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, Select, SkeletonCard } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { RISK_HEX } from '@/lib/risk';
import { formatCompact, formatDate, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import {
  casesCsvUrl,
  datasetCsvUrl,
  datasetPdfUrl,
  fetchFacets,
  fetchProjects,
  fetchDashboard,
  fetchInterventions,
  fetchSummary,
} from '@/api/client';
import { STAGE_STATUS_LABEL } from '@/lib/status';

type ReportId = 'executive' | 'mis' | 'departments' | 'risk' | 'queue' | 'stage' | 'exceptions' | 'model';

interface ReportDef {
  id: ReportId;
  title: string;
  description: string;
  icon: typeof FileText;
  cadence: string;
  audience: string;
  sections: string[];
  filename: string;
}

const REPORTS: ReportDef[] = [
  {
    id: 'executive',
    title: 'Executive portfolio summary',
    description: 'One-page position: projects, cases, land, predicted risk mix and the leading delay contributors.',
    icon: FileBarChart,
    cadence: 'Monthly',
    audience: 'Secretary / Principal Secretary',
    sections: ['Portfolio totals', 'Risk mix', 'Top contributors', 'State ranking'],
    filename: 'executive-portfolio-summary',
  },
  {
    id: 'mis',
    title: 'State & district MIS',
    description: 'State-wise and district-wise projects, mean risk, delayed and blocked counts, compensation, R&R and legal load.',
    icon: Table2,
    cadence: 'Monthly',
    audience: 'Revenue Department / Collectorates',
    sections: ['State summary', 'District summary', 'Progress measures'],
    filename: 'state-district-mis',
  },
  {
    id: 'departments',
    title: 'Department bottleneck report',
    description: 'Cases waiting on each office — land records, competent authorities, clearances, treasury — from the dependency network.',
    icon: FileSpreadsheet,
    cadence: 'Fortnightly',
    audience: 'District Collector / State Nodal Officer',
    sections: ['By role', 'By named office'],
    filename: 'department-bottlenecks',
  },
  {
    id: 'risk',
    title: 'Project risk register',
    description: 'Every project ranked by next-milestone risk with its stage, deadline and leading contributor.',
    icon: FileText,
    cadence: 'Fortnightly',
    audience: 'Project Directors, PIU',
    sections: ['Ranked register', 'Milestone status', 'Leading contributor'],
    filename: 'project-risk-register',
  },
  {
    id: 'queue',
    title: 'Intervention queue pack',
    description: 'Open interventions with severity, trigger, responsible office, acting role, due date and status.',
    icon: Table2,
    cadence: 'Weekly',
    audience: 'Land Acquisition Officers',
    sections: ['Interventions', 'Trigger', 'Owner and due date'],
    filename: 'intervention-queue',
  },
  {
    id: 'stage',
    title: 'Stage performance report',
    description: 'Open caseload, predicted risk and historically observed slip for each statutory stage.',
    icon: FileBarChart,
    cadence: 'Monthly',
    audience: 'Monitoring Cell',
    sections: ['Stage risk', 'Observed slip', 'Average delay days'],
    filename: 'stage-performance',
  },
  {
    id: 'exceptions',
    title: 'Case exception report',
    description: 'Cases under litigation, with disputed titles, unpaid compensation or long inactivity.',
    icon: FileSpreadsheet,
    cadence: 'Weekly',
    audience: 'District Revenue Office',
    sections: ['Litigation', 'Title exceptions', 'Compensation exceptions'],
    filename: 'case-exceptions',
  },
  {
    id: 'model',
    title: 'Model performance report',
    description: 'Split, metrics, calibration and explainability provenance for the deployed model.',
    icon: FileBarChart,
    cadence: 'Quarterly',
    audience: 'Technical Review Committee',
    sections: ['Split and metrics', 'Calibration', 'Leakage controls'],
    filename: 'model-performance',
  },
];

function downloadCsv(rows: string[][], filename: string, today: string) {
  const csv = rows
    .map((r) => r.map((cell) => (/[",]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bhoomipredict-${filename}-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { values, set } = useFilters({ report: 'executive', scope: 'all' });
  const [generating, setGenerating] = useState<ReportId | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});

  const summary = useApi((signal) => fetchSummary(signal), []);
  const facets = useApi((signal) => fetchFacets(signal), []);
  const projects = useApi(
    (signal) => fetchProjects({ state: values.scope, sort: 'risk', pageSize: 100 }, signal),
    [values.scope],
  );
  const queue = useApi((signal) => fetchInterventions({ state: values.scope, pageSize: 100 }, signal), [values.scope]);
  const dash = useApi((signal) => fetchDashboard({ state: values.scope }, signal), [values.scope]);
  const mis = useApi((signal) => fetchProjects({ state: values.scope, sort: 'risk', pageSize: 500 }, signal), [values.scope]);

  const report = REPORTS.find((r) => r.id === values.report)!;
  const s = summary.data;

  const rows = useMemo<string[][]>(() => {
    if (!s) return [];
    const d = dash.data;
    switch (values.report) {
      case 'mis': {
        const list = mis.data?.projects ?? [];
        const group = (key: (p: (typeof list)[number]) => string) => {
          const m = new Map<string, typeof list>();
          for (const p of list) m.set(key(p), [...(m.get(key(p)) ?? []), p]);
          return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        };
        const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '0');
        const line = (name: string, ps: typeof list) => [
          name,
          String(ps.length),
          avg(ps.map((p) => p.riskScore)),
          String(ps.filter((p) => p.riskBand === 'High' || p.riskBand === 'Critical').length),
          String(ps.filter((p) => p.isDelayed).length),
          String(ps.filter((p) => p.isBlocked).length),
          String(ps.reduce((a, p) => a + p.openCases, 0)),
          String(ps.reduce((a, p) => a + p.residualBacklog, 0)),
          avg(ps.filter((p) => p.currentStageIndex >= 5).map((p) => p.compensationCompletionPct)),
          avg(ps.filter((p) => p.rrProgressPct !== null && p.currentStageIndex >= 6).map((p) => p.rrProgressPct as number)),
          String(ps.reduce((a, p) => a + p.legalCases, 0)),
          String(ps.reduce((a, p) => a + p.affectedFamilies, 0)),
        ];
        const head = ['Area', 'Projects', 'Mean risk %', 'High/Critical', 'Delayed', 'Blocked', 'Open cases', 'Residual backlog', 'Compensation % (due)', 'R&R % (due)', 'Legal cases', 'Affected families'];
        return [['STATE SUMMARY'], head, ...group((p) => p.state).map(([k, ps]) => line(k, ps)), [''], ['DISTRICT SUMMARY'], head, ...group((p) => `${p.district}, ${p.state}`).map(([k, ps]) => line(k, ps))];
      }
      case 'departments':
        return [
          ['Role', 'Current-stage cases pending', 'Open cases pending (all stages)', 'Projects'],
          ...(d?.departmentBottlenecks.byRole ?? []).map((r) => [r.key, String(r.currentStagePending), String(r.openCasesPending), String(r.projects)]),
          [''],
          ['Named office', 'Role', 'Open cases pending', 'Projects'],
          ...(d?.departmentBottlenecks.byOffice ?? []).map((o) => [o.key, o.role, String(o.openCasesPending), String(o.projects)]),
        ];
      case 'executive':
        if (d) {
          return [
            ['Metric', 'Value'],
            ['Scope', values.scope === 'all' ? 'All projects in your jurisdiction' : values.scope],
            ['Total projects', String(d.kpis.totalProjects)],
            ['High risk projects', String(d.kpis.highRiskProjects)],
            ['Critical risk projects', String(d.kpis.criticalRiskProjects)],
            ['Delayed projects', String(d.kpis.delayedProjects)],
            ['Blocked projects', String(d.kpis.blockedProjects)],
            ['Immediate action required', String(d.kpis.immediateActionRequired)],
            ['Average delay probability (%)', (d.kpis.averageDelayProbability * 100).toFixed(1)],
            ['Mean expected slip (days)', String(d.kpis.averagePredictedDelayDays)],
            ['Open cases', String(d.kpis.openCases)],
            ['Residual backlog in completed stages', String(d.kpis.residualBacklogCases)],
            ['Open interventions', String(d.kpis.openInterventions)],
            ['Affected families', String(d.kpis.affectedFamilies)],
            [''],
            ['Delay driver', 'Share (%)'],
            ...d.delayDrivers.map((x) => [x.key, (x.share * 100).toFixed(1)]),
            [''],
            ['State', 'Projects', 'Mean risk %', 'High/Critical', 'Delayed', 'Blocked'],
            ...d.stateRisk.map((x) => [x.key, String(x.projects), String(x.avgRisk), String(x.highRisk + x.critical), String(x.delayed), String(x.blocked)]),
            ['DATA SOURCE', 'SYNTHETIC DEMO DATA'],
          ];
        }
        return [
          ['Metric', 'Value'],
          ['Projects', String(s.totals.projects)],
          ['Acquisition cases', String(s.totals.cases)],
          ['Open cases', String(s.totals.openCases)],
          ['High-risk cases', String(s.totals.highRiskCases)],
          ['Critical cases', String(s.totals.criticalCases)],
          ['Delayed milestones', String(s.totals.delayedMilestones)],
          ['Milestones due within 90 days', String(s.totals.upcomingMilestones)],
          ['Parcel area (ha)', String(s.totals.parcelAreaHa)],
          ['Affected families', String(s.totals.affectedFamilies)],
          ['Cases with litigation', String(s.totals.legalDisputeCases)],
          ['Mean data quality (%)', String(s.dataQuality.meanScore)],
          [''],
          ['Contributor', 'Share of predicted risk (%)'],
          ...s.contributors.slice(0, 10).map((c) => [c.group, (c.share * 100).toFixed(1)]),
          [''],
          ['State', 'Projects', 'Open cases', 'Predicted risk', 'Observed delay rate (%)'],
          ...[...s.states]
            .sort((a, b) => b.riskScore - a.riskScore)
            .map((st) => [st.state, String(st.projects), String(st.openCases), String(st.riskScore), (st.observedDelayRate * 100).toFixed(1)]),
        ];
      case 'risk':
        return [
          ['Project ID', 'Project', 'Type', 'State', 'District', 'Primary authority', 'Stage', 'Stage status', 'Milestone deadline', 'Days remaining', 'Delay probability %', 'Band', 'Expected slip (days)', 'Open cases', 'Residual backlog', 'Leading contributor'],
          ...(projects.data?.projects ?? []).map((p) => [
            p.id,
            p.name,
            p.type,
            p.state,
            p.district,
            p.primaryAuthority,
            p.currentStage,
            STAGE_STATUS_LABEL[p.stageStatus],
            p.milestoneDeadline,
            String(p.daysRemaining),
            String(Math.round(p.delayProbability * 100)),
            p.riskBand,
            String(p.predictedDelayDays ?? ''),
            String(p.openCases),
            String(p.residualBacklog),
            p.topContributor ?? '',
          ]),
        ];
      case 'queue':
        return [
          ['Intervention', 'Priority', 'Severity', 'Status', 'Project ID', 'Project', 'District', 'Stage', 'Title', 'Trigger', 'Responsible office', 'Acting role', 'Recommended action', 'Raised', 'Due'],
          ...(queue.data?.items ?? []).map((i) => [
            i.id,
            i.priority,
            i.severity,
            i.status,
            i.projectId,
            i.projectName,
            i.district,
            i.stage,
            i.title,
            `${i.trigger.metric} ${i.trigger.operator} ${i.trigger.threshold ?? ''} (value ${i.trigger.value})`,
            i.responsible_department,
            i.assignedRoleLabel,
            i.recommended_action,
            i.created_at.slice(0, 10),
            i.due_date.slice(0, 10),
          ]),
        ];
      case 'stage':
        return [
          ['Stage', 'Milestone', 'Cases', 'Open cases', 'Predicted risk %', 'Band', 'Observed delay rate (%)', 'Avg observed slip (days)', 'Median stage days'],
          ...s.stages.map((st) => [
            st.stage,
            st.milestone,
            String(st.cases),
            String(st.openCases),
            String(st.riskScore),
            st.riskBand,
            (st.observedDelayRate * 100).toFixed(1),
            String(st.avgObservedDelayDays),
            String(st.medianStageDays),
          ]),
        ];
      case 'model': {
        const m = s.model;
        return [
          ['Property', 'Value'],
          ['Deployed model', m.deployed],
          ['Operating threshold', String(m.operatingThreshold)],
          ['Split strategy', m.split.strategy],
          ['Train rows', String(m.split.train.rows)],
          ['Train window', `${m.split.train.from} to ${m.split.train.to}`],
          ['Validation rows', String(m.split.validation.rows)],
          ['Test rows', String(m.split.test.rows)],
          ['Test window', `${m.split.test.from} to ${m.split.test.to}`],
          ['Test ROC-AUC', String(m.test.rocAuc)],
          ['Test PR-AUC', String(m.test.prAuc)],
          ['Test precision', String(m.test.at_threshold.precision)],
          ['Test recall', String(m.test.at_threshold.recall)],
          ['Test F1', String(m.test.at_threshold.f1)],
          ['Test Brier', String(m.test.brier)],
          ['Baseline (logistic) ROC-AUC', String(m.baseline.rocAuc)],
          ['Comparison (random forest) ROC-AUC', m.comparison ? String(m.comparison.rocAuc) : 'not run'],
          ['Surrogate log-odds R2', String(m.surrogateFidelity.logOddsR2)],
          ['Surrogate band agreement', String(m.surrogateFidelity.bandAgreement)],
          [''],
          ['Leakage control'],
          ...m.leakageControls.map((c) => [c]),
        ];
      }
      default:
        return [['Note'], ['This pack is generated server-side from the filtered case registry.']];
    }
  }, [values.report, s, projects.data, queue.data, dash.data, mis.data, values.scope]);

  const generate = () => {
    if (values.report === 'exceptions') {
      // Exceptions come straight from the API so the export is not limited to a page.
      window.location.href = casesCsvUrl({ legal: '1', status: 'open', sort: 'risk', limit: 20000, state: values.scope });
      setGenerated((g) => ({ ...g, exceptions: new Date().toISOString() }));
      return;
    }
    setGenerating(report.id);
    downloadCsv(rows, report.filename, s?.today ?? 'snapshot');
    setGenerating(null);
    setGenerated((g) => ({ ...g, [report.id]: new Date().toISOString() }));
  };

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  if (summary.loading || !s) return <SkeletonCard lines={10} />;

  const preview = rows.slice(0, 9);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <Card className="animate-fade-up">
          <CardHeader
            title="Standard review packs"
            subtitle="Pre-configured exports aligned to the departmental reporting calendar"
            icon={<FileBarChart className="h-4 w-4" />}
            action={<DemoDataBadge className="hidden sm:inline-flex" />}
          />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            {REPORTS.map((r, i) => {
              const isActive = r.id === values.report;
              return (
                <button
                  key={r.id}
                  onClick={() => set({ report: r.id })}
                  className={cn(
                    'group rounded-2xl border p-4 text-left transition-all duration-300 hover:-translate-y-0.5 animate-fade-up',
                    isActive ? 'border-brand/45 bg-brand/[0.06] shadow-card' : 'border-line bg-surface-2 hover:border-line-strong',
                  )}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110',
                        isActive ? 'bg-brand text-white' : 'bg-surface-3 text-ink-2',
                      )}
                    >
                      <r.icon className="h-[18px] w-[18px]" />
                    </span>
                    <Badge className="border-line bg-surface text-ink-3">{r.cadence}</Badge>
                  </div>
                  <p className="mt-3.5 text-[13.5px] font-bold text-ink">{r.title}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{r.description}</p>
                  <p className="mt-2.5 text-[11px] text-ink-3">For: {r.audience}</p>
                  {generated[r.id] && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Exported this session
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
            <CardHeader title="Parameters" subtitle="Applied to the generated export" icon={<CalendarRange className="h-4 w-4" />} />
            <div className="space-y-3 px-5 pb-5">
              <Select
                label="Geographic scope"
                value={values.scope}
                onChange={(v) => set({ scope: v })}
                options={[{ label: 'All states', value: 'all' }, ...(facets.data?.states ?? []).map((st) => ({ label: st, value: st }))]}
              />
              <div className="rounded-xl border border-line bg-surface-2 p-3.5">
                <p className="label-xs">Records in scope</p>
                <div className="mt-2 space-y-1.5">
                  {[
                    ['Projects', projects.data?.total ?? 0],
                    ['Open cases', projects.data?.aggregate.openCases ?? 0],
                    ['Queue cells', queue.data?.total ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-baseline justify-between">
                      <span className="text-[11.5px] text-ink-3">{label}</span>
                      <span className="text-[12px] font-bold text-ink num">{formatNumber(Number(value))}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button className="w-full gap-2" onClick={generate} disabled={generating !== null}>
                {generating === report.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" /> Generate CSV
                  </>
                )}
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print / save as PDF
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-ink-3">
                Exports contain synthetic prototype data only.
              </p>
            </div>
          </Card>

          <Card className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <CardHeader title="Dataset deliverables" subtitle="The full synthetic corpus" icon={<FileSpreadsheet className="h-4 w-4" />} />
            <div className="space-y-2 px-5 pb-5">
              <a href={datasetCsvUrl()} className="block">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> land_acquisition_synthetic_350k.csv
                </Button>
              </a>
              <a href={datasetPdfUrl()} className="block">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <FileText className="h-4 w-4" /> land_acquisition_synthetic_350k.pdf
                </Button>
              </a>
              <p className="text-[11px] leading-relaxed text-ink-3">
                {formatNumber(s.totals.cases)} rows × {s.dataQuality.columns} columns. The PDF carries the field
                dictionary, distributions, data-quality audit, model card and a documented tabular export.
              </p>
            </div>
          </Card>
        </div>
      </section>

      <Card className="animate-fade-up">
        <CardHeader
          title={`${report.title} — preview`}
          subtitle={`First rows of the export · generated ${formatDate(s.today)}`}
          icon={<report.icon className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {report.sections.map((sec) => (
                <Badge key={sec} className="border-line bg-surface-2 text-ink-2">
                  {sec}
                </Badge>
              ))}
            </div>
          }
        />
        <div className="overflow-x-auto px-5 pb-5">
          {values.report === 'exceptions' ? (
            <p className="py-6 text-[12.5px] leading-relaxed text-ink-2">
              This pack streams directly from the case registry rather than being assembled in the browser: cases with
              litigation, in the open set, ranked by predicted risk, up to 20,000 rows. Generating it starts the download
              immediately.
            </p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  {preview[0]?.map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(1).map((row, i) => (
                  <tr key={i} className="border-b border-line/70 last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className={cn('px-3 py-2.5 text-[12.5px]', j === 0 ? 'font-semibold text-ink' : 'text-ink-2')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {values.report !== 'exceptions' && (
          <p className="border-t border-line px-5 py-3 text-[11px] text-ink-3">
            Full export contains {formatNumber(Math.max(0, rows.length - 1))} rows · scope:{' '}
            {values.scope === 'all' ? 'all states' : values.scope}.
          </p>
        )}
      </Card>

      <Card className="animate-fade-up p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="label-xs">Risk legend</p>
          {(['Low', 'Medium', 'High', 'Critical'] as const).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: RISK_HEX[l] }} />
              <span className="text-[11.5px] text-ink-2">{l}</span>
            </span>
          ))}
          <span className="ml-auto text-[11px] text-ink-3">
            {formatCompact(s.totals.openCases)} open cases scored · snapshot {formatDate(s.today)}
          </span>
        </div>
      </Card>
    </div>
  );
}
