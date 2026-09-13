import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Eye, Flag, Info, Layers, Network } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, SkeletonCard } from '@/components/ui';
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
  if (!data.data) return <SkeletonCard lines={10} />;
  const d = data.data;
  const projectsLink = `/projects?${new URLSearchParams({ ...(values.sector && values.sector !== 'all' ? { sector: values.sector } : {}), ...(values.state ? { state: values.state } : {}), ...(values.district ? { district: values.district } : {}) }).toString()}`;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-navy-900 px-5 py-5 grid-lines sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <nav aria-label="Hierarchy" className="flex flex-wrap items-center gap-1 text-[12.5px]">
                {d.path.map((p, i) => {
                  const last = i === d.path.length - 1;
                  return (
                    <span key={`${p.level}-${i}`} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-white/30" />}
                      <button onClick={() => goTo(p.query)} disabled={last} className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-0.5', last ? 'font-bold text-white' : 'text-white/55 hover:bg-white/10 hover:text-white')}>
                        {i === 0 && <Flag className="h-3.5 w-3.5" />} {p.label}
                      </button>
                    </span>
                  );
                })}
              </nav>
              <h2 className="mt-2 font-display text-[22px] font-extrabold tracking-tight text-white">{d.path[d.path.length - 1].label === 'India' ? 'National acquisition portfolio' : d.path[d.path.length - 1].label}</h2>
              <p className="mt-1 text-[12.5px] text-white/50">
                Within your scope: {user?.scopeLabel} · {formatNumber(d.scope.projectsInScope)} projects
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <HeroStat label="Projects" value={formatNumber(d.totals.projects)} />
              <HeroStat label="Active" value={formatNumber(d.totals.active)} />
              <HeroStat label="Delayed" value={formatNumber(d.totals.delayed)} color="#FBBF24" />
              <HeroStat label="High risk" value={formatNumber(d.totals.highRisk)} color={RISK_HEX.High} />
              <HeroStat label="Critical" value={formatNumber(d.totals.critical)} color={RISK_HEX.Critical} />
              <HeroStat label="Mean risk" value={d.totals.avgRisk !== null ? `${d.totals.avgRisk}%` : '—'} />
            </div>
          </div>
          {d.totals.projects > 0 && (
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10" title="Risk mix">
              {d.riskMix.map((r) => (r.projects ? <div key={r.band} style={{ width: `${(r.projects / d.totals.projects) * 100}%`, background: RISK_HEX[r.band] }} /> : null))}
            </div>
          )}
        </div>
      </Card>

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
                <Link to={projectsLink} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
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
                    <span className="font-mono text-[11px] text-ink-3">{c.id}</span>
                    <span className="truncate text-[13px] font-semibold text-ink">{c.label}</span>
                  </span>
                  <span className="block truncate text-[11px] text-ink-3">{c.detail}</span>
                  {c.topDriver && <span className="block text-[11px] text-ink-3">Top driver: {c.topDriver}</span>}
                </span>
                {c.stage && c.stageStatus && (
                  <span className={cn('rounded-md border px-2 py-0.5 text-[10.5px] font-semibold', STAGE_STATUS_CLASS[c.stageStatus])}>
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
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  {['Name', 'Projects', 'Active', 'Delayed', 'Blocked', 'High', 'Critical', 'Mean risk', 'Open cases', ''].map((h, i) => (
                    <th key={h + i} className={cn('px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-3', i === 0 ? 'text-left' : 'text-right')}>
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
                <p className="text-[13px] font-semibold text-ink">{o.detail}</p>
                {o.description && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{o.description}</p>}
                <MiniStats stats={o.stats} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-ink-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.engine}
      </p>
    </div>
  );
}

function HeroStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
      <p className="font-display text-[17px] font-extrabold leading-none text-white num" style={color ? { color } : undefined}>
        {value}
      </p>
      <p className="mt-1 text-[10px] text-white/45">{label}</p>
    </div>
  );
}

function Row({ node, onOpen }: { node: PortfolioNode; onOpen: () => void }) {
  const s = node.stats;
  const empty = s.projects === 0;
  return (
    <tr onClick={onOpen} className={cn('border-b border-line/70 last:border-0', empty ? 'opacity-60' : 'cursor-pointer hover:bg-surface-2')}>
      <td className="px-4 py-2.5">
        <p className="text-[13px] font-semibold text-ink">{node.label}</p>
        {node.detail && <p className="text-[11px] text-ink-3">{node.detail}</p>}
        {node.onboarded === false && <Badge className="mt-1 border-line bg-surface-3 text-[10px] text-ink-3">Sector registered · no project types onboarded</Badge>}
        {s.topDriver && !empty && <p className="text-[10.5px] text-ink-3">Top driver: {s.topDriver.group}</p>}
      </td>
      <Num v={s.projects} strong />
      <Num v={s.active} />
      <Num v={s.delayed} color={s.delayed ? '#D97706' : undefined} />
      <Num v={s.blocked} color={s.blocked ? RISK_HEX.Critical : undefined} />
      <Num v={s.highRisk} color={s.highRisk ? RISK_HEX.High : undefined} />
      <Num v={s.critical} color={s.critical ? RISK_HEX.Critical : undefined} />
      <td className="px-4 py-2.5 text-right text-[12.5px] font-semibold text-ink num">{s.avgRisk !== null ? `${s.avgRisk}%` : '—'}</td>
      <td className="px-4 py-2.5 text-right text-[12.5px] text-ink-2 num">{formatCompact(s.openCases)}</td>
      <td className="px-3 py-2.5 text-right">{!empty && <ChevronRight className="ml-auto h-4 w-4 text-ink-3" />}</td>
    </tr>
  );
}

function Num({ v, strong, color }: { v: number; strong?: boolean; color?: string }) {
  return (
    <td className={cn('px-4 py-2.5 text-right text-[12.5px] num', strong ? 'font-bold text-ink' : 'text-ink-2')} style={color ? { color } : undefined}>
      {formatNumber(v)}
    </td>
  );
}

function MiniStats({ stats }: { stats: PortfolioStats }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-2 num">
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
