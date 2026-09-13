import { Link } from 'react-router-dom';
import { Bell, Briefcase, ListChecks, ShieldCheck, UserRound } from 'lucide-react';
import { Badge, Button, Card, CardHeader, SkeletonCard } from '@/components/ui';
import { ErrorState, KeyValue, RiskPill } from '@/components/ui/primitives';
import { AuditTimeline } from '@/components/workflow/AuditTimeline';
import { useApi } from '@/hooks';
import { fetchProfile } from '@/api/client';
import { CATEGORY_LABEL, STAGE_STATUS_LABEL, humanise } from '@/lib/status';

export default function Profile() {
  const profile = useApi((signal) => fetchProfile(signal), []);
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <SkeletonCard lines={8} />;
  const { user, notifications, assignedProjects, jurisdiction, assignedInterventions, assignedCases, recentActivity } = profile.data;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title={user.name} subtitle={user.designation} icon={<UserRound className="h-4 w-4" />} action={<Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700">Demo profile</Badge>} />
          <div className="space-y-4 px-5 pb-5">
            <KeyValue
              columns={2}
              rows={[
                { label: 'Department', value: <span className="text-[13px]">{user.department}</span> },
                { label: 'Role', value: user.roleLabel },
                { label: 'State', value: user.state ?? 'All' },
                { label: 'District', value: user.district ?? (user.authority ? '—' : 'All') },
                { label: 'Jurisdiction', value: <span className="text-[13px]">{user.scopeLabel}</span> },
                { label: 'Notifications', value: notifications.total, hint: `${notifications.unreadAlerts} unread alerts · ${notifications.openAssigned} open actions` },
              ]}
            />
            <p className="text-[12.5px] leading-relaxed text-ink-2">{user.roleSummary}</p>
            <div>
              <p className="label-xs mb-1.5">Focus areas (alerts and actions routed to this role)</p>
              <div className="flex flex-wrap gap-1.5">
                {user.focus.length ? user.focus.map((f) => <Badge key={f}>{CATEGORY_LABEL[f] ?? f}</Badge>) : <span className="text-[12px] text-ink-3">None — read-only</span>}
              </div>
            </div>
            <div>
              <p className="label-xs mb-1.5">Permissions enforced by the API</p>
              <div className="flex flex-wrap gap-1.5">
                {user.permissions.length ? (
                  user.permissions.map((p) => (
                    <Badge key={p} className="border-brand/20 bg-brand/5 font-mono text-brand">
                      <ShieldCheck className="h-3 w-3" /> {p}
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
          <CardHeader title="Jurisdiction at a glance" icon={<Briefcase className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <KeyValue
              columns={2}
              rows={[
                { label: 'Projects in scope', value: jurisdiction.projects },
                { label: 'High / Critical', value: jurisdiction.highOrCritical },
                { label: 'Delayed', value: jurisdiction.delayed },
                { label: 'Assigned interventions', value: assignedInterventions },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Link to="/queue?mine=1">
                <Button size="sm" className="gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> My actions
                </Button>
              </Link>
              <Link to="/alerts?focus=1">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Bell className="h-3.5 w-3.5" /> My alerts
                </Button>
              </Link>
            </div>
            {assignedCases.length > 0 && (
              <div>
                <p className="label-xs mb-1.5">Cases cited in my interventions</p>
                <div className="flex flex-wrap gap-1.5">
                  {assignedCases.map((c) => (
                    <Link key={c} to={`/cases/${c}`} className="font-mono text-[11.5px] text-brand hover:underline">
                      {c}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Assigned projects" subtitle="Projects with an intervention assigned to your role" icon={<Briefcase className="h-4 w-4" />} />
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
            {assignedProjects.length === 0 && <p className="px-5 py-6 text-[12px] text-ink-3">No interventions are currently assigned to {humanise(user.role)}.</p>}
          </div>
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
