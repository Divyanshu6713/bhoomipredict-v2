import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import { Badge, Button, Card, CardHeader, DemoDataBadge, Tabs } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { FilterBar, allOption, toOptions } from '@/components/ui/FilterBar';
import { InterventionCard } from '@/components/workflow';
import { useApi, useDebounced, useFilters } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchFacets, fetchInterventions } from '@/api/client';
import { CATEGORY_LABEL, INTERVENTION_STATUS_LABEL, SEVERITY_CLASS } from '@/lib/status';
import { formatNumber } from '@/lib/format';
import type { InterventionItem, InterventionList } from '@/data/types';

/**
 * Intervention queue.
 *
 * Each row exists because a rule or model trigger holds on a project right now
 * (server/domain/rules.mjs). The queue owns only the workflow: acknowledge,
 * start, resolve or dismiss, with a note, under the acting role.
 */
export default function Queue() {
  const { user, can } = useAuth();
  const { values, set, reset, activeCount } = useFilters({
    view: 'open',
    mine: '',
    focus: '',
    severity: 'all',
    category: 'all',
    state: 'all',
    role: 'all',
    sort: 'priority',
    q: '',
    page: '1',
  });
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const facets = useApi((signal) => fetchFacets(signal), []);
  const query = {
    status: values.view === 'open' ? undefined : values.view === 'closed' ? 'RESOLVED,DISMISSED' : values.view,
    includeClosed: values.view === 'closed' ? '1' : undefined,
    mine: values.mine || undefined,
    focus: values.focus || undefined,
    severity: values.severity,
    category: values.category,
    state: values.state,
    role: values.role,
    sort: values.sort,
    q: values.q || undefined,
    page: values.page,
    pageSize: 20,
  };
  const result = useApi((signal) => fetchInterventions(query, signal), [JSON.stringify(query)]);
  const [local, setLocal] = useState<InterventionList | null>(null);
  useEffect(() => setLocal(null), [result.data]);
  const data = local ?? result.data;

  const replace = (next: InterventionItem) => {
    if (!data) return;
    setLocal({ ...data, items: data.items.map((i) => (i.id === next.id ? { ...next } : i)) });
  };

  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;
  const counts = data?.counts;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(['Critical', 'High', 'Medium'] as const).map((sev) => (
          <button key={sev} onClick={() => set({ severity: values.severity === sev ? 'all' : sev })} className="card p-4 text-left transition-colors hover:border-line-strong">
            <div className="flex items-center justify-between">
              <p className="label-xs">{sev}</p>
              <Badge className={SEVERITY_CLASS[sev]}>{sev === 'Critical' ? 'P1' : sev === 'High' ? 'P2' : 'P3'}</Badge>
            </div>
            <p className="mt-2 font-display text-[24px] font-extrabold leading-none text-ink num">{formatNumber(counts?.bySeverity.find((c) => c.key === sev)?.count ?? 0)}</p>
          </button>
        ))}
        <button onClick={() => set({ mine: values.mine ? '' : '1' })} className="card p-4 text-left transition-colors hover:border-line-strong">
          <p className="label-xs">Assigned to my role</p>
          <p className="mt-2 font-display text-[24px] font-extrabold leading-none text-ink num">{formatNumber(counts?.mine ?? 0)}</p>
          <p className="mt-1 text-[10.5px] text-ink-3">{user?.roleLabel}</p>
        </button>
        <div className="card p-4">
          <p className="label-xs">Past due date</p>
          <p className="mt-2 font-display text-[24px] font-extrabold leading-none text-rose-600 dark:text-rose-400 num">{formatNumber(counts?.overdue ?? 0)}</p>
        </div>
      </section>

      <Card className="animate-fade-up">
        <CardHeader
          title="Intervention queue"
          subtitle={`${formatNumber(data?.total ?? 0)} interventions in ${user?.scopeLabel ?? 'your jurisdiction'} — generated from live rule and model triggers`}
          icon={<ListChecks className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DemoDataBadge className="hidden sm:inline-flex" />
              <Tabs
                tabs={[
                  { id: 'open', label: 'Active' },
                  { id: 'OPEN', label: 'Open' },
                  { id: 'ACKNOWLEDGED,IN_PROGRESS', label: 'In hand' },
                  { id: 'closed', label: 'Closed' },
                ]}
                active={values.view}
                onChange={(v) => set({ view: v })}
              />
            </div>
          }
        />
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Project, department or reason…"
          selects={[
            { key: 'severity', label: 'Severity', value: values.severity, options: [allOption('Any'), ...toOptions(['Critical', 'High', 'Medium'])] },
            { key: 'category', label: 'Category', value: values.category, options: [allOption('Any'), ...(facets.data?.categories ?? []).map((c) => ({ label: CATEGORY_LABEL[c] ?? c, value: c }))], width: 'w-[180px]' },
            { key: 'state', label: 'State', value: values.state, options: [allOption('Any'), ...toOptions(facets.data?.states)] },
            { key: 'role', label: 'Acting role', value: values.role, options: [allOption('Any'), ...(facets.data?.roles ?? []).map((r) => ({ label: r.label, value: r.id }))], width: 'w-[200px]' },
            { key: 'sort', label: 'Sort', value: values.sort, options: [{ label: 'Priority', value: 'priority' }, { label: 'Due date', value: 'due' }, { label: 'Risk', value: 'risk' }] },
          ]}
          onChange={(k, v) => set({ [k]: v })}
          onReset={() => {
            setSearch('');
            reset();
          }}
          activeCount={activeCount}
          extra={
            <div className="flex items-end gap-2 pb-0.5">
              <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <input type="checkbox" checked={values.mine === '1'} onChange={(e) => set({ mine: e.target.checked ? '1' : '' })} className="accent-[rgb(var(--c-brand))]" /> Mine
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <input type="checkbox" checked={values.focus === '1'} onChange={(e) => set({ focus: e.target.checked ? '1' : '' })} className="accent-[rgb(var(--c-brand))]" /> My focus areas
              </label>
            </div>
          }
        />

        {counts && counts.byDepartment.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-2.5">
            <span className="label-xs mr-1">By responsible role</span>
            {counts.byDepartment.slice(0, 8).map((d) => (
              <Badge key={d.key} className="border-line bg-surface-2 text-ink-2">
                {d.key} <span className="num text-ink-3">{d.count}</span>
              </Badge>
            ))}
          </div>
        )}

        <div className="divide-y divide-line">
          {(data?.items ?? []).map((item) => (
            <InterventionCard key={item.id} item={item} canUpdate={can('intervention.update')} onChanged={replace} />
          ))}
          {result.loading && <p className="px-5 py-10 text-center text-[12px] text-ink-3">Evaluating rules…</p>}
          {!result.loading && (data?.items.length ?? 0) === 0 && <p className="px-5 py-12 text-center text-[12.5px] text-ink-3">No interventions match. Every intervention is tied to a live trigger, so an empty queue means none holds for this filter.</p>}
        </div>

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-[11.5px] text-ink-3 num">
              Page {data.page} of {data.pages}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => set({ page: String(data.page - 1) })}>
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <Button size="sm" variant="outline" disabled={data.page >= data.pages} onClick={() => set({ page: String(data.page + 1) })}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 text-[12px] leading-relaxed text-ink-2">
        <p className="font-semibold text-ink">How an intervention gets here</p>
        <p className="mt-1">
          The rules engine evaluates every project in your jurisdiction against its lifecycle, dependency network and progress measures — compensation backlog, legal load, documentation, approval delay, R&R, stakeholder responsiveness, blocked stages and deadline breaches. Rules
          of Medium severity or higher create an intervention owned by the office in that project's network. Status changes ({Object.values(INTERVENTION_STATUS_LABEL).join(' → ')}) are audited. Thresholds are listed in the{' '}
          <Link to="/registry" className="font-semibold text-brand hover:underline">
            registry
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
