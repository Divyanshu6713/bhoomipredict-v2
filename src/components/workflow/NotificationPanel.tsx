import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageSquare, Radar, Send, Smartphone, Webhook } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, Tabs } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { SeverityBadge } from '@/components/workflow';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchNotificationFeed, markNotificationsRead, runNotificationScan } from '@/api/client';
import { formatNumber } from '@/lib/format';

const CHANNEL_ICON: Record<string, typeof Mail> = { in_app: MessageSquare, email: Mail, sms: Smartphone, webhook: Webhook };

/**
 * Automated notification delivery: my digests, and — for notification managers —
 * every delivery with its channel status and the last scheduled scan.
 */
export function NotificationPanel() {
  const { can } = useAuth();
  const manager = can('notification.manage');
  const [view, setView] = useState<'mine' | 'all'>('mine');
  const [n, setN] = useState(0);
  const feed = useApi((signal) => fetchNotificationFeed({ all: view === 'all' ? 1 : undefined, pageSize: 12 }, signal), [view, n]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const d = feed.data;

  return (
    <Card>
      <CardHeader
        title="Notifications & delivery"
        subtitle={d?.lastScan ? `Automatic scan every ${d.scanIntervalMinutes} min · last ${new Date(d.lastScan.at).toLocaleString('en-IN')} (${d.lastScan.reason}) · ${d.lastScan.newAlerts} new alerts · ${d.lastScan.escalations} escalations · ${d.lastScan.digests} digests` : 'Scheduled scans deliver new alerts and overdue escalations to the officers who own them'}
        icon={<Send className="h-4 w-4" />}
        action={
          <div className="flex items-center gap-2">
            {manager && (
              <Tabs
                tabs={[
                  { id: 'mine', label: 'My notifications', count: view === 'mine' ? d?.total : undefined },
                  { id: 'all', label: 'All deliveries', count: view === 'all' ? d?.total : undefined },
                ]}
                active={view}
                onChange={(v) => setView(v as 'mine' | 'all')}
              />
            )}
            {manager && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="gap-1.5"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await runNotificationScan();
                    setMsg(`Scan complete: ${r.scan?.newAlerts ?? 0} new alerts, ${r.scan?.escalations ?? 0} escalations, ${r.scan?.digests ?? 0} digests delivered.`);
                    setN((x) => x + 1);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Radar className="h-3.5 w-3.5" /> Run scan now
              </Button>
            )}
          </div>
        }
      />
      {msg && <p className="px-5 pb-2 text-[12px] text-ink-2">{msg}</p>}
      {d && (
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {d.channels.map((c) => {
            const Icon = CHANNEL_ICON[c.id] ?? Send;
            return (
              <span key={c.id} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]', c.connected ? 'border-emerald-500/30 text-emerald-600' : 'border-line text-ink-3')} title={c.adapter}>
                <Icon className="h-3 w-3" /> {c.label}: {c.adapter}
                {c.rule ? ` · ${c.rule}` : ''}
              </span>
            );
          })}
        </div>
      )}
      {feed.error && <ErrorState error={feed.error} />}
      <div className="divide-y divide-line border-t border-line">
        {d?.items.map((x) => (
          <div key={x.id} className={cn('px-5 py-3', !x.read && view === 'mine' && 'bg-brand/[0.03]')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12.5px] font-bold text-ink">{x.subject}</p>
              <p className="text-[10.5px] text-ink-3 num">
                {x.id} · {new Date(x.at).toLocaleString('en-IN')}
              </p>
            </div>
            {view === 'all' && (
              <p className="text-[11px] text-ink-3">
                To {x.recipient.name}, {x.recipient.designation}
              </p>
            )}
            <div className="mt-1.5 space-y-1">
              {x.items.slice(0, 3).map((it) => (
                <p key={`${it.kind}${it.id}`} className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-2">
                  <SeverityBadge severity={it.severity} />
                  {it.kind === 'escalation' && <Badge className="border-rose-500/25 bg-rose-500/10 text-rose-600">escalation</Badge>}
                  <Link to={it.link} className="font-semibold hover:text-brand">
                    {it.title}
                  </Link>
                  <span className="text-ink-3">· {it.projectName}</span>
                </p>
              ))}
              {x.itemCount > 3 && <p className="text-[10.5px] text-ink-3">+ {x.itemCount - 3} more in this digest</p>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {x.channels.map((c) => (
                <span key={c.channel} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-3" title={c.detail}>
                  {c.channel} · {c.status}
                </span>
              ))}
            </div>
          </div>
        ))}
        {d && d.items.length === 0 && <p className="px-5 py-8 text-center text-[12px] text-ink-3">{view === 'mine' ? 'No notifications addressed to you yet.' : 'No deliveries yet — run a scan.'}</p>}
      </div>
      <div className="flex items-center justify-between border-t border-line px-5 py-2.5">
        <p className="text-[10.5px] text-ink-3">Email and SMS are rendered and recorded in an outbox — no gateway is connected in this prototype. Webhooks POST for real when a URL is configured.</p>
        {view === 'mine' && (d?.unread ?? 0) > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await markNotificationsRead();
              setN((x) => x + 1);
            }}
          >
            Mark {formatNumber(d!.unread)} read
          </Button>
        )}
      </div>
    </Card>
  );
}
