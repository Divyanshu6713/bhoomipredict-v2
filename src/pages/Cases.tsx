import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Filter, Layers, Zap } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, Progress, Tabs } from '@/components/ui';
import { ServerTable, type ServerColumn } from '@/components/ui/ServerTable';
import { FilterBar, allOption, toOptions } from '@/components/ui/FilterBar';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { OUTCOME_CLASS } from '@/lib/risk';
import { formatCompact, formatDate, formatNumber } from '@/lib/format';
import { useApi, useDebounced, useFilters } from '@/hooks';
import { casesCsvUrl, fetchCases, fetchFacets } from '@/api/client';
import type { CaseRow } from '@/data/types';

const DEFAULTS = {
  q: '',
  state: 'all',
  district: 'all',
  projectId: '',
  stage: 'all',
  risk: 'all',
  ownership: 'all',
  compensation: 'all',
  legal: '',
  overdue: '',
  status: 'open',
  sort: 'risk',
  page: '1',
};

export default function Cases() {
  const navigate = useNavigate();
  const { values, set, reset, activeCount } = useFilters(DEFAULTS);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search, 320);

  const facets = useApi((signal) => fetchFacets(signal), []);

  const query = useMemo(
    () => ({
      q: debounced,
      state: values.state,
      district: values.district,
      projectId: values.projectId || undefined,
      stage: values.stage,
      risk: values.risk,
      ownership: values.ownership,
      compensation: values.compensation,
      legal: values.legal || undefined,
      overdue: values.overdue || undefined,
      status: values.status,
      sort: values.sort,
      page: values.page,
      pageSize: 25,
    }),
    [debounced, values],
  );

  const result = useApi((signal) => fetchCases(query, signal), [JSON.stringify(query)]);
  const data = result.data;
  const agg = data?.aggregate;

  const districtOptions = useMemo(() => {
    const rows = facets.data?.districts ?? [];
    const scoped = values.state === 'all' ? rows : rows.filter((d) => d.state === values.state);
    return [allOption('All districts'), ...scoped.map((d) => ({ label: d.district, value: d.key }))];
  }, [facets.data, values.state]);

  const columns: ServerColumn<CaseRow>[] = [
    {
      key: 'id',
      header: 'Case',
      render: (c) => (
        <div className="min-w-0">
          <p className="font-mono text-[11.5px] font-semibold text-ink">{c.caseId}</p>
          <p className="truncate text-[11px] text-ink-3">
            {c.village}, {c.district}
          </p>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      headerClassName: 'w-[210px]',
      className: 'w-[210px] max-w-[210px]',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-ink">{c.projectName}</p>
          <p className="truncate text-[10.5px] text-ink-3">
            {c.projectId} · {c.state}
          </p>
        </div>
      ),
    },
    { key: 'stage', header: 'Stage', render: (c) => <span className="text-[12px]">{c.stage}</span> },
    { key: 'area', header: 'Area', sortKey: 'area', align: 'right', render: (c) => <span className="num">{c.areaHa} ha</span> },
    {
      key: 'own',
      header: 'Ownership',
      render: (c) => <Badge className="border-line bg-surface-2 text-ink-2">{c.ownership}</Badge>,
    },
    {
      key: 'comp',
      header: 'Compensation',
      sortKey: 'compensation',
      align: 'right',
      render: (c) => (
        <div className="min-w-[84px]">
          <div className="flex items-baseline justify-end gap-1.5">
            <span className="num text-[12px] font-semibold text-ink">{c.compensationCompletionPct}%</span>
          </div>
          <Progress
            value={c.compensationCompletionPct}
            className="mt-1 h-1"
            barClassName={c.compensationCompletionPct > 80 ? 'bg-emerald-500' : 'bg-amber-500'}
          />
          <p className="mt-0.5 truncate text-[10px] text-ink-3">{c.compensationStatus}</p>
        </div>
      ),
    },
    {
      key: 'legal',
      header: 'Legal',
      sortKey: 'legal',
      align: 'right',
      render: (c) =>
        c.legalCases > 0 ? (
          <span className="num text-[12px] font-bold text-rose-600 dark:text-rose-400">{c.legalCases}</span>
        ) : (
          <span className="text-[12px] text-ink-3">—</span>
        ),
    },
    {
      key: 'inactive',
      header: 'Inactive',
      sortKey: 'inactivity',
      align: 'right',
      render: (c) => (
        <span className={cn('num text-[12px]', c.inactivityDays > 120 && 'font-semibold text-amber-600 dark:text-amber-400')}>
          {c.inactivityDays}d
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Milestone due',
      sortKey: 'deadline',
      align: 'right',
      render: (c) => (
        <div>
          <span className="num text-[11.5px]">{formatDate(c.milestoneDueDate)}</span>
          <p className={cn('text-[10.5px] num', c.daysToMilestone < 0 ? 'font-semibold text-rose-500' : 'text-ink-3')}>
            {c.daysToMilestone < 0 ? `${Math.abs(c.daysToMilestone)}d overdue` : `${c.daysToMilestone}d left`}
          </p>
        </div>
      ),
    },
    {
      key: 'quality',
      header: 'Quality',
      sortKey: 'quality',
      align: 'right',
      render: (c) => <span className="num text-[12px] text-ink-2">{c.dataQuality}%</span>,
    },
    {
      key: 'risk',
      header: 'Predicted risk',
      sortKey: 'risk',
      align: 'right',
      render: (c) => (
        <div className="flex flex-col items-end gap-1">
          <RiskPill level={c.riskBand} score={c.riskScore} />
          {values.status !== 'open' && (
            <Badge className={cn('text-[9.5px]', OUTCOME_CLASS[c.outcome])}>{c.outcome}</Badge>
          )}
        </div>
      ),
    },
  ];

  const selects = [
    {
      key: 'status',
      label: 'Case set',
      value: values.status,
      width: 'w-[176px]',
      options: [
        { label: 'Open (live portfolio)', value: 'open' },
        { label: 'Closed milestones', value: 'observed' },
        { label: 'All records', value: 'all' },
      ],
    },
    {
      key: 'state',
      label: 'State',
      value: values.state,
      width: 'w-[150px]',
      options: [allOption('All states'), ...toOptions(facets.data?.states)],
    },
    { key: 'district', label: 'District', value: values.district, width: 'w-[160px]', options: districtOptions },
    {
      key: 'stage',
      label: 'Stage',
      value: values.stage,
      width: 'w-[180px]',
      options: [allOption('All stages'), ...toOptions(facets.data?.stages)],
    },
    {
      key: 'ownership',
      label: 'Ownership',
      value: values.ownership,
      width: 'w-[140px]',
      options: [allOption('Any'), ...toOptions(facets.data?.ownership)],
    },
    {
      key: 'compensation',
      label: 'Compensation',
      value: values.compensation,
      width: 'w-[155px]',
      options: [allOption('Any'), ...toOptions(facets.data?.compensationStatuses)],
    },
    {
      key: 'legal',
      label: 'Litigation',
      value: values.legal,
      width: 'w-[135px]',
      options: [
        { label: 'Any', value: '' },
        { label: 'With litigation', value: '1' },
        { label: 'Without', value: '0' },
      ],
    },
    {
      key: 'overdue',
      label: 'Deadline',
      value: values.overdue,
      width: 'w-[140px]',
      options: [
        { label: 'Any', value: '' },
        { label: 'Past deadline', value: '1' },
      ],
    },
  ];

  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Cases in view', value: data ? formatNumber(data.total) : '—' },
          { label: 'Mean predicted risk', value: agg ? `${agg.avgRiskScore}%` : '—' },
          {
            label: 'High + Critical',
            value: agg ? formatCompact(agg.riskMix.High + agg.riskMix.Critical) : '—',
            tone: 'text-orange-600 dark:text-orange-400',
          },
          {
            label: 'Past deadline',
            value: agg ? formatCompact(agg.overdueMilestones) : '—',
            tone: 'text-rose-600 dark:text-rose-400',
          },
          { label: 'Land area', value: agg ? `${formatCompact(agg.totalAreaHa)} ha` : '—' },
          { label: 'Affected families', value: agg ? formatCompact(agg.affectedFamilies) : '—' },
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
          title="Acquisition case registry"
          subtitle={`${data ? formatNumber(data.total) : '—'} matching records out of 350,000 — every filter is applied server-side`}
          icon={<Layers className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-2">
              {data && (
                <Badge className="hidden border-line bg-surface-2 text-ink-3 sm:inline-flex">
                  <Zap className="h-3 w-3" /> {data.queryMs} ms
                </Badge>
              )}
              <DemoDataBadge className="hidden lg:inline-flex" />
              <a href={casesCsvUrl({ ...query, page: undefined, pageSize: undefined, limit: 20000 })}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Export
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
          searchPlaceholder="Case ID, village or tehsil…"
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
                    count: agg?.riskMix[r],
                  })),
                ]}
                active={values.risk}
                onChange={(v) => set({ risk: v })}
              />
            </div>
          }
        />

        <ServerTable
          rows={data?.rows ?? []}
          columns={columns}
          rowKey={(c) => c.caseId}
          onRowClick={(c) => navigate(`/cases/${c.caseId}`)}
          total={data?.total ?? 0}
          page={data?.page ?? 1}
          pages={data?.pages ?? 1}
          pageSize={data?.pageSize ?? 25}
          sort={values.sort}
          onSort={(sortKey) => set({ sort: sortKey })}
          onPage={(p) => set({ page: String(p) })}
          loading={result.loading}
          refreshing={result.refreshing}
          dense
          minWidth={1280}
        />
      </Card>

      {agg && (
        <Card className="animate-fade-up p-5">
          <p className="label-xs mb-3">Stage mix of the current selection</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {agg.stageMix.map((s) => (
              <button
                key={s.stage}
                onClick={() => set({ stage: s.stage })}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  values.stage === s.stage ? 'border-brand/45 bg-brand/[0.06]' : 'border-line bg-surface-2 hover:border-line-strong',
                )}
              >
                <p className="text-[11px] font-semibold leading-tight text-ink-2">{s.stage}</p>
                <p className="mt-1.5 font-display text-[17px] font-extrabold leading-none text-ink num">
                  {formatCompact(s.cases)}
                </p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-3">
            The open set is the live portfolio the model predicts on. Closed milestones carry the outcome that was
            actually observed, which is what the model was evaluated against.
          </p>
        </Card>
      )}
    </div>
  );
}
