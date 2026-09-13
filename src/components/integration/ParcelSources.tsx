import { Link } from 'react-router-dom';
import { PlugZap } from 'lucide-react';
import { Card, CardHeader, SkeletonCard } from '@/components/ui';
import { ProvenanceBadge } from '@/components/brand/Provenance';
import { useApi } from '@/hooks';
import { fetchParcelDataView } from '@/api/client';
import { humanise } from '@/lib/status';
import type { Envelope } from '@/data/types';

const SECTION_LABEL: Record<string, string> = {
  landRecords: 'Land records',
  registration: 'Registration & encumbrance',
  courtCases: 'Court & dispute records',
  compensation: 'Compensation & payments',
  gis: 'GIS',
};

const show = (v: unknown) => (v === null || v === undefined || v === '' ? 'not recorded' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : Array.isArray(v) ? v.join(', ') : String(v));

/**
 * The parcel as the Data Integration Layer returns it: one section per
 * provider contract, each with its own provenance. Today every section is
 * served by a synthetic adapter; a connected source would change the badge,
 * not this component.
 */
export function ParcelSources({ caseId }: { caseId: string }) {
  const view = useApi((signal) => fetchParcelDataView(caseId, signal), [caseId]);
  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Parcel through the data integration layer"
        subtitle="Each section comes from a provider contract; the badge shows which adapter answered"
        icon={<PlugZap className="h-4 w-4" />}
        action={
          <Link to="/data-sources" className="text-[12px] font-semibold text-brand hover:underline">
            Data sources
          </Link>
        }
      />
      <div className="px-5 pb-5">
        {view.error && <p className="text-[12px] text-rose-600">{view.error.message}</p>}
        {!view.data && !view.error && <SkeletonCard lines={3} />}
        {view.data && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(Object.entries(view.data.sections) as Array<[string, Envelope<Record<string, unknown>>]>).map(([key, env]) => (
              <div key={key} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-ink">{SECTION_LABEL[key] ?? key}</p>
                  {env.provenance && <ProvenanceBadge mode={env.provenance.mode} compact />}
                </div>
                {env.error ? (
                  <p className="mt-2 text-[11.5px] text-rose-600">{env.error}</p>
                ) : env.data ? (
                  <dl className="mt-2 space-y-1">
                    {Object.entries(env.data).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-[11.5px]">
                        <dt className="w-32 shrink-0 text-ink-3">{humanise(k.replace(/([A-Z])/g, '_$1'))}</dt>
                        <dd className="min-w-0 break-words text-ink-2">{show(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-ink-3">
                    <p>No records returned — the demo corpus holds none for this contract.</p>
                    <ProvenanceBadge mode="integration" compact />
                  </div>
                )}
                {env.provenance && <p className="mt-2 border-t border-line pt-1.5 text-[10.5px] leading-relaxed text-ink-3">{env.provenance.source}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
