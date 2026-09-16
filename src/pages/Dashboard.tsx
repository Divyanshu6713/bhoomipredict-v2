import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, Building2, Clock, Gauge, Gavel, Layers, Network, Percent, ShieldAlert, TrendingUp, TriangleAlert, Users, BadgeIndianRupee, CalendarClock } from 'lucide-react';
import { Card, CardHeader, Select, SkeletonCard } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import { ErrorState, KeyValue, PrototypeNotice, RiskPill } from '@/components/ui/primitives';
import { ChartTooltip } from '@/components/charts';
import { CHART_COLORS, RISK_HEX, groupColor, riskFromScore } from '@/lib/risk';
import { STAGE_STATUS_CLASS, STAGE_STATUS_LABEL } from '@/lib/status';
import { formatCompact, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchDashboard, fetchFacets, fetchTrends } from '@/api/client';
import { Badge } from '@/components/ui';

const tick = { fill: 'rgb(var(--c-ink-3))', fontSize: 11 };

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { values, set } = useFilters({ sector: 'all', state: 'all', district: 'all', projectType: 'all' });
  const facets = useApi((signal) => fetchFacets(signal), []);
  const summary = useApi((signal) => fetchDashboard({ sector: values.sector, state: values.state, district: values.district, projectType: values.projectType }, signal), [values.sector, values.state, values.district, values.projectType]);
  const trend = useApi((signal) => fetchTrends({ level: values.state !== 'all' ? 'district' : 'state', state: values.state, district: values.district, months: 15, top: 1 }, signal), [values.state, values.district]);
  const s = summary.data;

  const go = (params: Record<string, string>) => navigate(`/projects?${new URLSearchParams({ ...(values.sector !== 'all' ? { sector: values.sector } : {}), ...(values.state !== 'all' ? { state: values.state } : {}), ...(values.projectType !== 'all' ? { projectType: values.projectType } : {}), ...params }).toString()}`);

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  if (!s) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
    );
  }
  const k = s.kpis;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label-xs">Administrative scope</p>
          <p className="text-[13px] font-semibold text-ink">
            {user?.position.organisation.name} · {user?.position.tierLabel}
          </p>
          <p className="text-[12px] text-ink-3">
            {user?.scopeLabel} · {formatNumber(s.scope.projects)} projects in view ·{' '}
            <Link to={`/hierarchy${values.sector !== 'all' ? `?sector=${values.sector}` : ''}`} className="font-semibold text-brand hover:underline">
              Drill down India → sector → state → district
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select className="w-[190px]" label="Sector" value={values.sector} onChange={(v) => set({ sector: v, projectType: 'all' })} options={[{ label: 'All sectors', value: 'all' }, ...(facets.data?.sectors ?? []).filter((x) => x.projectTypes.length).map((x) => ({ label: x.label, value: x.id }))]} />
          <Select className="w-[170px]" label="State" value={values.state} onChange={(v) => set({ state: v, district: 'all' })} options={[{ label: 'All in scope', value: 'all' }, ...(facets.data?.states ?? []).map((x) => ({ label: x, value: x }))]} />
          <Select className="w-[170px]" label="District" value={values.district} onChange={(v) => set({ district: v })} options={[{ label: values.state === 'all' ? 'Choose a state' : 'All districts', value: 'all' }, ...(facets.data?.districts ?? []).filter((d) => d.state === values.state).map((d) => ({ label: d.district, value: d.district }))]} />
          <Select className="w-[190px]" label="Project type" value={values.projectType} onChange={(v) => set({ projectType: v })} options={[{ label: 'All types', value: 'all' }, ...(facets.data?.projectTypes ?? []).filter((x) => values.sector === 'all' || facets.data?.sectors.find((sec) => sec.id === values.sector)?.projectTypes.includes(x)).map((x) => ({ label: x, value: x }))]} />
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          { label: 'Total projects', value: k.totalProjects, icon: Building2, caption: `${formatCompact(k.openCases)} open cases`, accent: '#3B72F0', to: {} },
          { label: 'High risk projects', value: k.highRiskProjects, icon: ShieldAlert, caption: '45–60% of open parcels expected to slip', accent: RISK_HEX.High, to: { risk: 'High' } },
          { label: 'Critical risk projects', value: k.criticalRiskProjects, icon: TriangleAlert, caption: '≥ 60% of open parcels expected to slip', accent: RISK_HEX.Critical, to: { risk: 'Critical' } },
          { label: 'Delayed projects', value: k.delayedProjects, icon: Clock, caption: `${k.blockedProjects} of them blocked by a dependency`, accent: '#F59E0B', to: { flag: 'delayed' } },
          { label: 'Immediate action required', value: k.immediateActionRequired, icon: AlertOctagon, caption: 'with an open Critical (P1) intervention', accent: '#BE123C', to: { flag: 'action' } },
          { label: 'Average delay probability', value: Math.round(k.averageDelayProbability * 100), unit: '%', icon: Percent, caption: `${k.severeOverrunLikely ?? 0} projects forecast > 6 months late · slip ${k.averagePredictedDelayDays}d`, accent: '#7C6CF5', to: { sort: 'risk' } },
        ].map((c, i) => (
          <button key={c.label} onClick={() => go(c.to as Record<string, string>)} className="text-left">
            <StatCard index={i} label={c.label} value={c.value} unit={c.unit} icon={c.icon} caption={c.caption} accent={c.accent} />
          </button>
        ))}
      </section>

      <PrototypeNotice compact />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Risk distribution" subtitle="Projects by risk category — click a slice to list them" icon={<Gauge className="h-4 w-4" />} />
          <div className="h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={s.riskDistribution} dataKey="projects" nameKey="key" innerRadius={58} outerRadius={92} paddingAngle={2} onClick={(d: { key?: string }) => d?.key && go({ risk: d.key })} className="cursor-pointer">
                  {s.riskDistribution.map((r) => (
                    <Cell key={r.key} fill={RISK_HEX[r.key]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-4 gap-2 px-5 pb-5">
            {s.riskDistribution.map((r) => (
              <div key={r.key} className="rounded-lg border border-line bg-surface-2 p-2 text-center">
                <p className="text-[9.5px] font-semibold uppercase" style={{ color: RISK_HEX[r.key] }}>
                  {r.key}
                </p>
                <p className="font-display text-[15px] font-extrabold text-ink num">{r.projects}</p>
                <p className="text-[9.5px] text-ink-3 num">{formatCompact(s.caseRiskDistribution.find((c) => c.key === r.key)?.cases ?? 0)} cases</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Stage distribution" subtitle="Projects by current stage and stage status — click to filter" icon={<Layers className="h-4 w-4" />} />
          <div className="h-[290px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.stageDistribution.map((d) => ({ ...d, short: d.key.split(' ')[0] }))} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                <XAxis dataKey="short" tickLine={false} axisLine={false} tick={tick} interval={0} />
                <YAxis tickLine={false} axisLine={false} tick={tick} allowDecimals={false} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => s.stageDistribution.find((d) => d.key.startsWith(String(l)))?.key ?? l} />} cursor={{ fill: 'rgb(var(--c-surface-2))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="inProgress" name="In progress" stackId="a" fill="#0EA5E9" className="cursor-pointer" onClick={(d: { key?: string }) => d?.key && go({ stage: d.key })} />
                <Bar dataKey="delayed" name="Delayed" stackId="a" fill="#F59E0B" className="cursor-pointer" onClick={(d: { key?: string }) => d?.key && go({ stage: d.key, status: 'DELAYED' })} />
                <Bar dataKey="blocked" name="Blocked" stackId="a" fill="#E11D48" radius={[4, 4, 0, 0]} className="cursor-pointer" onClick={(d: { key?: string }) => d?.key && go({ stage: d.key, status: 'BLOCKED' })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="State-wise risk" subtitle="Mean project risk; bar label shows High + Critical count" icon={<TrendingUp className="h-4 w-4" />} />
          <div className="px-2 pb-4" style={{ height: Math.max(220, s.stateRisk.length * 24 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.stateRisk} layout="vertical" margin={{ top: 0, right: 30, left: 90, bottom: 0 }}>
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis type="category" dataKey="key" tickLine={false} axisLine={false} width={120} tick={{ ...tick, fill: 'rgb(var(--c-ink-2))' }} />
                <Tooltip content={<ChartTooltip formatter={(v, n) => (n === 'Mean risk' ? `${v}%` : v)} />} cursor={{ fill: 'rgb(var(--c-surface-2))' }} />
                <Bar dataKey="avgRisk" name="Mean risk" radius={[0, 5, 5, 0]} barSize={14} className="cursor-pointer" onClick={(d: { key?: string }) => d?.key && set({ state: d.key })}>
                  {s.stateRisk.map((d) => (
                    <Cell key={d.key} fill={RISK_HEX[riskFromScore(d.avgRisk)]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="District-wise risk" subtitle="Top 15 districts by mean project risk" icon={<TrendingUp className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {s.districtRisk.map((d) => (
              <button key={d.key} onClick={() => go({ district: d.key.split(', ')[0], state: d.key.split(', ')[1] })} className="flex w-full items-center gap-3 px-5 py-2 text-left hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{d.key}</span>
                  <span className="block text-[10.5px] text-ink-3">
                    {d.projects} project{d.projects === 1 ? '' : 's'} · {d.delayed} delayed · {d.blocked} blocked
                  </span>
                </span>
                <RiskPill level={riskFromScore(d.avgRisk)} score={d.avgRisk} size="sm" />
              </button>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Project-type risk" subtitle="Mean risk by type — click to filter" icon={<Building2 className="h-4 w-4" />} />
          <div className="h-[300px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.projectTypeRisk} layout="vertical" margin={{ top: 0, right: 24, left: 70, bottom: 0 }}>
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis type="category" dataKey="key" width={110} tickLine={false} axisLine={false} tick={{ ...tick, fill: 'rgb(var(--c-ink-2))' }} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ fill: 'rgb(var(--c-surface-2))' }} />
                <Bar dataKey="avgRisk" name="Mean risk" barSize={14} radius={[0, 5, 5, 0]} className="cursor-pointer" onClick={(d: { key?: string }) => d?.key && set({ projectType: d.key })}>
                  {s.projectTypeRisk.map((d) => (
                    <Cell key={d.key} fill={RISK_HEX[riskFromScore(d.avgRisk)]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Delay drivers" subtitle="Share of risk-increasing SHAP contribution, weighted by open cases" icon={<ShieldAlert className="h-4 w-4" />} />
          <div className="space-y-2.5 px-5 pb-5">
            {s.delayDrivers.map((d) => (
              <div key={d.key}>
                <div className="flex justify-between text-[12px]">
                  <span className="font-semibold text-ink">{d.key}</span>
                  <span className="font-bold text-ink num">{Math.round(d.share * 100)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full" style={{ width: `${d.share * 100}%`, background: groupColor(d.key) }} />
                </div>
              </div>
            ))}
            <p className="border-t border-line pt-2 text-[10.5px] text-ink-3">Contributions explain predictions; they are not proof of cause.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Department bottlenecks" subtitle="Current-stage cases waiting on each type of office" icon={<Network className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {s.departmentBottlenecks.byRole.slice(0, 8).map((d) => (
              <div key={d.key} className="flex items-center gap-3 px-5 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{d.key}</span>
                  <span className="block text-[10.5px] text-ink-3">{d.projects} projects · {formatNumber(d.openCasesPending)} open cases across stages</span>
                </span>
                <span className="text-[13px] font-bold text-ink num">{formatNumber(d.currentStagePending)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-line px-5 py-2.5">
            <p className="label-xs mb-1">Most-loaded named offices</p>
            {s.departmentBottlenecks.byOffice.slice(0, 4).map((o) => (
              <p key={o.key} className="truncate text-[11px] text-ink-2" title={o.key}>
                <span className="font-bold num">{formatNumber(o.openCasesPending)}</span> · {o.key}
              </p>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader title="Compensation progress" subtitle={`${s.compensation.projectsAtOrPastCompensation} projects at or past Compensation`} icon={<BadgeIndianRupee className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <KeyValue columns={2} rows={[{ label: 'Mean completion', value: `${s.compensation.averageCompletionPct}%` }, { label: 'Backlog projects', value: s.compensation.backlogProjects }]} />
            <MiniBars rows={s.compensation.buckets} color="#0EA5A4" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Legal disputes" subtitle="Across projects in scope" icon={<Gavel className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <KeyValue columns={2} rows={[{ label: 'Legal cases', value: formatCompact(s.legal.legalCases) }, { label: 'Disputed parcels', value: formatCompact(s.legal.disputedParcels) }, { label: 'Escalation flagged', value: s.legal.projectsWithEscalation }]} />
            <MiniBars rows={s.legal.byType.slice(0, 5).map((t) => ({ key: t.key, count: t.legalCases }))} color="#E11D48" />
          </div>
        </Card>
        <Card>
          <CardHeader title="R&R progress" subtitle={`${s.rr.projectsWithRR} projects with R&R due`} icon={<Users className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <KeyValue columns={2} rows={[{ label: 'Mean delivery', value: `${s.rr.averageProgressPct}%` }, { label: 'Affected families', value: formatCompact(s.rr.affectedFamilies) }]} />
            <MiniBars rows={s.rr.buckets} color="#7C6CF5" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Timeline adherence" subtitle="Current stage status and forecast overrun" icon={<CalendarClock className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <div className="flex flex-wrap gap-1.5">
              {(['IN_PROGRESS', 'DELAYED', 'BLOCKED'] as const).map((st) => (
                <button key={st} onClick={() => go({ status: st })}>
                  <Badge className={STAGE_STATUS_CLASS[st]}>
                    {STAGE_STATUS_LABEL[st]} <span className="num">{st === 'IN_PROGRESS' ? s.timeline.onTrack : st === 'DELAYED' ? s.timeline.delayed : s.timeline.blocked}</span>
                  </Badge>
                </button>
              ))}
            </div>
            <MiniBars rows={s.timeline.overrunBuckets} color="#F59E0B" />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader
            title="Delay trend"
            subtitle={`${values.district !== 'all' ? values.district : values.state !== 'all' ? values.state : 'All in scope'} · observed share of milestones > 30 days late, then the model forecast for open milestones`}
            icon={<TrendingUp className="h-4 w-4" />}
            action={
              <Link to={`/trends${values.state !== 'all' ? `?level=district&state=${encodeURIComponent(values.state)}` : ''}`} className="text-[12px] font-semibold text-brand hover:underline">
                State & district trends →
              </Link>
            }
          />
          <div className="h-[260px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={(trend.data?.series ?? []).map((t) => ({ month: t.month.slice(2), observed: t.overall.observed === null ? null : Math.round(t.overall.observed * 1000) / 10, forecast: t.overall.forecast === null ? null : Math.round(t.overall.forecast * 1000) / 10 }))} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} />
                <YAxis tickLine={false} axisLine={false} tick={tick} unit="%" domain={[0, 'auto']} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="observed" name="Observed delay rate" stroke={CHART_COLORS.saffron} strokeWidth={2.2} dot={false} />
                <Line dataKey="forecast" name="Model forecast (open milestones)" stroke={CHART_COLORS.brand} strokeWidth={2.2} strokeDasharray="5 4" dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Highest-risk projects" subtitle="With the top triggered action" icon={<AlertOctagon className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {s.topProjects.map((p) => (
              <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{p.name}</span>
                  <span className="block truncate text-[10.5px] text-ink-3">
                    {p.district}, {p.state} · {p.stage} ({STAGE_STATUS_LABEL[p.stageStatus]}){p.topAction ? ` · ${p.topAction}` : ''}
                  </span>
                </span>
                <RiskPill level={p.riskBand} score={p.riskScore} size="sm" />
              </button>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function MiniBars({ rows, color }: { rows: Array<{ key: string; count: number }>; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 text-[11px]">
          <span className="w-[92px] shrink-0 truncate text-ink-3" title={r.key}>
            {r.key}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: color }} />
          </span>
          <span className="w-8 text-right font-bold text-ink num">{formatNumber(r.count)}</span>
        </div>
      ))}
    </div>
  );
}
