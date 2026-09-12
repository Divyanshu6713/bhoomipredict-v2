import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ListChecks, Target, Timer, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, Tabs } from '@/components/ui';
import { FilterBar, allOption, toOptions } from '@/components/ui/FilterBar';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { ContributorChips } from '@/components/explain/Contributors';
import { PRIORITY_CLASS, RISK_CLASS, STAGE_STATUS_CLASS } from '@/lib/risk';
import { formatCompact, formatDate, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import { fetchFacets, fetchQueue } from '@/api/client';

const DEFAULTS = {
  state: 'all',
  district: 'all',
  projectId: '',
  stage: 'all',
  risk: 'all',
  authority: 'all',
  priority: 'all',
  overdue: '',
  queueSort: 'urgency',
  groupBy: 'stage',
  page: '1',
};

export default function Queue() {
  const navigate = useNavigate();
  const { values, set, reset, activeCount } = useFilters(DEFAULTS);
  const [expanded, setExpanded] = useState<string | null>(null);

  const facets = useApi((signal) => fetchFacets(signal), []);

  const query = useMemo(
    () => ({
      state: values.state,
      district: values.district,
      projectId: values.projectId || undefined,
      stage: values.stage,
      risk: values.risk,
      authority: values.authority,
      priority: values.priority,
      overdue: values.overdue || undefined,
      queueSort: values.queueSort,
      groupBy: values.groupBy,
      page: values.page,
      pageSize: 15,
      perProject: 3,
    }),
    [values],
  );

  const result = useApi((signal) => fetchQueue(query, signal), [JSON.stringify(query)]);
  const data = result.data;

  const districtOptions = useMemo(() => {
    const rows = facets.data?.districts ?? [];
    const scoped = values.state === 'all' ? rows : rows.filter((d) => d.state === values.state);
    return [allOption('All districts'), ...scoped.map((d) => ({ label: d.district, value: d.key }))];
  }, [facets.data, values.state]);

  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;

  const agg = data?.aggregate;

  return (
    <div className="space-y-4">
      <Card className="animate-fade-up overflow-hidden">
        <div className="relative bg-navy-900 px-5 py-5 grid-lines sm:px-7">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand/20 blur-[90px]" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <Badge className="border-brand/30 bg-brand/15 text-[#8FB4FF]" dot="bg-brand">
                Prioritisation
              </Badge>
              <h2 className="mt-3 font-display text-[22px] font-extrabold tracking-tight text-white sm:text-[27px]">
                Where human attention is most likely to change the outcome
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
                Every open case is scored, then grouped into project-stage cells. Cells are ranked by predicted risk,
                deadline pressure and how many parcels they cover — so a reviewer works down a list instead of reading
                {' '}{formatCompact(agg?.openCases ?? 0)} case files.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Cells in queue', value: data ? formatNumber(data.total) : '—' },
                { label: 'Critical cells', value: agg ? formatNumber(agg.criticalCells) : '—' },
                { label: 'High cells', value: agg ? formatNumber(agg.highCells) : '—' },
                { label: 'Overdue cases', value: agg ? formatCompact(agg.overdueCases) : '—' },
              ].map((m) => (
                <div key={m.label} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center">
                  <p className="font-display text-[20px] font-extrabold leading-none text-white num">{m.value}</p>
                  <p className="mt-1.5 text-[10px] leading-tight text-white/45">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="animate-fade-up">
        <CardHeader
          title="AI intervention queue"
          subtitle="Ranked project-stage cells, each with its leading contributors and a recommended review"
          icon={<ListChecks className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-2">
              <DemoDataBadge className="hidden lg:inline-flex" />
              <Tabs
                tabs={[
                  { id: 'urgency', label: 'Urgency' },
                  { id: 'risk', label: 'Risk' },
                  { id: 'deadline', label: 'Deadline' },
                  { id: 'cases', label: 'Caseload' },
                ]}
                active={values.queueSort}
                onChange={(v) => set({ queueSort: v })}
              />
            </div>
          }
        />

        <FilterBar
          selects={[
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
              key: 'risk',
              label: 'Case risk band',
              value: values.risk,
              width: 'w-[150px]',
              options: [allOption('Any band'), ...toOptions(facets.data?.riskBands)],
            },
            {
              key: 'authority',
              label: 'Authority',
              value: values.authority,
              width: 'w-[180px]',
              options: [allOption('All authorities'), ...toOptions(facets.data?.authorities)],
            },
            {
              key: 'priority',
              label: 'Project priority',
              value: values.priority,
              width: 'w-[150px]',
              options: [allOption('Any'), ...toOptions(facets.data?.priorities)],
            },
            {
              key: 'overdue',
              label: 'Deadline',
              value: values.overdue,
              width: 'w-[145px]',
              options: [
                { label: 'Any', value: '' },
                { label: 'Past deadline only', value: '1' },
              ],
            },
            {
              key: 'groupBy',
              label: 'Group by',
              value: values.groupBy,
              width: 'w-[150px]',
              options: [
                { label: 'Project + stage', value: 'stage' },
                { label: 'Project', value: 'project' },
              ],
            },
          ]}
          onChange={(key, value) => set({ [key]: value })}
          onReset={reset}
          activeCount={activeCount}
        />

        <div className="divide-y divide-line">
          {(data?.items ?? []).map((item) => {
            const isOpen = expanded === item.id;
            return (
              <div key={item.id} className="animate-fade-in">
                <div className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-extrabold num',
                      item.priorityRank <= 3 ? 'bg-brand text-white' : 'bg-surface-3 text-ink-2',
                    )}
                  >
                    {item.priorityRank}
                  </span>

                  <div className="min-w-[220px] flex-1">
                    <Link
                      to={`/projects/${item.projectId}`}
                      className="block truncate text-[14px] font-bold text-ink hover:text-brand"
                    >
                      {item.projectName}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
                      <span className="font-mono">{item.projectId}</span>
                      <span>·</span>
                      <span>{item.state}</span>
                      <span>·</span>
                      <span>{item.authority}</span>
                      <Badge className={cn('ml-1', PRIORITY_CLASS[item.priority])}>{item.priority}</Badge>
                    </div>
                    <ContributorChips contributors={item.contributors} className="mt-2" max={4} />
                  </div>

                  <div className="min-w-[170px]">
                    <p className="text-[12.5px] font-semibold text-ink">{item.stage}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-3">{item.milestone}</p>
                    {item.stageStatus && (
                      <Badge className={cn('mt-1.5', STAGE_STATUS_CLASS[item.stageStatus])}>
                        {item.daysRemaining !== null && item.daysRemaining < 0
                          ? `${Math.abs(item.daysRemaining)}d overdue`
                          : `due ${item.milestoneDeadline ? formatDate(item.milestoneDeadline) : '—'}`}
                      </Badge>
                    )}
                  </div>

                  <div className="min-w-[130px]">
                    <p className="label-xs">Caseload</p>
                    <p className="mt-1 font-display text-[16px] font-extrabold leading-none text-ink num">
                      {formatNumber(item.openCases)}
                    </p>
                    <p className="mt-1 text-[10.5px] text-ink-3 num">
                      {item.overdueCases > 0 ? `${formatNumber(item.overdueCases)} past deadline` : 'none overdue'}
                    </p>
                    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
                      {(['Low', 'Medium', 'High', 'Critical'] as const).map((band) => {
                        const width = (item.riskMix[band] / Math.max(1, item.openCases)) * 100;
                        return width > 0 ? (
                          <span key={band} className={RISK_CLASS[band].bar} style={{ width: `${width}%` }} />
                        ) : null;
                      })}
                    </div>
                  </div>

                  <div className="min-w-[110px] text-right">
                    <RiskPill level={item.riskBand} score={item.riskScore} />
                    <p className="mt-1.5 text-[10px] text-ink-3">
                      cell mean · {item.rawRiskScore}% raw
                    </p>
                  </div>

                  <div className="min-w-[230px] max-w-sm flex-1">
                    <p className="text-[12.5px] font-semibold leading-snug text-ink">{item.intervention.action}</p>
                    <p className="mt-1 text-[11px] text-ink-3">{item.intervention.owner}</p>
                  </div>

                  <button
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-line bg-surface-2 px-5 py-4 animate-fade-in">
                    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                      <div>
                        <p className="label-xs mb-2">Why this cell is ranked here</p>
                        <p className="text-[12.5px] leading-relaxed text-ink-2">
                          {formatNumber(item.openCases)} open case{item.openCases === 1 ? '' : 's'} in the{' '}
                          <span className="font-semibold text-ink">{item.stage}</span> stage carry a mean predicted
                          milestone risk of <span className="font-semibold text-ink num">{item.riskScore}%</span>
                          {item.overdueCases > 0 && (
                            <>
                              , and <span className="font-semibold text-rose-600 dark:text-rose-400 num">{formatNumber(item.overdueCases)}</span> are
                              already past their milestone date
                            </>
                          )}
                          . The leading contributor across the cell is{' '}
                          <span className="font-semibold text-ink">{item.topContributor}</span>.
                        </p>
                        {item.intervention.detail && (
                          <p className="mt-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
                            {item.intervention.detail}
                          </p>
                        )}
                        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
                          Contributions describe what moved the model's prediction. They are not a finding that these
                          factors caused a delay, and the ranking is advice to a reviewer rather than a decision.
                        </p>
                      </div>
                      <div>
                        <p className="label-xs mb-2">Worst cases in this cell</p>
                        <div className="space-y-1.5">
                          {item.sampleCases.map((c) => (
                            <button
                              key={c.caseId}
                              onClick={() => navigate(`/cases/${c.caseId}`)}
                              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-brand/40"
                            >
                              <span className="font-mono text-[11px] text-ink-3">{c.caseId}</span>
                              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                                {c.village}, {c.district}
                              </span>
                              <span className="shrink-0 text-[11px] text-ink-3 num">{c.areaHa} ha</span>
                              <RiskPill level={c.riskBand} score={c.riskScore} size="sm" />
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link to={`/cases?projectId=${item.projectId}&stage=${encodeURIComponent(item.stage)}`}>
                            <Button size="sm" variant="outline" className="gap-1.5">
                              <Users className="h-3.5 w-3.5" /> All cases in this cell
                            </Button>
                          </Link>
                          <Link to={`/projects/${item.projectId}`}>
                            <Button size="sm" variant="ghost" className="gap-1.5">
                              <Target className="h-3.5 w-3.5" /> Project intelligence
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {result.loading && <div className="px-5 py-10 text-center text-[12px] text-ink-3">Scoring the open book…</div>}
          {!result.loading && (data?.items.length ?? 0) === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-[13px] font-semibold text-ink">No cells match these filters</p>
              <p className="mt-1 text-[12px] text-ink-3">Widen the risk band or clear the district filter.</p>
            </div>
          )}
        </div>

        {data && data.pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <p className="text-[12px] text-ink-3">
              Page <span className="font-semibold text-ink num">{data.page}</span> of{' '}
              <span className="num">{data.pages}</span> · {formatNumber(data.total)} cells ranked in{' '}
              <span className="num">{data.queryMs}</span> ms
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={data.page <= 1}
                onClick={() => set({ page: String(data.page - 1) })}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={data.page >= data.pages}
                onClick={() => set({ page: String(data.page + 1) })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="animate-fade-up p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <Timer className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-ink">How the ranking works</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
              Urgency blends three things: the cell's mean predicted risk, shrunk toward the portfolio mean so a single
              extreme case cannot outrank a stage carrying hundreds of parcels; how close the milestone deadline is or
              how far past it the cell already is; and the log-scaled number of open cases the cell covers. Sorting by
              Risk instead ignores caseload and deadline entirely.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
