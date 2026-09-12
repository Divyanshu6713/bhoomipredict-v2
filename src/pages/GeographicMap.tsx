import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronRight, Globe2, Layers, MapPin, Target } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, DemoDataBadge, EmptyState, Tabs } from '@/components/ui';
import { ChartTooltip } from '@/components/charts';
import { ErrorState, KeyValue, RiskPill } from '@/components/ui/primitives';
import { GeoLegend, IndiaGeoMap, type MapMetric } from '@/components/gis/IndiaGeoMap';
import { IndiaRiskMap, MapLegend } from '@/components/map/IndiaRiskMap';
import { ContributorChips } from '@/components/explain/Contributors';
import { RISK_HEX, riskFromScore } from '@/lib/risk';
import { formatCompact, formatDate, formatNumber } from '@/lib/format';
import { useApi, useFilters } from '@/hooks';
import { fetchCases, fetchGeo, fetchMapPoints, fetchQueue } from '@/api/client';
import type { RiskLevel } from '@/data/types';

const BANDS: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export default function GeographicMap() {
  const navigate = useNavigate();
  const { values, set } = useFilters({
    layer: 'geo',
    metric: 'risk',
    bands: 'High,Critical',
    state: 'all',
    district: '',
  });

  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(values.district || null);

  const geo = useApi((signal) => fetchGeo(signal), []);
  const bandFilter = useMemo(() => values.bands.split(',').filter(Boolean) as RiskLevel[], [values.bands]);

  const points = useApi(
    (signal) =>
      fetchCases(
        {
          risk: values.bands,
          state: values.state,
          district: selectedDistrict ?? undefined,
          pageSize: 12,
          sort: 'risk',
        },
        signal,
      ),
    [values.bands, values.state, selectedDistrict],
  );

  const mapPoints = useApi(
    (signal) =>
      fetchMapPoints(
        { risk: values.bands, state: values.state, district: selectedDistrict ?? undefined, limit: 3000 },
        signal,
      ),
    [values.bands, values.state, selectedDistrict],
  );

  const clusters = useApi(
    (signal) => fetchQueue({ pageSize: 8, state: values.state, district: selectedDistrict ?? undefined }, signal),
    [values.state, selectedDistrict],
  );

  const districts = useMemo(() => {
    const rows = geo.data?.districts ?? [];
    return values.state === 'all' ? rows : rows.filter((d) => d.state === values.state);
  }, [geo.data, values.state]);

  const district = useMemo(
    () => districts.find((d) => d.key === selectedDistrict) ?? null,
    [districts, selectedDistrict],
  );

  const topDistricts = useMemo(
    () => [...districts].filter((d) => d.openCases > 30).sort((a, b) => b.riskScore - a.riskScore).slice(0, 12),
    [districts],
  );

  if (geo.error) return <ErrorState error={geo.error} onRetry={geo.reload} />;

  const toggleBand = (band: RiskLevel) => {
    const set2 = new Set(bandFilter);
    if (set2.has(band)) set2.delete(band);
    else set2.add(band);
    set({ bands: Array.from(set2).join(',') || 'Low,Medium,High,Critical' });
  };

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title={values.layer === 'geo' ? 'Geographic risk distribution' : 'State-wise risk cartogram'}
            subtitle={
              values.layer === 'geo'
                ? 'District clusters sized by open caseload, with the parcel layer underneath'
                : 'Every state equally legible — click a tile to scope the page'
            }
            icon={<Globe2 className="h-4 w-4" />}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Tabs
                  tabs={[
                    { id: 'geo', label: 'Geographic' },
                    { id: 'tiles', label: 'Cartogram' },
                  ]}
                  active={values.layer}
                  onChange={(v) => set({ layer: v })}
                />
                <Tabs
                  tabs={[
                    { id: 'risk', label: 'Risk' },
                    { id: 'volume', label: 'Volume' },
                    { id: 'progress', label: 'History' },
                  ]}
                  active={values.metric}
                  onChange={(v) => set({ metric: v })}
                />
              </div>
            }
          />
          <div className="px-5 pb-5">
            {values.layer === 'geo' ? (
              <>
                <IndiaGeoMap
                  districts={districts}
                  points={mapPoints.data?.points ?? []}
                  metric={values.metric as MapMetric}
                  bandFilter={bandFilter}
                  selectedDistrict={selectedDistrict}
                  onSelectDistrict={(key) => {
                    setSelectedDistrict(key);
                    set({ district: key ?? '' });
                  }}
                  onSelectCase={(caseId) => navigate(`/cases/${caseId}`)}
                />
                <div className="mt-2 border-t border-line pt-3">
                  <GeoLegend metric={values.metric as MapMetric} pointsShown={mapPoints.data?.returned} />
                </div>
              </>
            ) : (
              <>
                <IndiaRiskMap
                  states={geo.data?.states ?? []}
                  selected={values.state === 'all' ? null : values.state}
                  onSelect={(name) => {
                    set({ state: name ?? 'all', district: '' });
                    setSelectedDistrict(null);
                  }}
                  metric={values.metric === 'volume' ? 'cases' : values.metric === 'progress' ? 'delay' : 'risk'}
                />
                <div className="mt-2 border-t border-line pt-3">
                  <MapLegend metric={values.metric === 'volume' ? 'cases' : values.metric === 'progress' ? 'delay' : 'risk'} />
                </div>
              </>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="label-xs">Show bands</span>
              {BANDS.map((band) => (
                <button
                  key={band}
                  onClick={() => toggleBand(band)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                    bandFilter.includes(band)
                      ? 'border-transparent text-white'
                      : 'border-line bg-surface-2 text-ink-3 hover:border-line-strong',
                  )}
                  style={bandFilter.includes(band) ? { background: RISK_HEX[band] } : undefined}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: bandFilter.includes(band) ? '#fff' : RISK_HEX[band] }}
                  />
                  {band}
                </button>
              ))}
              {(values.state !== 'all' || selectedDistrict) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    set({ state: 'all', district: '' });
                    setSelectedDistrict(null);
                  }}
                >
                  Clear geography
                </Button>
              )}
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              Positions are schematic: the corpus carries district centroids with jitter, not surveyed parcel geometry. A
              production deployment would render boundaries from the survey layer here. The parcel layer is thinned
              server-side, keeping High and Critical cases first.
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
            <CardHeader
              title={district ? `${district.district}, ${district.state}` : values.state !== 'all' ? values.state : 'Select an area'}
              subtitle={
                district
                  ? `${formatNumber(district.openCases)} open cases of ${formatNumber(district.cases)} recorded`
                  : 'Click a cluster or tile to scope the panels'
              }
              icon={<MapPin className="h-4 w-4" />}
              action={district && <RiskPill level={riskFromScore(district.riskScore)} score={district.riskScore} />}
            />
            {district ? (
              <div className="px-5 pb-5">
                <KeyValue
                  columns={2}
                  rows={[
                    { label: 'Predicted risk', value: `${district.riskScore}%`, tone: undefined },
                    { label: 'Observed delay rate', value: `${(district.observedDelayRate * 100).toFixed(0)}%` },
                    { label: 'Open cases', value: formatNumber(district.openCases) },
                    { label: 'Land area', value: `${formatCompact(district.areaHa)} ha` },
                    { label: 'Cases with litigation', value: formatNumber(district.legalDisputes) },
                    { label: 'Critical cases', value: formatNumber(district.band[3]) },
                  ]}
                />
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
                  {district.band.map((count, i) => {
                    const width = (count / Math.max(1, district.openCases)) * 100;
                    return width > 0 ? (
                      <span key={i} style={{ width: `${width}%`, background: RISK_HEX[BANDS[i]] }} />
                    ) : null;
                  })}
                </div>
                <Link
                  to={`/cases?district=${encodeURIComponent(district.key)}`}
                  className="mt-4 flex items-center justify-center gap-1 rounded-xl border border-line bg-surface-2 py-2 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/5"
                >
                  Open these cases in the registry <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <EmptyState
                icon={<Globe2 className="h-5 w-5" />}
                title="Nothing selected"
                description="Pick a district cluster on the geographic layer, or a state tile on the cartogram."
              />
            )}
          </Card>

          <Card className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <CardHeader
              title="Highest-risk cases in view"
              subtitle="Filtered by the bands and geography selected"
              icon={<Target className="h-4 w-4" />}
            />
            <div className="divide-y divide-line">
              {(points.data?.rows ?? []).slice(0, 7).map((c) => (
                <button
                  key={c.caseId}
                  onClick={() => navigate(`/cases/${c.caseId}`)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">
                      {c.village}, {c.district}
                    </span>
                    <span className="block truncate text-[10.5px] text-ink-3">
                      {c.stage} · {c.projectName}
                    </span>
                  </span>
                  <RiskPill level={c.riskBand} score={c.riskScore} size="sm" />
                </button>
              ))}
              {(points.data?.rows.length ?? 0) === 0 && (
                <p className="px-5 py-8 text-center text-[12px] text-ink-3">No cases in this selection.</p>
              )}
            </div>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="animate-fade-up">
          <CardHeader
            title="District risk ranking"
            subtitle={values.state === 'all' ? 'Districts with at least 30 open cases' : `Within ${values.state}`}
            icon={<Layers className="h-4 w-4" />}
            action={<DemoDataBadge className="hidden sm:inline-flex" />}
          />
          <div className="h-[320px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDistricts} layout="vertical" margin={{ top: 4, right: 30, left: 104, bottom: 0 }}>
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis
                  type="category"
                  dataKey="district"
                  tickLine={false}
                  axisLine={false}
                  width={100}
                  tick={{ fill: 'rgb(var(--c-ink-2))', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgb(var(--c-surface-2))' }}
                  content={<ChartTooltip formatter={(v) => `${v}%`} />}
                />
                <Bar
                  dataKey="riskScore"
                  name="Predicted risk"
                  radius={[0, 5, 5, 0]}
                  barSize={15}
                  animationDuration={900}
                  onClick={(d: { payload?: { key?: string } }) => {
                    const key = d?.payload?.key;
                    if (key) {
                      setSelectedDistrict(key);
                      set({ district: key });
                    }
                  }}
                >
                  {topDistricts.map((d, i) => (
                    <Cell
                      key={i}
                      fill={RISK_HEX[riskFromScore(d.riskScore)]}
                      fillOpacity={selectedDistrict && d.key !== selectedDistrict ? 0.32 : 1}
                      className="cursor-pointer"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <CardHeader
            title="High-risk clusters"
            subtitle="Project-stage cells concentrated in the current geography"
            icon={<Target className="h-4 w-4" />}
            action={
              <Link to="/queue" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
                Full queue <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {(clusters.data?.items ?? []).slice(0, 6).map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/projects/${item.projectId}`)}
                className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-[11px] font-bold text-ink-2 num">
                  {item.priorityRank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{item.projectName}</span>
                  <span className="block truncate text-[10.5px] text-ink-3">
                    {item.stage} · {item.districts.join(', ')}
                  </span>
                  <ContributorChips contributors={item.contributors} className="mt-1.5" max={2} />
                </span>
                <span className="shrink-0 text-right">
                  <RiskPill level={item.riskBand} score={item.riskScore} size="sm" />
                  <span className="mt-1 block text-[10px] text-ink-3 num">
                    {formatNumber(item.openCases)} open
                  </span>
                </span>
              </button>
            ))}
            {(clusters.data?.items.length ?? 0) === 0 && (
              <p className="px-5 py-8 text-center text-[12px] text-ink-3">No clusters in this selection.</p>
            )}
          </div>
        </Card>
      </section>

      <Card className="animate-fade-up p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-ink-3">
          <p className="label-xs">Coverage</p>
          <span>
            <span className="font-bold text-ink num">{geo.data?.states.length ?? 0}</span> states
          </span>
          <span>
            <span className="font-bold text-ink num">{geo.data?.districts.length ?? 0}</span> districts
          </span>
          <span>
            Snapshot <span className="font-bold text-ink num">{geo.data ? formatDate(geo.data.today) : '—'}</span>
          </span>
          <Badge className="ml-auto border-line bg-surface-2 text-ink-3">Schematic positions · synthetic data</Badge>
        </div>
      </Card>
    </div>
  );
}
