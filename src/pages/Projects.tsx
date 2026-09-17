import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, FilePlus2, FileUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, MetricStrip, Progress, Tabs } from '@/components/ui';
import { ServerTable, type ServerColumn } from '@/components/ui/ServerTable';
import { FilterBar, allOption, toOptions } from '@/components/ui/FilterBar';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { PRIORITY_CLASS } from '@/lib/risk';
import { STAGE_STATUS_CLASS, STAGE_STATUS_LABEL, RISK_BASIS_LABEL } from '@/lib/status';
import { useAuth } from '@/auth/AuthContext';
import { formatCompact, formatNumber } from '@/lib/format';
import { useApi, useDebounced, useFilters } from '@/hooks';
import { ProvenanceBadge } from '@/components/brand/Provenance';
import { casesCsvUrl, fetchFacets, fetchProjects, projectsCsvUrl } from '@/api/client';
import type { ProjectSummary } from '@/data/types';

const DEFAULTS = {
  q: '',
  sector: 'all',
  state: 'all',
  district: 'all',
  flag: 'all',
  projectType: 'all',
  authority: 'all',
  priority: 'all',
  stage: 'all',
  risk: 'all',
  status: 'all',
  sort: 'risk',
  page: '1',
};

export default function Projects() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { values, set, reset, activeCount } = useFilters(DEFAULTS);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search, 320);

  const facets = useApi((signal) => fetchFacets(signal), []);

  const query = useMemo(
    () => ({
      q: debounced,
      sector: values.sector,
      state: values.state,
      district: values.district,
      flag: values.flag,
      projectType: values.projectType,
      authority: values.authority,
      priority: values.priority,
      stage: values.stage,
      risk: values.risk,
      status: values.status,
      sort: values.sort,
      page: values.page,
      pageSize: 20,
    }),
    [debounced, values],
  );

  const result = useApi((signal) => fetchProjects(query, signal), [JSON.stringify(query)]);
  const data = result.data;

  const columns: ServerColumn<ProjectSummary>[] = [
    {
      key: 'id',
      header: 'Project',
      sortKey: 'name',
      headerClassName: 'w-[260px]',
      className: 'w-[260px] max-w-[260px]',
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-3">
            <span className="font-mono">{p.id}</span>
            <span>·</span>
            <span className="truncate">{p.authority}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'State / districts',
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{p.state}</p>
          <p className="truncate text-xs text-ink-3">{p.districts.join(', ')}</p>
          {p.source !== 'corpus' && <ProvenanceBadge mode="user" compact className="mt-1" />}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      hideOnMobile: true,
      render: (p) => (
        <div className="min-w-0">
          <p className="text-sm text-ink">{p.type}</p>
          <p className="text-xs text-ink-3">{p.subtype}</p>
          {p.priority !== 'Routine' && <Badge className={cn('mt-1', PRIORITY_CLASS[p.priority])}>{p.priority}</Badge>}
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Current stage',
      render: (p) => (
        <div className="min-w-[150px]">
          <p className="text-sm font-semibold text-ink">{p.currentStage}</p>
          <Badge className={cn('mt-1', STAGE_STATUS_CLASS[p.stageStatus])}>
            {STAGE_STATUS_LABEL[p.stageStatus]} · {p.daysRemaining < 0 ? `${Math.abs(p.daysRemaining)}d overdue` : `${p.daysRemaining}d left`}
          </Badge>
          {p.residualBacklog > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 num">{formatNumber(p.residualBacklog)} residual cases in completed stages</p>}
        </div>
      ),
    },
    {
      key: 'progress',
      header: 'Lifecycle progress',
      sortKey: 'progress',
      align: 'right',
      render: (p) => (
        <div className="min-w-[92px]">
          <div className="flex items-baseline justify-end gap-1.5">
            <span className="num text-sm font-semibold text-ink">{p.progressPct.toFixed(0)}%</span>
            <span className="text-2xs text-ink-3">stage {p.currentStageIndex + 1}/9</span>
          </div>
          <Progress
            value={p.progressPct}
            className="mt-1.5 h-1"
            barClassName={p.progressPct > 70 ? 'bg-emerald-500' : p.progressPct > 35 ? 'bg-brand' : 'bg-amber-500'}
          />
        </div>
      ),
    },
    {
      key: 'parcels',
      header: 'Parcels',
      sortKey: 'parcels',
      align: 'right',
      render: (p) => (
        <div>
          <span className="num text-sm font-semibold text-ink">{formatNumber(p.totalParcels)}</span>
          <p className="text-xs text-ink-3 num">{p.source === 'corpus' ? `${formatNumber(p.openCases)} open` : 'no case records'}</p>
        </div>
      ),
    },
    {
      key: 'compensation',
      header: 'Compensation',
      hideOnMobile: true,
      align: 'right',
      render: (p) => (
        <div className="min-w-[86px]">
          <span className="num text-xs font-semibold text-ink">{p.compensationCompletionPct.toFixed(0)}%</span>
          <p className="truncate text-xs text-ink-3">{p.compensationStatus}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Open actions',
      sortKey: 'delay',
      align: 'right',
      render: (p) => (
        <div>
          <span className={cn('num text-sm font-bold', p.actionCount ? 'text-orange-700 dark:text-orange-300' : 'text-ink-3')}>{p.actionCount}</span>
          <p className="text-xs text-ink-3 num">{p.predictedDelayDays !== null ? `~${p.predictedDelayDays}d slip` : ''}</p>
        </div>
      ),
    },
    {
      key: 'risk',
      header: 'Next-milestone risk',
      sortKey: 'risk',
      align: 'right',
      render: (p) => (
        <div className="flex flex-col items-end gap-1">
          <RiskPill level={p.riskBand} score={p.riskScore} />
          {p.topContributor && <span className="text-2xs text-ink-3">{p.topContributor}</span>}
        </div>
      ),
    },
  ];

  const selects = [
    {
      key: 'sector',
      label: 'Sector',
      value: values.sector,
      width: 'w-[170px]',
      options: [allOption('All sectors'), ...(facets.data?.sectors ?? []).filter((s) => s.projectTypes.length).map((s) => ({ label: s.label, value: s.id }))],
    },
    {
      key: 'state',
      label: 'State',
      value: values.state,
      width: 'w-[160px]',
      options: [allOption('All states'), ...toOptions(facets.data?.states)],
    },
    {
      key: 'projectType',
      label: 'Project type',
      value: values.projectType,
      width: 'w-[170px]',
      options: [allOption('All types'), ...toOptions(facets.data?.projectTypes)],
    },
    {
      key: 'district',
      label: 'District',
      value: values.district,
      width: 'w-[160px]',
      options: [allOption('All districts'), ...toOptions(Array.from(new Set((facets.data?.districts ?? []).filter((d) => values.state === 'all' || d.state === values.state).map((d) => d.district))).sort())],
    },
    {
      key: 'stage',
      label: 'Current stage',
      value: values.stage,
      width: 'w-[185px]',
      options: [allOption('All stages'), ...toOptions(facets.data?.stages)],
    },
    {
      key: 'authority',
      label: 'Authority',
      value: values.authority,
      width: 'w-[185px]',
      options: [allOption('All authorities'), ...toOptions(facets.data?.authorities)],
    },
    {
      key: 'status',
      label: 'Stage status',
      value: values.status,
      width: 'w-[150px]',
      options: [allOption('Any status'), ...(['IN_PROGRESS', 'DELAYED', 'BLOCKED'] as const).map((st) => ({ label: STAGE_STATUS_LABEL[st], value: st }))],
    },
    {
      key: 'flag',
      label: 'Attention',
      value: values.flag,
      width: 'w-[170px]',
      options: [allOption('Any'), { label: 'Delayed or blocked', value: 'delayed' }, { label: 'Blocked', value: 'blocked' }, { label: 'High/Critical action open', value: 'action' }],
    },
  ];

  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;

  const agg = data?.aggregate;

  return (
    <div className="space-y-6">
      <MetricStrip
        items={[
          { label: 'Projects in view', value: data ? formatNumber(data.total) : '—' },
          { label: 'Parcels covered', value: agg ? formatCompact(agg.totalParcels) : '—' },
          { label: 'Open cases', value: agg ? formatCompact(agg.openCases) : '—' },
          { label: 'High-risk cases', value: agg ? formatCompact(agg.highRiskCases) : '—', tone: 'orange' },
          { label: 'Delayed · blocked', value: agg ? `${formatNumber(agg.delayedProjects)} · ${formatNumber(agg.blockedProjects)}` : '—', tone: 'danger' },
          { label: 'Residual backlog', value: agg ? formatCompact(agg.residualBacklog) : '—', hint: 'cases in completed stages' },
        ]}
      />

      <Card>
        <CardHeader
          title="Project registry"
          subtitle="Each project with the model's risk for its next statutory milestone"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <a href={projectsCsvUrl({ ...query, pageSize: undefined, page: undefined })} className="inline-flex">
                <Button size="sm" variant="ghost" tabIndex={-1}>
                  <Download className="h-3.5 w-3.5" /> Projects CSV
                </Button>
              </a>
              <a href={casesCsvUrl({ state: values.state, projectType: values.projectType, stage: values.stage, risk: values.risk, limit: 20000 })} className="inline-flex">
                <Button size="sm" variant="ghost" tabIndex={-1}>
                  <Download className="h-3.5 w-3.5" /> Cases CSV
                </Button>
              </a>
              {can('data.upload') && (
                <Link to="/admin">
                  <Button size="sm" variant="secondary" tabIndex={-1}>
                    <FileUp className="h-3.5 w-3.5" /> Upload CSV
                  </Button>
                </Link>
              )}
              {can('project.create') && (
                <Link to="/projects/new">
                  <Button size="sm" tabIndex={-1}>
                    <FilePlus2 className="h-3.5 w-3.5" /> New project
                  </Button>
                </Link>
              )}
            </div>
          }
        />

        <FilterBar
          search={search}
          onSearch={(v) => {
            setSearch(v);
            set({ q: v });
          }}
          searchPlaceholder="Project name, ID, authority or district…"
          selects={selects}
          onChange={(key, value) => set({ [key]: value })}
          onReset={() => {
            setSearch('');
            reset();
          }}
          activeCount={activeCount}
          extra={
            <div className="min-w-0 max-w-full">
              <p className="mb-1.5 text-xs font-medium text-ink-2">Risk band</p>
              <Tabs
                tabs={[
                  { id: 'all', label: 'All' },
                  ...(['Low', 'Medium', 'High', 'Critical'] as const).map((r) => ({
                    id: r,
                    label: r,
                    count: data?.aggregate.riskMix[r],
                  })),
                ]}
                active={values.risk}
                onChange={(v) => set({ risk: v })}
              />
            </div>
          }
        />

        <ServerTable
          rows={data?.projects ?? []}
          columns={columns}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/projects/${p.id}`)}
          total={data?.total ?? 0}
          page={data?.page ?? 1}
          pages={data?.pages ?? 1}
          pageSize={data?.pageSize ?? 20}
          sort={values.sort}
          onSort={(sortKey) => set({ sort: sortKey })}
          onPage={(p) => set({ page: String(p) })}
          loading={result.loading}
          refreshing={result.refreshing}
          minWidth={1180}
          footNote={<span>sorted and paged server-side</span>}
        />
      </Card>

      <p className="max-w-4xl px-1 text-xs text-ink-3">
        Next-milestone risk is the model's probability that the project's current stage misses its next milestone by
        more than 30 days. It is a predicted risk, not a determination — and it is one input to a human review, not a
        decision.{' '}
        Risk basis: {RISK_BASIS_LABEL.ensemble.toLowerCase()}; edited projects are moved by the model’s estimate of the edit and added projects are scored by the ensemble on their project record.
      </p>
    </div>
  );
}
