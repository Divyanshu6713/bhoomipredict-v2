import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Eye, Flag, Info, Layers, Network } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, MetricStrip, PageSkeleton } from '@/components/ui';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { ProvenanceBadge } from '@/components/brand/Provenance';
import { useApi, useFilters } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchPortfolio } from '@/api/client';
import { RISK_HEX } from '@/lib/risk';
import { STAGE_STATUS_CLASS, STAGE_STATUS_LABEL } from '@/lib/status';
import { formatCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PortfolioNode, PortfolioStats } from '@/data/types';

const LEVEL_TITLE = { sector: 'Sector ministries', state: 'States & Union Territories', district: 'Districts', project: 'Projects' } as const;

/**
 * India → Sector ministry → State / UT → District → Project, over the user's
 * scope. The same model scores feed every level, so a figure here matches the
 * dashboard and project registry for the same filter.
 */
export default function PortfolioHierarchy() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { values, set } = useFilters({ sector: '', state: '', district: '' });
  const data = useApi((signal) => fetchPortfolio({ sector: values.sector || undefined, state: values.state || undefined, district: values.district || undefined }, signal), [values.sector, values.state, values.district]);

  const goTo = (q: Record<string, string>) => set({ sector: q.sector ?? '', state: q.state ?? '', district: q.district ?? '' });

  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  if (!data.data) return <PageSkeleton />;
  const d = data.data;
  const projectsLink = `/projects?${new URLSearchParams({ ...(values.sector && values.sector !== 'all' ? { sector: values.sector } : {}), ...(values.state ? { state: values.state } : {}), ...(values.district ? { district: values.district } : {}) }).toString()}`;

  return (
    <div className="space-y-4">
      <div>
        <nav aria-label="Hierarchy" className="-ml-1.5 flex flex-wrap items-center gap-0.5 text-sm">
          {d.path.map((p, i) => {
            const last = i === d.path.length - 1;
            return (
              <span key={`${p.level}-${i}`} className="flex items-center gap-0.5">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-3" aria-hidden />}
                <button type="button" onClick={() => goTo(p.query)} disabled={last} aria-current={last ? 'page' : undefined} className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-0.5 focus-ring', last ? 'font-medium text-ink' : 'text-ink-3 hover:bg-surface-3 hover:text-ink')}>
                  {i === 0 && <Flag className="h-3.5 w-3.5" aria-hidden />} {p.label}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-ink">{d.path[d.path.length - 1].label === 'India' ? 'National acquisition portfolio' : d.path[d.path.length - 1].label}</h2>
          <p className="text-sm text-ink-3">
            Within your scope: {user?.scopeLabel} · <span className="num">{formatNumber(d.scope.projectsInScope)}</span> projects
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <MetricStrip
          className="rounded-none border-0 shadow-none"
          items={[
            { label: 'Projects', value: formatNumber(d.totals.projects) },
            { label: 'Active', value: formatNumber(d.totals.active) },
            { label: 'Delayed', value: formatNumber(d.totals.delayed), tone: d.totals.delayed ? 'warning' : undefined },
            { label: 'High risk', value: formatNumber(d.totals.highRisk), tone: d.totals.highRisk ? 'orange' : undefined },
            { label: 'Critical', value: formatNumber(d.totals.critical), tone: d.totals.critical ? 'danger' : undefined },
            { label: 'Mean risk', value: d.totals.avgRisk !== null ? `${d.totals.avgRisk}%` : '—' },
          ]}
        />
        {d.totals.projects > 0 && (
          <div className="border-t border-line px-5 py-3">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`Risk mix: ${d.riskMix.map((r) => `${r.band} ${r.projects}`).join(', ')}`}>
              {d.riskMix.map((r) => (r.projects ? <div key={r.band} className="border-r-2 border-surface last:border-r-0" style={{ width: `${(r.projects / d.totals.projects) * 100}%`, background: RISK_HEX[r.band] }} /> : null))}
            </div>
          </div>
        )}
      </div>

      <Card>
        <CardHeader
          title={LEVEL_TITLE[d.level]}
          subtitle={d.note ?? 'Select a row to go one level down'}
          icon={<Layers className="h-4 w-4" />}
          action={
            <span className="flex items-center gap-2">
              <ProvenanceBadge mode="synthetic" compact />
              <ProvenanceBadge mode="model" compact />
              {d.level !== 'sector' && (
                <Link to={projectsLink} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                  Open in registry <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </span>
          }
        />
        {d.children.length === 0 ? (
          <EmptyState icon={<Network className="h-5 w-5" />} title="Nothing at this level in your scope" description="There are no demo projects here. The hierarchy is complete for every State and UT; data appears once projects exist in this scope." />
        ) : d.level === 'project' ? (
          <div className="divide-y divide-line border-t border-line">
            {d.children.map((c) => (
              <button key={c.id} onClick={() => navigate(`/projects/${c.projectId}`)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-3">{c.id}</span>
                    <span className="truncate text-sm font-semibold text-ink">{c.label}</span>
                  </span>
                  <span className="block truncate text-xs text-ink-3">{c.detail}</span>
                  {c.topDriver && <span className="block text-xs text-ink-3">Top driver: {c.topDriver}</span>}
                </span>
                {c.stage && c.stageStatus && (
                  <span className={cn('rounded-md border px-2 py-0.5 text-xs font-semibold', STAGE_STATUS_CLASS[c.stageStatus])}>
                    {c.stage} · {STAGE_STATUS_LABEL[c.stageStatus]}
                  </span>
                )}
                {c.source && c.source !== 'corpus' && <ProvenanceBadge mode="user" compact />}
                {c.riskBand && <RiskPill level={c.riskBand} score={c.riskScore ?? 0} size="sm" />}
                <ChevronRight className="h-4 w-4 text-ink-3" />
              </button>
            ))}
          </div>
        ) : (
          <div className="relative overflow-x-auto border-t border-line">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  {['Name', 'Projects', 'Active', 'Delayed', 'Blocked', 'High', 'Critical', 'Mean risk', 'Open cases', ''].map((h, i) => (
                    <th key={h + i} className={cn('px-4 py-2.5 text-xs font-medium text-ink-3', i === 0 ? 'text-left' : 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.children.map((c) => (
                  <Row key={c.id} node={c} onOpen={() => c.query && c.stats.projects > 0 && goTo(c.query)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {d.oversight.length > 0 && (
        <Card>
          <CardHeader title="Cross-cutting oversight lenses" subtitle="Bodies whose portfolio spans sectors; counts overlap the sector totals above" icon={<Eye className="h-4 w-4" />} />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            {d.oversight.map((o) => (
              <div key={o.id} className="rounded-xl border border-line bg-surface-2 p-3.5">
                <p className="text-sm font-semibold text-ink">{o.detail}</p>
                {o.description && <p className="mt-0.5 text-xs text-ink-3">{o.description}</p>}
                <MiniStats stats={o.stats} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="flex items-start gap-2 px-1 text-xs text-ink-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.engine}
      </p>
    </div>
  );
}

function Row({ node, onOpen }: { node: PortfolioNode; onOpen: () => void }) {
  const s = node.stats;
  const empty = s.projects === 0;
  return (
    <tr
      onClick={onOpen}
      tabIndex={empty ? undefined : 0}
      onKeyDown={(e) => !empty && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className={cn('border-b border-line last:border-0', empty ? 'text-ink-3 opacity-70' : 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none')}
    >
      <td className="px-4 py-2.5">
        <p className="text-sm font-semibold text-ink">{node.label}</p>
        {node.detail && <p className="text-xs text-ink-3">{node.detail}</p>}
        {node.onboarded === false && <Badge className="mt-1 border-line bg-surface-3 text-2xs text-ink-3">Sector registered · no project types onboarded</Badge>}
        {s.topDriver && !empty && <p className="text-xs text-ink-3">Top driver: {s.topDriver.group}</p>}
      </td>
      <Num v={s.projects} strong />
      <Num v={s.active} />
      <Num v={s.delayed} tone={s.delayed ? 'text-amber-700 dark:text-amber-300' : undefined} />
      <Num v={s.blocked} tone={s.blocked ? 'text-red-700 dark:text-red-300' : undefined} />
      <Num v={s.highRisk} tone={s.highRisk ? 'text-orange-700 dark:text-orange-300' : undefined} />
      <Num v={s.critical} tone={s.critical ? 'text-red-700 dark:text-red-300' : undefined} />
      <td className="px-4 py-2.5 text-right text-sm font-semibold text-ink num">{s.avgRisk !== null ? `${s.avgRisk}%` : '—'}</td>
      <td className="px-4 py-2.5 text-right text-sm text-ink-2 num">{formatCompact(s.openCases)}</td>
      <td className="px-3 py-2.5 text-right">{!empty && <ChevronRight className="ml-auto h-4 w-4 text-ink-3" />}</td>
    </tr>
  );
}

function Num({ v, strong, tone }: { v: number; strong?: boolean; tone?: string }) {
  return (
    <td className={cn('px-4 py-2.5 text-right text-sm num', tone ?? (strong ? 'font-medium text-ink' : 'text-ink-2'))}>
      {formatNumber(v)}
    </td>
  );
}

function MiniStats({ stats }: { stats: PortfolioStats }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 num">
      <span>
        <b className="text-ink">{stats.projects}</b> projects
      </span>
      <span>
        <b className="text-ink">{stats.delayed}</b> delayed
      </span>
      <span style={{ color: RISK_HEX.High }}>
        <b>{stats.highRisk}</b> high
      </span>
      <span style={{ color: RISK_HEX.Critical }}>
        <b>{stats.critical}</b> critical
      </span>
      <span>mean risk {stats.avgRisk ?? '—'}%</span>
    </div>
  );
}
