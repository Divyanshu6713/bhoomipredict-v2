import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Filter, Gauge } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, Progress, Tabs } from '@/components/ui';
import { ServerTable, type ServerColumn } from '@/components/ui/ServerTable';
import { FilterBar, allOption, toOptions } from '@/components/ui/FilterBar';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { PRIORITY_CLASS, STAGE_STATUS_CLASS } from '@/lib/risk';
import { formatCompact, formatNumber } from '@/lib/format';
import { useApi, useDebounced, useFilters } from '@/hooks';
import { casesCsvUrl, fetchFacets, fetchProjects } from '@/api/client';
import type { ProjectSummary } from '@/data/types';

const DEFAULTS = {
  q: '',
  state: 'all',
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
  const { values, set, reset, activeCount } = useFilters(DEFAULTS);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search, 320);

  const facets = useApi((signal) => fetchFacets(signal), []);

  const query = useMemo(
    () => ({
      q: debounced,
      state: values.state,
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
          <p className="truncate text-[13px] font-semibold text-ink">{p.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-ink-3">
            <span className="font-mono">{p.id}</span>
            <span>·</span>
            <span>{p.authority}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'State / districts',
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-ink">{p.state}</p>
          <p className="truncate text-[11px] text-ink-3">{p.districts.join(', ')}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (p) => (
        <div className="space-y-1">
          <Badge className="border-line bg-surface-2 text-ink-2">{p.type}</Badge>
          <Badge className={cn('block w-fit', PRIORITY_CLASS[p.priority])}>{p.priority}</Badge>
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Current stage',
      render: (p) => (
        <div className="min-w-[150px]">
          <p className="text-[12.5px] font-semibold text-ink">{p.currentStage}</p>
          <Badge className={cn('mt-1', STAGE_STATUS_CLASS[p.milestoneStatus])}>
            {p.milestoneStatus === 'Delayed'
              ? `${Math.abs(p.daysRemaining)}d overdue`
              : `${p.daysRemaining}d to milestone`}
          </Badge>
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
            <span className="num text-[12.5px] font-semibold text-ink">{p.progressPct.toFixed(0)}%</span>
            <span className="text-[10px] text-ink-3">stage {p.currentStageIndex + 1}/9</span>
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
          <span className="num text-[12.5px] font-semibold text-ink">{formatNumber(p.totalParcels)}</span>
          <p className="text-[10.5px] text-ink-3 num">{formatNumber(p.openCases)} open</p>
        </div>
      ),
    },
    {
      key: 'compensation',
      header: 'Compensation',
      align: 'right',
      render: (p) => (
        <div className="min-w-[86px]">
          <span className="num text-[12px] font-semibold text-ink">{p.compensationCompletionPct.toFixed(0)}%</span>
          <p className="truncate text-[10.5px] text-ink-3">{p.compensationStatus}</p>
        </div>
      ),
    },
    {
      key: 'highRisk',
      header: 'High-risk cases',
      sortKey: 'highRisk',
      align: 'right',
      render: (p) => (
        <div>
          <span className="num text-[12.5px] font-bold text-orange-600 dark:text-orange-400">
            {formatNumber(p.highRiskCases)}
          </span>
          <p className="text-[10.5px] text-ink-3 num">{formatNumber(p.criticalCases)} critical</p>
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
          {p.topContributor && <span className="text-[10px] text-ink-3">{p.topContributor}</span>}
        </div>
      ),
    },
  ];

  const selects = [
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
      label: 'Milestone',
      value: values.status,
      width: 'w-[140px]',
      options: [allOption('Any status'), ...toOptions(['In Progress', 'Delayed', 'Completed'])],
    },
  ];

  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;

  const agg = data?.aggregate;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Projects in view', value: data ? formatNumber(data.total) : '—' },
          { label: 'Parcels covered', value: agg ? formatCompact(agg.totalParcels) : '—' },
          { label: 'Open cases', value: agg ? formatCompact(agg.openCases) : '—' },
          {
            label: 'High-risk cases',
            value: agg ? formatCompact(agg.highRiskCases) : '—',
            tone: 'text-orange-600 dark:text-orange-400',
          },
          {
            label: 'Delayed milestones',
            value: agg ? formatNumber(agg.delayedMilestones) : '—',
            tone: 'text-rose-600 dark:text-rose-400',
          },
          { label: 'Mean risk', value: agg ? `${agg.avgRisk}%` : '—' },
        ].map((m, i) => (
          <Card key={m.label} className="p-4 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
            <p className="label-xs leading-tight">{m.label}</p>
            <p className={cn('mt-1.5 font-display text-[21px] font-extrabold leading-none num', m.tone ?? 'text-ink')}>
              {m.value}
            </p>
          </Card>
        ))}
      </section>

      <Card className="animate-fade-up">
        <CardHeader
          title="Acquisition project registry"
          subtitle="Case management with the model's risk for each project's next statutory milestone"
          icon={<Gauge className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-2">
              <DemoDataBadge className="hidden sm:inline-flex" />
              <a
                href={casesCsvUrl({ ...query, pageSize: undefined, page: undefined, limit: 20000 })}
                className="inline-flex"
              >
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Export cases
                </Button>
              </a>
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
            <div className="min-w-0">
              <p className="label-xs mb-1.5 flex items-center gap-1.5">
                <Filter className="h-3 w-3" /> Risk band
              </p>
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

      <p className="px-1 text-[11px] leading-relaxed text-ink-3">
        Next-milestone risk is the model's probability that the project's current stage misses its next milestone by
        more than 30 days. It is a predicted risk, not a determination — and it is one input to a human review, not a
        decision.{' '}
        {data?.projects[0]?.riskBasis === 'open-book-mean' &&
          'Where a stage has no open cases left, the figure falls back to the mean across the project’s open book.'}
      </p>
    </div>
  );
}
