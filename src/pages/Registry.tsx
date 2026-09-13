import { useState } from 'react';
import { Gavel, Network, Scale } from 'lucide-react';
import { Badge, Card, CardHeader, Select, SkeletonCard } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { DependencyNetwork } from '@/components/network/DependencyNetwork';
import { useApi } from '@/hooks';
import { fetchRegistry, fetchScenarioOptions, scoreScenario } from '@/api/client';
import { humanise } from '@/lib/status';
import type { ProjectType } from '@/data/types';

/**
 * Read-only view of the authority registry: which framework, bodies and
 * departments apply to a project type in a given state and district.
 */
export default function Registry() {
  const registry = useApi((signal) => fetchRegistry(signal), []);
  const [state, setState] = useState('Karnataka');
  const [district, setDistrict] = useState('Mandya');
  const [type, setType] = useState<ProjectType>('Irrigation');
  const [subtype, setSubtype] = useState('');
  const options = useApi((signal) => fetchScenarioOptions({ state, district, projectType: type, subtype }, signal), [state, district, type, subtype]);
  const validDistrict = options.data?.districts?.some((d) => d.district === district);
  const preview = useApi(
    (signal) => (validDistrict ? scoreScenario({ context: { state, district, projectType: type, subtype: subtype || undefined, stage: 'Notification', affectedFamilies: 50 }, pending: [], signals: {} }, signal) : Promise.resolve(null)),
    [state, district, type, subtype, validDistrict],
  );

  if (registry.error) return <ErrorState error={registry.error} onRetry={registry.reload} />;
  if (!registry.data) return <SkeletonCard lines={10} />;
  const r = registry.data;
  const typeDef = r.projectTypes.find((t) => t.name === type);

  return (
    <div className="space-y-4">
      <Card className="p-5 text-[12.5px] leading-relaxed text-ink-2">
        <p className="font-semibold text-ink">About this registry</p>
        <p className="mt-1">{r.note}</p>
        <p className="mt-1">
          States with detailed or compact profiles: {r.profiledStates.join(', ')}. Any other state falls back to generic designations rather than invented ones.
        </p>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title="Explore a context" subtitle="The same engine Scenario Scoring and every project use" icon={<Network className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5">
            <Select label="State" value={state} onChange={(v) => { setState(v); setDistrict(''); }} options={(options.data?.states ?? [state]).map((s) => ({ label: s, value: s }))} />
            <Select label="District" value={district} onChange={setDistrict} options={[{ label: 'Select district', value: '' }, ...(options.data?.districts ?? []).map((d) => ({ label: d.district, value: d.district }))]} />
            <Select label="Project type" value={type} onChange={(v) => { setType(v as ProjectType); setSubtype(''); }} options={r.projectTypes.map((t) => ({ label: t.name, value: t.name }))} />
            <Select label="Subtype" value={subtype || typeDef?.subtypes[0] || ''} onChange={setSubtype} options={(typeDef?.subtypes ?? []).map((s) => ({ label: s, value: s }))} />
            {options.data?.authorityOptions && (
              <div>
                <p className="label-xs mb-1">Eligible acquiring / requiring bodies</p>
                <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-ink-2">
                  {options.data.authorityOptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title={preview.data ? `${type} in ${district}, ${state}` : 'Dependency network'}
            subtitle={preview.data ? `${preview.data.dependencies.count} dependencies at the Notification stage · district head: ${preview.data.stateProfile.districtHead} · ${preview.data.stateProfile.subDistrictLabel} level offices` : 'Pick a district'}
            icon={<Scale className="h-4 w-4" />}
          />
          <div className="px-5 pb-5">
            {preview.error && <ErrorState error={preview.error} />}
            {preview.data && <DependencyNetwork nodes={preview.data.dependencies.nodes} framework={preview.data.framework} currentStage="Notification" note={preview.data.dependencies.note} />}
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader title="Acquisition frameworks" subtitle="Milestones, dispute forums and whether land is acquired or only a right of use / way" icon={<Gavel className="h-4 w-4" />} />
        <div className="grid gap-3 px-5 pb-5 lg:grid-cols-2">
          {r.frameworks.map((f) => (
            <div key={f.id} className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-[13px] font-bold text-ink">{f.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge>{humanise(f.mode)}</Badge>
                <Badge>{f.siaRequired ? 'SIA required' : 'No SIA chapter'}</Badge>
                <Badge>Forum: {f.disputeForum}</Badge>
              </div>
              {f.note && <p className="mt-2 text-[11.5px] text-ink-2">{f.note}</p>}
              <dl className="mt-2 grid grid-cols-[130px_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                {Object.entries(f.milestones).map(([stage, m]) => (
                  <div key={stage} className="contents">
                    <dt className="text-ink-3">{stage}</dt>
                    <dd className="text-ink-2">{m}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Project types" subtitle="Subtypes and central sanction bodies" />
          <div className="divide-y divide-line border-t border-line">
            {r.projectTypes.map((t) => (
              <div key={t.name} className="px-5 py-2.5">
                <p className="text-[12.5px] font-semibold text-ink">
                  {t.name} {t.linear && <Badge className="ml-1">linear</Badge>}
                </p>
                <p className="text-[11px] text-ink-3">{t.subtypes.join(' · ')}</p>
                {t.central && <p className="text-[11px] text-ink-2">Central: {t.central}</p>}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Rule thresholds" subtitle="Lifecycle blocking rules and intervention triggers" />
          <div className="grid grid-cols-1 gap-x-6 px-5 pb-5 sm:grid-cols-2">
            {Object.entries({ ...r.lifecycleRules, ...r.ruleThresholds }).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-line/70 py-1.5 text-[11.5px]">
                <span className="text-ink-3">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                <span className="font-bold text-ink num">{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
