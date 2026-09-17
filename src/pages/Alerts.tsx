import { useEffect, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Card, CardHeader, DemoDataBadge, MetricStrip, Tabs } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { FilterBar, allOption, toOptions } from '@/components/ui/FilterBar';
import { AlertRow } from '@/components/workflow';
import { NotificationPanel } from '@/components/workflow/NotificationPanel';
import { useApi, useFilters } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchAlerts, fetchFacets } from '@/api/client';
import { CATEGORY_LABEL } from '@/lib/status';
import { formatNumber } from '@/lib/format';
import type { AlertItem, AlertList } from '@/data/types';

/** Alert centre over the same rule evaluation as the intervention queue. */
export default function Alerts() {
  const { can, user } = useAuth();
  const { values, set, reset, activeCount } = useFilters({ status: 'UNREAD,ACKNOWLEDGED', severity: 'all', category: 'all', focus: '', page: '1' });
  const facets = useApi((signal) => fetchFacets(signal), []);
  const query = { status: values.status === 'all' ? undefined : values.status, severity: values.severity, category: values.category, focus: values.focus || undefined, page: values.page, pageSize: 25 };
  const result = useApi((signal) => fetchAlerts(query, signal), [JSON.stringify(query)]);
  const [local, setLocal] = useState<AlertList | null>(null);
  useEffect(() => setLocal(null), [result.data]);
  const data = local ?? result.data;

  const replace = (a: AlertItem) => data && setLocal({ ...data, items: data.items.map((x) => (x.id === a.id ? a : x)) });

  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;

  return (
    <div className="space-y-4">
      <MetricStrip
        items={[
          ...(['Critical', 'High', 'Medium'] as const).map((sev) => {
            const row = data?.counts.bySeverity.find((c) => c.key === sev);
            return {
              label: `${sev} alerts`,
              value: formatNumber(row?.count ?? 0),
              hint: `${formatNumber(row?.unread ?? 0)} unread`,
              tone: sev === 'Critical' ? ('danger' as const) : sev === 'High' ? ('orange' as const) : undefined,
              active: values.severity === sev,
              onClick: () => set({ severity: values.severity === sev ? 'all' : sev }),
            };
          }),
          { label: 'Unread in view', value: formatNumber(data?.counts.unread ?? 0), hint: user?.scopeLabel },
        ]}
      />

      <Card>
        <CardHeader
          title="Alert centre"
          subtitle="Critical risk, risk increases, deadline breaches, compensation and legal load, documentation failures, blocked stages, dependency blockages, case backlog and timeline overruns"
          icon={<Bell className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-2">
              <DemoDataBadge className="hidden sm:inline-flex" />
              <Tabs
                tabs={[
                  { id: 'UNREAD,ACKNOWLEDGED', label: 'Active' },
                  { id: 'UNREAD', label: 'Unread' },
                  { id: 'RESOLVED', label: 'Resolved' },
                  { id: 'all', label: 'All' },
                ]}
                active={values.status}
                onChange={(v) => set({ status: v })}
              />
            </div>
          }
        />
        <FilterBar
          selects={[
            { key: 'severity', label: 'Severity', value: values.severity, options: [allOption('Any'), ...toOptions(['Critical', 'High', 'Medium'])] },
            { key: 'category', label: 'Category', value: values.category, options: [allOption('Any'), ...(facets.data?.categories ?? []).map((c) => ({ label: CATEGORY_LABEL[c] ?? c, value: c }))], width: 'w-[190px]' },
          ]}
          onChange={(k, v) => set({ [k]: v })}
          onReset={reset}
          activeCount={activeCount}
          extra={
            <label className="flex items-center gap-1.5 pb-2.5 text-xs text-ink-2">
              <input type="checkbox" checked={values.focus === '1'} onChange={(e) => set({ focus: e.target.checked ? '1' : '' })} className="accent-[rgb(var(--c-brand))]" /> Only my role's focus areas
            </label>
          }
        />
        <div className="divide-y divide-line">
          {(data?.items ?? []).map((a) => (
            <AlertRow key={a.id} alert={a} canUpdate={can('alert.update')} onChanged={replace} />
          ))}
          {result.loading && <p className="px-5 py-10 text-center text-xs text-ink-3">Evaluating rules…</p>}
          {!result.loading && (data?.items.length ?? 0) === 0 && <p className="px-5 py-12 text-center text-sm text-ink-3">No alerts in this view.</p>}
        </div>
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-xs text-ink-3 num">
              Page {data.page} of {data.pages} · {formatNumber(data.total)} alerts
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => set({ page: String(data.page - 1) })}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" disabled={data.page >= data.pages} onClick={() => set({ page: String(data.page + 1) })}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Alert status is stored and audited. Opening an alert's link from an unread alert marks it acknowledged. An alert disappears from the active list when its trigger condition no longer holds.</p>
      </Card>

      <NotificationPanel />
    </div>
  );
}
