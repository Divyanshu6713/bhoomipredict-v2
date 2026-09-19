import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, ChevronRight, Globe2, Layers, Map as Map2D, MapPin, Target } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, EmptyState } from '@/components/ui';
import { ErrorState, KeyValue, RiskPill } from '@/components/ui/primitives';
import { FilterBar, allOption, toOptions } from '@/components/ui/FilterBar';
import { IndiaGISMap, GISLegend, type MapDistrictStat, type MapStateStat } from '@/components/gis/IndiaGISMap';
import { RISK_HEX, riskFromScore } from '@/lib/risk';
import { STAGE_STATUS_LABEL } from '@/lib/status';
import { formatNumber } from '@/lib/format';
import { useApi, useDebounced, useFilters } from '@/hooks';
import { fetchBoundaries, fetchProjectMap } from '@/api/client';
import { LIFECYCLE_STAGES, type MapProject, type RiskLevel } from '@/data/types';

// three.js only loads when someone opens the 3D view
const IndiaMap3D = lazy(() => import('@/components/three/IndiaMap3D'));

const hasWebGL = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();

const BANDS: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/**
 * GIS risk map. Uses the same effective project list as every other screen
 * (/api/projects/map) — there is no separate map dataset — and real
 * administrative boundaries for India, states and districts.
 */
