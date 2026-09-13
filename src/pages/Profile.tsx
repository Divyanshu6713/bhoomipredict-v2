import { Link } from 'react-router-dom';
import { Bell, Briefcase, Building2, ContactRound, GitBranch, Layers, ListChecks, Network, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, SkeletonCard } from '@/components/ui';
import { ErrorState, RiskPill } from '@/components/ui/primitives';
import { AuditTimeline } from '@/components/workflow/AuditTimeline';
import { AdministrativeChain } from '@/components/hierarchy/AdministrativeChain';
import { ProvenanceBadge } from '@/components/brand/Provenance';
import { useApi } from '@/hooks';
import { fetchProfile } from '@/api/client';
import { CATEGORY_LABEL, STAGE_STATUS_LABEL, humanise } from '@/lib/status';
import { RISK_HEX } from '@/lib/risk';
import { formatCompact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PortfolioStats } from '@/data/types';

const TIER_STATEMENT: Record<string, string> = {
  national: 'Sees every State and Union Territory',
  region: 'Sees the States in its region or zone',
  state: 'Sees one State or Union Territory',
  division: 'Sees the districts of one division',
  district: 'Sees one district',
};

export default function Profile() {
  const profile = useApi((signal) => fetchProfile(signal), []);
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <SkeletonCard lines={8} />;
  const { user, notifications, assignedProjects, assignedInterventions, assignedCases, recentActivity, portfolio, official } = profile.data;
  const pos = user.position;
  const t = portfolio.totals;
  const initials = user.name.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const showStates = pos.tier === 'national' || pos.tier === 'region';

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ identity */}
      <Card className="overflow-hidden">
        <div className="relative bg-navy-900 px-5 py-5 grid-lines sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] font-display text-[18px] font-extrabold text-white">{initials}</span>
              <div className="min-w-0">
                <p className="font-display text-[20px] font-extrabold tracking-tight text-white">{user.name}</p>
                <p className="text-[13px] text-white/70">{user.designation}</p>
                <p className="mt-0.5 text-[12px] text-white/45">{pos.organisation.name}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Badge className="border-brand/30 bg-brand/20 text-[#9DBBFF]">
                    <ShieldCheck className="h-3 w-3" /> {user.roleLabel}
                  </Badge>
                  <Badge className="border-white/15 bg-white/[0.06] text-white/70">{pos.organisation.kindLabel}</Badge>
                  <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-200">{user.configured ? 'Configured demo position' : 'Demo profile'}</Badge>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">Administrative scope</p>
              <p className="mt-1 font-display text-[18px] font-extrabold text-white">{pos.tierLabel}</p>
              <p className="text-[12px] text-white/60">{pos.place}</p>
              <p className="mt-1 text-[11px] text-white/40">{TIER_STATEMENT[pos.tier]}{pos.portfolio.restricted ? ` · ${pos.portfolio.label}` : ''}</p>
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        {/* ------------------------------------------------------ position */}
        <Card>
          <CardHeader title="Administrative position" subtitle={`${pos.template.label} hierarchy · only the levels this organisation uses`} icon={<GitBranch className="h-4 w-4" />} />
          <div className="space-y-4 px-5 pb-5">
            <AdministrativeChain position={pos} />
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-2">
              <p>
                <span className="font-semibold text-ink">Hierarchy: </span>
                {pos.template.levels.map((l) => humanise(l)).join(' → ')}
              </p>
              <p className="mt-0.5">
                <span className="font-semibold text-ink">Portfolio: </span>
                {pos.portfolio.label}
              </p>
              {pos.lineage.length > 1 && (
                <p className="mt-0.5">
                  <span className="font-semibold text-ink">Reporting line: </span>
                  {pos.lineage.map((l) => l.short).join(' › ')}
                </p>
              )}
            </div>
            {pos.organisation.illustrative && pos.organisation.description && <p className="text-[11px] leading-relaxed text-ink-3">{pos.organisation.description}</p>}
          </div>
        </Card>

        {/* ----------------------------------------------------- portfolio */}
        <Card>
          <CardHeader
            title="Portfolio in scope"
            subtitle="Projects inside this position's jurisdiction, scored by the same model"
            icon={<Briefcase className="h-4 w-4" />}
            action={<ProvenanceBadge mode="synthetic" compact />}
          />
          <div className="space-y-4 px-5 pb-5">
            {t.projects === 0 ? (
              <EmptyState icon={<Layers className="h-5 w-5" />} title="No projects in this scope" description="The synthetic corpus has no acquisition projects for this position. The scope is valid; projects added by form or CSV inside it will appear here." />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Stat label="Projects managed" value={formatNumber(t.projects)} to="/projects" />
                  <Stat label="Active" value={formatNumber(t.active)} to="/projects" />
                  <Stat label="Delayed" value={formatNumber(t.delayed)} tone="text-amber-600 dark:text-amber-400" to="/projects?flag=delayed" />
                  <Stat label="Blocked" value={formatNumber(t.blocked)} tone="text-rose-600 dark:text-rose-400" to="/projects?flag=blocked" />
                  <Stat label="High risk" value={formatNumber(t.highRisk)} color={RISK_HEX.High} to="/projects?risk=High" />
                  <Stat label="Critical risk" value={formatNumber(t.critical)} color={RISK_HEX.Critical} to="/projects?risk=Critical" />
                  <Stat label="Open cases" value={formatCompact(t.openCases)} to="/cases" />
                  <Stat label="Mean risk" value={t.avgRisk !== null ? `${t.avgRisk}%` : '—'} to="/risk" />
                </div>
                <div className={cn('grid gap-4', showStates && 'sm:grid-cols-2')}>
                  <Breakdown title="By sector" rows={portfolio.bySector} />
                  {showStates && <Breakdown title="By State / UT" rows={portfolio.byState} />}
                </div>
                {t.topDriver && (
                  <p className="text-[11.5px] text-ink-3">
                    Most frequent top delay driver: <span className="font-semibold text-ink-2">{t.topDriver.group}</span> ({t.topDriver.projects} projects).
                  </p>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Link to="/hierarchy">
                <Button size="sm" className="gap-1.5">
                  <Network className="h-3.5 w-3.5" /> Portfolio drill-down
                </Button>
              </Link>
              <Link to="/queue?mine=1">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> My actions · {assignedInterventions}
                </Button>
              </Link>
              <Link to="/alerts?focus=1">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Bell className="h-3.5 w-3.5" /> My alerts · {notifications.unreadAlerts}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Role & permissions" subtitle={user.roleSummary} icon={<ShieldCheck className="h-4 w-4" />} />
          <div className="space-y-4 px-5 pb-5">
            <div>
              <p className="label-xs mb-1.5">Focus areas (alerts and actions routed to this role)</p>
              <div className="flex flex-wrap gap-1.5">{user.focus.length ? user.focus.map((f) => <Badge key={f}>{CATEGORY_LABEL[f] ?? f}</Badge>) : <span className="text-[12px] text-ink-3">None — read-only</span>}</div>
            </div>
            <div>
              <p className="label-xs mb-1.5">Permissions enforced by the API</p>
              <div className="flex flex-wrap gap-1.5">
                {user.permissions.length ? (
                  user.permissions.map((p) => (
                    <Badge key={p} className="border-brand/20 bg-brand/5 font-mono text-brand">
                      {p}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[12px] text-ink-3">Read-only access</span>
                )}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Official information" subtitle="Identity and office details" icon={<ContactRound className="h-4 w-4" />} />
          <dl className="divide-y divide-line px-5 pb-4 text-[12.5px]">
            {[
              ['Designation', user.designation],
              ['Organisation', pos.organisation.name],
              ...(pos.governmentLevel === 'state' ? [['Government', pos.lineage.find((l) => l.kind === 'state_government')?.name ?? '—']] : [['Government', 'Government of India']]),
              ['Office location', pos.place],
              ['Identity', official.identity],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-4 py-2">
                <dt className="w-32 shrink-0 text-ink-3">{k}</dt>
                <dd className="min-w-0 font-medium text-ink">{v}</dd>
              </div>
            ))}
            <div className="flex gap-4 py-2">
              <dt className="w-32 shrink-0 text-ink-3">Contact</dt>
              <dd className="min-w-0 text-[11.5px] leading-relaxed text-ink-3">{official.directory}</dd>
            </div>
          </dl>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Assigned projects" subtitle="Projects with an intervention assigned to your role" icon={<Building2 className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {assignedProjects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{p.name}</span>
                  <span className="block text-[10.5px] text-ink-3">
                    {p.district}, {p.state} · {p.stage} ({STAGE_STATUS_LABEL[p.stageStatus]})
                  </span>
                </span>
                <RiskPill level={p.riskBand} score={p.riskScore} size="sm" />
              </Link>
            ))}
            {assignedProjects.length === 0 && <p className="px-5 py-6 text-[12px] text-ink-3">No interventions are currently assigned to {user.roleLabel.toLowerCase()} in this scope.</p>}
          </div>
          {assignedCases.length > 0 && (
            <div className="border-t border-line px-5 py-3">
              <p className="label-xs mb-1.5">Cases cited in my interventions</p>
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {assignedCases.map((c) => (
                  <Link key={c} to={`/cases/${c}`} className="font-mono text-[11.5px] text-brand hover:underline">
                    {c}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="My recent activity" subtitle="From the audit trail" />
          <div className="px-5 pb-5">
            <AuditTimeline entries={recentActivity} empty="No recorded activity yet." />
          </div>
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value, tone, color, to }: { label: string; value: string; tone?: string; color?: string; to: string }) {
  return (
    <Link to={to} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-line-strong">
      <p className="label-xs leading-tight">{label}</p>
      <p className={cn('mt-1.5 font-display text-[18px] font-extrabold leading-none num', tone ?? 'text-ink')} style={color ? { color } : undefined}>
        {value}
      </p>
    </Link>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<PortfolioStats & { key: string; label: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.projects));
  return (
    <div>
      <p className="label-xs mb-2">{title}</p>
      <ul className="space-y-1.5">
        {rows.slice(0, 6).map((r) => (
          <li key={r.key} className="text-[11.5px]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-ink-2">{r.label}</span>
              <span className="shrink-0 text-ink-3 num">
                {r.projects} · <span style={{ color: r.critical ? RISK_HEX.Critical : r.highRisk ? RISK_HEX.High : undefined }}>{r.highRisk + r.critical} high/critical</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-brand/70" style={{ width: `${(r.projects / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
