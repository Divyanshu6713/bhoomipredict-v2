import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound, Link2, Lock, PlugZap, ShieldCheck, Webhook, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, SkeletonCard } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/ui/Modal';
import { ErrorState } from '@/components/ui/primitives';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, fetchApiClients, fetchOpenApi, fetchSecurityPosture, revokeApiClient, verifyAudit } from '@/api/client';
import { formatDate, formatNumber } from '@/lib/format';

/** Integration APIs for land-acquisition systems and government databases, plus the security posture behind them. */
export default function Integrations() {
  const { can, user } = useAuth();
  const [n, setN] = useState(0);
  const clients = useApi((signal) => (can('integration.manage') ? fetchApiClients(signal) : Promise.resolve(null)), [n]);
  const spec = useApi((signal) => fetchOpenApi(signal), []);
  const posture = useApi((signal) => fetchSecurityPosture(signal), []);
  const audit = useApi((signal) => (can('audit.view') ? verifyAudit(signal) : Promise.resolve(null)), [n]);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[12.5px] leading-relaxed text-ink-2">
          Existing land-acquisition management systems, state portals and government databases connect through a versioned REST API: they read risk, forecasts and recommendations for their jurisdiction, push project status updates that re-score immediately, and send completed-milestone outcomes that feed continuous learning. Inbound government data sources plug into the{' '}
          <Link to="/data-sources" className="font-semibold text-brand hover:underline">
            data integration layer
          </Link>
          . No government system is connected in this prototype.
        </p>
        <DemoDataBadge />
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="API clients"
            subtitle="Each system gets a scoped, rate-limited key tied to a jurisdiction; keys are shown once and stored only as hashes"
            icon={<KeyRound className="h-4 w-4" />}
            action={
              can('integration.manage') && (
                <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> New API client
                </Button>
              )
            }
          />
          {!can('integration.manage') ? (
            <p className="px-5 pb-5 text-[12px] text-ink-3">Issuing API keys needs the integration.manage permission (National or State Administrator).</p>
          ) : clients.error ? (
            <ErrorState error={clients.error} />
          ) : !clients.data ? (
            <SkeletonCard lines={3} />
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {clients.data.clients.length === 0 && <p className="px-5 py-5 text-[12px] text-ink-3">No API clients yet.</p>}
              {clients.data.clients.map((c) => (
                <div key={c.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                  <div className="min-w-[240px] flex-1">
                    <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
                      {c.name}
                      <Badge className={c.active ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600' : 'border-rose-500/25 bg-rose-500/10 text-rose-600'}>{c.active ? 'active' : 'revoked'}</Badge>
                    </p>
                    <p className="font-mono text-[11px] text-ink-3">
                      {c.id} · {c.keyPreview} · {c.rateLimitPerMinute}/min
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-2">Jurisdiction: {c.jurisdiction}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.scopes.map((sc) => (
                        <Badge key={sc} className="border-brand/25 bg-brand/10 font-mono text-brand">
                          {sc}
                        </Badge>
                      ))}
                      {c.webhookUrl && (
                        <Badge className="border-line bg-surface-2 text-ink-3">
                          <Webhook className="h-3 w-3" /> webhook
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-ink-3">
                    <p>created {formatDate(c.createdAt)} by {c.createdBy.name}</p>
                    <p>{formatNumber(c.requests)} requests{c.lastUsedAt ? ` · last ${formatDate(c.lastUsedAt)}` : ''}</p>
                    {c.active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 gap-1 text-rose-600"
                        onClick={async () => {
                          await revokeApiClient(c.id);
                          setN((x) => x + 1);
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Security posture" subtitle="What protects the platform and its integrations today" icon={<Lock className="h-4 w-4" />} />
          <div className="space-y-2 px-5 pb-5 text-[12px]">
            {posture.data &&
              (
                [
                  ['Authentication', posture.data.authentication],
                  ['Sessions', posture.data.sessions],
                  ['Downloads', posture.data.downloads],
                  ['API keys', posture.data.apiKeys],
                  ['Transport', posture.data.transport],
                  ['Audit trail', posture.data.audit],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <p>
                    <span className="font-semibold text-ink">{k}: </span>
                    <span className="text-ink-2">{v}</span>
                  </p>
                </div>
              ))}
            {audit.data && (
              <div className={cn('mt-3 rounded-xl border px-3 py-2.5', audit.data.valid ? 'border-emerald-500/30 bg-emerald-500/[0.07]' : 'border-rose-500/30 bg-rose-500/[0.07]')}>
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <ShieldCheck className={cn('h-4 w-4', audit.data.valid ? 'text-emerald-500' : 'text-rose-500')} /> Audit chain {audit.data.valid ? 'verified' : 'BROKEN'}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  {formatNumber(audit.data.chained)} hash-chained entries{audit.data.legacyUnchained ? ` · ${audit.data.legacyUnchained} earlier unchained` : ''} · head <span className="font-mono">{audit.data.head.slice(0, 12)}…</span>
                </p>
                {audit.data.brokenAt && <p className="mt-1 text-[11px] text-rose-600">Line {audit.data.brokenAt.line}: {audit.data.brokenAt.reason}</p>}
              </div>
            )}
            <p className="pt-1 text-[10.5px] leading-relaxed text-ink-3">Production path: government SSO with multi-factor authentication, TLS termination, a transactional database with row-level security, and data-protection controls for landowner personal data.</p>
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader
          title="Integration API v1 (OpenAPI 3)"
          subtitle={spec.data ? `${spec.data.info.title} ${spec.data.info.version} — machine-readable contract at /api/v1/openapi.json` : 'Loading contract…'}
          icon={<PlugZap className="h-4 w-4" />}
          action={
            <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> openapi.json
              </Button>
            </a>
          }
        />
        {spec.error && <ErrorState error={spec.error} />}
        <div className="divide-y divide-line border-t border-line">
          {spec.data &&
            Object.entries(spec.data.paths).flatMap(([path, methods]) =>
              Object.entries(methods).map(([method, op]) => (
                <div key={`${method}${path}`} className="flex flex-wrap items-start gap-3 px-5 py-2.5">
                  <Badge className={cn('w-14 justify-center font-mono uppercase', method === 'get' ? 'border-sky-500/25 bg-sky-500/10 text-sky-600' : method === 'post' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600' : 'border-amber-500/25 bg-amber-500/10 text-amber-600')}>{method}</Badge>
                  <code className="w-56 font-mono text-[12px] font-semibold text-ink">/api/v1{path}</code>
                  <div className="min-w-[260px] flex-1">
                    <p className="text-[12.5px] font-semibold text-ink">{op.summary}</p>
                    <p className="text-[11px] text-ink-3">{op.description}</p>
                  </div>
                </div>
              )),
            )}
        </div>
        <pre className="m-5 overflow-x-auto rounded-xl bg-navy-900 p-3 font-mono text-[11px] leading-relaxed text-white/80">{`curl -H "X-API-Key: lp_xxxxxx_…" ${location.origin}/api/v1/projects/LAP-1000/risk

curl -X PATCH -H "X-API-Key: …" -H "Content-Type: application/json" \\
     -d '{"compensationCompletionPct": 72, "approvalDelayDays": 20}' ${location.origin}/api/v1/projects/LAP-1000

curl -X POST -H "X-API-Key: …" -H "Content-Type: application/json" \\
     -d '{"outcomes":[{"caseId":"LAC-812345","completedOn":"2026-09-02"}]}' ${location.origin}/api/v1/outcomes`}</pre>
      </Card>

      {open && user && <CreateClient scopes={clients.data?.scopes ?? {}} defaultPosition={user.position} onClose={() => setOpen(false)} onCreated={() => setN((x) => x + 1)} />}
    </div>
  );
}

function CreateClient({ scopes, defaultPosition, onClose, onCreated }: { scopes: Record<string, string>; defaultPosition: { organisation: { id: string }; units: Record<string, string | null | undefined> }; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>(['read:projects', 'read:risk']);
  const [rate, setRate] = useState(120);
  const [webhook, setWebhook] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setError(null);
    try {
      const r = await createApiClient({ name, scopes: chosen, rateLimitPerMinute: rate, webhookUrl: webhook || null, position: { orgId: defaultPosition.organisation.id, units: Object.fromEntries(Object.entries(defaultPosition.units).map(([k, v]) => [k, v ?? undefined])) } });
      setKey(r.key);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={key ? 'API key issued' : 'New API client'}
      subtitle={key ? 'Copy it now — it will not be shown again' : 'Jurisdiction defaults to your own position'}
      footer={
        key ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={name.trim().length < 3 || !chosen.length}>
              Issue key
            </Button>
          </>
        )
      }
    >
      {key ? (
        <div className="space-y-2">
          <code className="block break-all rounded-lg bg-navy-900 p-3 font-mono text-[12px] text-white">{key}</code>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={async () => {
              await navigator.clipboard?.writeText(key);
              setCopied(true);
            }}
          >
            <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy key'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="System name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. State Land Acquisition Case System" />
          </Field>
          <Field label="Scopes">
            <div className="space-y-1.5">
              {Object.entries(scopes).map(([id, desc]) => (
                <label key={id} className="flex items-start gap-2 text-[12px]">
                  <input type="checkbox" className="mt-0.5" checked={chosen.includes(id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, id] : c.filter((x) => x !== id)))} />
                  <span>
                    <code className="font-mono font-semibold text-ink">{id}</code> <span className="text-ink-3">— {desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate limit / minute">
              <input type="number" className={inputClass} value={rate} min={10} max={1000} onChange={(e) => setRate(Number(e.target.value))} />
            </Field>
            <Field label="Alert webhook (optional)">
              <input className={inputClass} value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          {error && <p className="text-[12px] font-medium text-rose-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