export default function GeographicMap() {
  const navigate = useNavigate();
  const { values, set, reset, activeCount } = useFilters({ bands: 'Low,Medium,High,Critical', state: 'all', district: 'all', type: 'all', stage: 'all', q: '', view: hasWebGL ? '3d' : '2d' });
  const view3d = hasWebGL && values.view === '3d';
  const [search, setSearch] = useState(values.q);
  const q = useDebounced(search.trim().toLowerCase(), 200);

  const projects = useApi((signal) => fetchProjectMap(signal), []);
  const outline = useApi((signal) => fetchBoundaries('outline', undefined, signal), []);
  const states = useApi((signal) => fetchBoundaries('states', undefined, signal), []);
  const selectedState = values.state === 'all' ? null : values.state;
  const districts = useApi((signal) => (selectedState ? fetchBoundaries('districts', selectedState, signal) : Promise.resolve(null)), [selectedState]);
  const selectedDistrict = values.district === 'all' || !selectedState ? null : `${selectedState}|${values.district}`;

  const bands = useMemo(() => new Set(values.bands.split(',').filter(Boolean)), [values.bands]);
  const all = projects.data?.projects ?? [];

  /** Filters other than geography, so state/district shading reflects the same slice as the markers. */
  const sliced = useMemo(
    () =>
      all.filter((p) => {
        if (!bands.has(p.riskBand)) return false;
        if (values.type !== 'all' && p.type !== values.type) return false;
        if (values.stage !== 'all' && p.stage !== values.stage) return false;
        if (q && !`${p.name} ${p.id} ${p.district} ${p.state} ${p.primaryAuthority}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [all, bands, values.type, values.stage, q],
  );
  const visible = useMemo(
    () => sliced.filter((p) => (!selectedState || p.state === selectedState) && (!selectedDistrict || p.districts.includes(values.district))),
    [sliced, selectedState, selectedDistrict, values.district],
  );

  const stateStats = useMemo(() => {
    const m = new Map<string, MapStateStat>();
    const groups = new Map<string, MapProject[]>();
    for (const p of sliced) groups.set(p.state, [...(groups.get(p.state) ?? []), p]);
    for (const [state, list] of groups) m.set(state, { state, projects: list.length, avgRisk: mean(list.map((p) => p.riskScore)), highOrCritical: list.filter((p) => p.riskBand === 'High' || p.riskBand === 'Critical').length });
    return m;
  }, [sliced]);

  const districtStats = useMemo(() => {
    const m = new Map<string, MapDistrictStat & { list: MapProject[] }>();
    for (const p of sliced) {
      if (selectedState && p.state !== selectedState) continue;
      for (const d of p.districts) {
        const key = `${p.state}|${d}`;
        const e = m.get(key) ?? { key, district: d, state: p.state, projects: 0, avgRisk: 0, openCases: 0, list: [] };
        e.list.push(p);
        e.projects = e.list.length;
        e.avgRisk = mean(e.list.map((x) => x.riskScore));
        e.openCases += p.openCases;
        m.set(key, e);
      }
    }
    return m;
  }, [sliced, selectedState]);

  const hotspots = useMemo(
    () =>
      Array.from(districtStats.values())
        .map((d) => ({ ...d, high: d.list.filter((p) => p.riskBand === 'High' || p.riskBand === 'Critical').length }))
        .filter((d) => d.high > 0)
        .sort((a, b) => b.high - a.high || b.avgRisk - a.avgRisk)
        .slice(0, 8),
    [districtStats],
  );

  const focusList = [...visible].sort((a, b) => b.riskScore - a.riskScore);
  const stat = selectedState ? stateStats.get(selectedState) : null;
  const dstat = selectedDistrict ? districtStats.get(selectedDistrict) : null;
  const scoped = dstat ? dstat.list : selectedState ? sliced.filter((p) => p.state === selectedState) : sliced;

  if (projects.error) return <ErrorState error={projects.error} onRetry={projects.reload} />;
  if (states.error) return <ErrorState error={states.error} onRetry={states.reload} title="Could not load administrative boundaries" />;

  const toggleBand = (band: RiskLevel) => {
    const next = new Set(bands);
    if (next.has(band)) next.delete(band);
    else next.add(band);
    set({ bands: BANDS.filter((b) => next.has(b)).join(',') || 'Low,Medium,High,Critical' });
  };
  const stateOptions = Array.from(new Set(all.map((p) => p.state))).sort();
  const districtOptions = selectedState ? Array.from(new Set(all.filter((p) => p.state === selectedState).flatMap((p) => p.districts))).sort() : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="GIS risk map"
          subtitle={`${formatNumber(visible.length)} of ${formatNumber(all.length)} projects shown · India → state → district → project`}
          icon={<Globe2 className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-surface-3 p-0.5" role="radiogroup" aria-label="Map view">
                {(
                  [
                    ['2d', '2D map', Map2D],
                    ['3d', '3D view', Box],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={(view3d ? '3d' : '2d') === id}
                    disabled={id === '3d' && !hasWebGL}
                    title={id === '3d' && !hasWebGL ? '3D needs WebGL2, which this browser does not provide' : undefined}
                    onClick={() => set({ view: id })}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-ring disabled:opacity-40',
                      (view3d ? '3d' : '2d') === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
              <DemoDataBadge />
            </div>
          }
        />
        <FilterBar
          search={search}
          onSearch={(v) => {
            setSearch(v);
            set({ q: v });
          }}
          searchPlaceholder="Project, district, authority…"
          selects={[
            { key: 'state', label: 'State', value: values.state, options: [allOption('All India'), ...toOptions(stateOptions)] },
            { key: 'district', label: 'District', value: values.district, options: [allOption(selectedState ? 'All districts' : 'Pick a state first'), ...toOptions(districtOptions)] },
            { key: 'type', label: 'Project type', value: values.type, options: [allOption('Any type'), ...toOptions(Array.from(new Set(all.map((p) => p.type))).sort())], width: 'w-[180px]' },
            { key: 'stage', label: 'Stage', value: values.stage, options: [allOption('Any stage'), ...toOptions([...LIFECYCLE_STAGES])], width: 'w-[190px]' },
          ]}
          onChange={(k, v) => set(k === 'state' ? { state: v, district: 'all' } : { [k]: v })}
          onReset={() => {
            setSearch('');
            reset();
          }}
          activeCount={activeCount}
          extra={
            <div className="pb-0.5">
              <p className="mb-1.5 text-xs font-medium text-ink-2" id="map-risk-label">
                Risk bands shown
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="map-risk-label">
                {BANDS.map((band) => {
                  const on = bands.has(band);
                  return (
                    <button
                      key={band}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleBand(band)}
                      className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors focus-ring', on ? 'border-line-strong bg-surface text-ink shadow-xs' : 'border-dashed border-line bg-transparent text-ink-3 hover:text-ink-2')}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? RISK_HEX[band] : 'rgb(var(--c-line-strong))' }} aria-hidden />
                      {band}
                    </button>
                  );
                })}
              </div>
            </div>
          }
        />
        <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {view3d ? (
              <Suspense fallback={<div className="grid h-[640px] place-items-center rounded-xl border border-line text-sm text-ink-3">Loading 3D view…</div>}>
                <IndiaMap3D
                  states={states.data}
                  districts={districts.data}
                  projects={visible}
                  stateStats={stateStats}
                  districtStats={districtStats}
                  selectedState={selectedState}
                  selectedDistrict={selectedDistrict}
                  onSelectState={(s) => set({ state: s ?? 'all', district: 'all' })}
                  onSelectDistrict={(key) => set({ district: key ? key.split('|')[1] : 'all' })}
                  onOpenProject={(id) => navigate(`/projects/${id}`)}
                  height={640}
                />
              </Suspense>
            ) : (
            <IndiaGISMap
              outline={outline.data}
              states={states.data}
              districts={districts.data}
              projects={visible}
              stateStats={stateStats}
              districtStats={districtStats}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              onSelectState={(s) => set({ state: s ?? 'all', district: 'all' })}
              onSelectDistrict={(key) => set({ district: key ? key.split('|')[1] : 'all' })}
              onOpenProject={(id) => navigate(`/projects/${id}`)}
              height={640}
            />
            )}
            <div className="mt-3">
              <GISLegend />
              {view3d && <p className="mt-1.5 text-xs text-ink-3">In 3D, height encodes mean project risk (not terrain). Pillars are projects, coloured by risk band.</p>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-line">
              <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="label-xs">{dstat ? 'District summary' : stat ? 'State summary' : 'All India'}</p>
                  <p className="text-base font-bold text-ink">{dstat ? `${dstat.district}, ${dstat.state}` : selectedState ?? 'Portfolio in view'}</p>
                </div>
                {(dstat || stat) && <RiskPill level={riskFromScore((dstat ?? stat)!.avgRisk)} score={(dstat ?? stat)!.avgRisk} size="sm" />}
              </div>
              {scoped.length ? (
                <div className="space-y-3 p-4">
                  <KeyValue
                    columns={2}
                    rows={[
                      { label: 'Projects', value: formatNumber(scoped.length) },
                      { label: 'Mean risk', value: `${mean(scoped.map((p) => p.riskScore))}%` },
                      { label: 'High / Critical', value: formatNumber(scoped.filter((p) => p.riskBand === 'High' || p.riskBand === 'Critical').length) },
                      { label: 'Delayed / blocked', value: formatNumber(scoped.filter((p) => p.stageStatus === 'DELAYED' || p.stageStatus === 'BLOCKED').length) },
                      { label: 'Open cases', value: formatNumber(scoped.reduce((a, p) => a + p.openCases, 0)) },
                      { label: 'Mean expected slip', value: `${mean(scoped.map((p) => p.predictedDelayDays ?? 0))}d` },
                    ]}
                  />
                  <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
                    {BANDS.map((b) => {
                      const w = (scoped.filter((p) => p.riskBand === b).length / scoped.length) * 100;
                      return w ? <span key={b} style={{ width: `${w}%`, background: RISK_HEX[b] }} /> : null;
                    })}
                  </div>
                  <Link to={`/projects?${new URLSearchParams({ ...(selectedState ? { state: selectedState } : {}), ...(dstat ? { district: dstat.district } : {}) }).toString()}`}>
                    <Button variant="outline" size="sm" className="w-full gap-1">
                      Open in project registry <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <EmptyState icon={<MapPin className="h-5 w-5" />} title="No projects in this selection" description="Widen the risk filter or pick another area." />
              )}
            </div>

            <div className="rounded-xl border border-line">
              <p className="flex items-center gap-1.5 border-b border-line px-4 py-2.5 label-xs">
                <Target className="h-3.5 w-3.5" /> High-risk district clusters
              </p>
              <div className="divide-y divide-line">
                {hotspots.map((h) => (
                  <button key={h.key} onClick={() => set({ state: h.state, district: h.district })} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{h.district}</span>
                      <span className="block text-xs text-ink-3">
                        {h.state} · {h.high} of {h.projects} High/Critical
                      </span>
                    </span>
                    <RiskPill level={riskFromScore(h.avgRisk)} score={h.avgRisk} size="sm" />
                  </button>
                ))}
                {hotspots.length === 0 && <p className="px-4 py-5 text-center text-xs text-ink-3">No High or Critical projects in view.</p>}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Projects in view" subtitle="Same list as the markers, highest risk first" icon={<Layers className="h-4 w-4" />} />
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-y border-line bg-surface-2">
                {['Project', 'Location', 'Type', 'Stage', 'Authority', 'Risk'].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-ink-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {focusList.slice(0, 25).map((p) => (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer border-b border-line/70 hover:bg-surface-2">
                  <td className="px-4 py-2">
                    <p className="text-sm font-semibold text-ink">{p.name}</p>
                    <p className="font-mono text-xs text-ink-3">{p.id}</p>
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-2">
                    {p.district}, {p.state}
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-2">{p.type}</td>
                  <td className="px-4 py-2 text-xs text-ink-2">
                    {p.stage} <Badge className="ml-1">{STAGE_STATUS_LABEL[p.stageStatus]}</Badge>
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-2 text-xs text-ink-2">{p.primaryAuthority}</td>
                  <td className="px-4 py-2">
                    <RiskPill level={p.riskBand} score={p.riskScore} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {focusList.length > 25 && <p className="px-4 py-2.5 text-xs text-ink-3">Showing 25 of {focusList.length}. Use the registry for the full list.</p>}
        </div>
      </Card>
    </div>
  );
}
