import { ArrowRight, Boxes, Cable, CheckCircle2, CircleDashed, Code2, Database, Globe2, Info, PlugZap, Server } from 'lucide-react';
import { Badge, Card, CardHeader, SkeletonCard } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { PROVENANCE, ProvenanceBadge } from '@/components/brand/Provenance';
import { useApi } from '@/hooks';
import { fetchHealth, fetchIntegrations } from '@/api/client';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import type { DataMode } from '@/data/types';

const LAYER_ICON = [Globe2, Server, Cable, Database];

/**
 * What the platform's data is, where it would come from in a deployment, and
 * how an official source is plugged in. Honest by construction: the provider
 * list is read from the API, which reports the adapter actually in use.
 */
export default function DataSources() {
  const status = useApi((signal) => fetchIntegrations(signal), []);
  const health = useApi((signal) => fetchHealth(signal), []);

  if (status.error) return <ErrorState error={status.error} onRetry={status.reload} />;
  if (!status.data) return <SkeletonCard lines={10} />;
  const s = status.data;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-navy-900 px-5 py-6 grid-lines sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300" dot="bg-emerald-400">
              Government Data Integration Ready
            </Badge>
            <Badge className="border-white/15 bg-white/[0.06] text-white/70">{s.connectedOfficialSources} official sources connected</Badge>
          </div>
          <h2 className="mt-3 max-w-3xl font-display text-[22px] font-extrabold tracking-tight text-white sm:text-[26px]">Integration-ready, not integrated</h2>
          <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-white/60">{s.statement}</p>

          <div className="mt-6 flex flex-col gap-2 md:flex-row md:items-stretch">
            {s.architecture.map((layer, i) => {
              const Icon = LAYER_ICON[i] ?? Boxes;
              const last = i === s.architecture.length - 1;
              return (
                <div key={layer} className="flex flex-1 items-center gap-2">
                  <div className={cn('flex flex-1 items-center gap-3 rounded-xl border px-3.5 py-3', last ? 'border-dashed border-emerald-400/35 bg-emerald-400/[0.05]' : 'border-white/12 bg-white/[0.05]')}>
                    <Icon className={cn('h-4 w-4 shrink-0', last ? 'text-emerald-300' : 'text-[#9DBBFF]')} />
                    <div>
                      <p className="text-[12.5px] font-semibold text-white">{layer === 'LandPulse AI API' ? `${BRAND.product} API` : layer}</p>
                      <p className="text-[10.5px] text-white/45">{['React client', 'Scoped HTTP endpoints', 'Contracts + adapters', 'Future: official systems'][i]}</p>
                    </div>
                  </div>
                  {!last && <ArrowRight className="hidden h-4 w-4 shrink-0 text-white/30 md:block" />}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Data provenance on screen" subtitle="Every figure belongs to one of these; badges mark them where it matters" icon={<Info className="h-4 w-4" />} />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
          {(['synthetic', 'user', 'model', 'integration'] as DataMode[]).map((m) => (
            <div key={m} className="rounded-xl border border-line bg-surface-2 p-3.5">
              <ProvenanceBadge mode={m} />
              <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{PROVENANCE[m].description}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                {
                  {
                    synthetic: `${health.data ? `${health.data.rows.toLocaleString('en-IN')} parcel-level cases across ${health.data.projects} projects.` : 'The acquisition corpus.'} Administrative boundaries, State / district names and statutory frameworks are real; records are not.`,
                    user: 'Projects added by form or CSV, stage advances, case status changes, documents and workflow updates — all audited.',
                    model: 'Risk scores, delay probabilities, expected slip, SHAP explanations, issue profiles, alerts and recommendations.',
                    integration: 'Land records, registration, courts, compensation, notifications, project status, clearances, GIS and LGD codes.',
                    official: '',
                  }[m]
                }
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Provider contracts" subtitle="One slot per kind of government source. The adapter in each slot is the one the API is using right now." icon={<PlugZap className="h-4 w-4" />} />
        <div className="grid gap-3 px-5 pb-5 lg:grid-cols-2">
          {s.providers.map((p) => (
            <div key={p.kind} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-[14px] font-bold text-ink">{p.label}</p>
                  <p className="text-[11.5px] leading-relaxed text-ink-3">{p.description}</p>
                </div>
                {p.connected ? (
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700" dot="bg-emerald-500">
                    Connected
                  </Badge>
                ) : (
                  <Badge className="border-line bg-surface-2 text-ink-3">
                    <CircleDashed className="h-3 w-3" /> Not connected
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-2">
                <span className="text-ink-3">Active adapter:</span>
                <span className="font-mono text-[11px]">{p.adapter.id}</span>
                <ProvenanceBadge mode={p.adapter.mode} compact />
              </div>
              <div className="mt-2.5 space-y-1">
                {p.methods.map((m) => (
                  <p key={m.name} className="flex items-start gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-2">
                    <Code2 className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
                    <span className="min-w-0 break-words">
                      {m.name}({m.input}) → {m.returns}
                    </span>
                  </p>
                ))}
              </div>
              <div className="mt-2.5">
                <p className="label-xs mb-1">Potential official sources (future, not connected)</p>
                <ul className="space-y-0.5">
                  {p.futureSources.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-2">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-2 text-[10.5px] text-ink-3">
                Selected by <span className="font-mono">{p.envVariable}</span> · registered: {p.registeredAdapters.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Connecting an official source" subtitle="What changes — and what does not" icon={<Cable className="h-4 w-4" />} />
        <ol className="grid gap-3 px-5 pb-5 md:grid-cols-4">
          {[
            ['Authorise', 'Obtain access to the source under the relevant data-sharing arrangement. Nothing in this prototype has such access.'],
            ['Implement the contract', 'Write an adapter with the same methods (server/integration/contracts.mjs) that calls the source and maps its fields.'],
            ['Register and select', 'Add it to server/integration/adapters.mjs and start the API with the matching LANDPULSE_PROVIDER_* variable.'],
            ['Nothing else changes', 'Screens, scoring and the issue engine read the contract. Provenance switches to “Official source” automatically.'],
          ].map(([title, text], i) => (
            <li key={title} className="rounded-xl border border-line bg-surface-2 p-3.5">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                {i === 3 ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="grid h-5 w-5 place-items-center rounded-md bg-brand text-[10.5px] font-bold text-white">{i + 1}</span>}
                {title}
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">{text}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
