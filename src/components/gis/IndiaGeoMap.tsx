import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { RISK_HEX, riskFromScore } from '@/lib/risk';
import type { DistrictSummary, MapPoint, RiskLevel } from '@/data/types';

/**
 * Schematic GIS canvas.
 *
 * Coordinates are projected equirectangularly and drawn over a simplified
 * national outline. It is deliberately schematic: the corpus carries district
 * centroids with jitter, not surveyed parcel geometry, so drawing anything that
 * looked like a cadastral boundary would overstate what the data contains. A
 * production deployment would render the survey layer here instead.
 */

const LON_MIN = 67.5;
const LON_MAX = 98.5;
const LAT_MIN = 6.0;
const LAT_MAX = 37.5;
const W = 620;
const H = 640;

export const project = (lat: number, lon: number) => ({
  x: ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W,
  y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H,
});

/** Simplified national outline, used as a locator backdrop only. */
const OUTLINE: Array<[number, number]> = [
  [74.0, 34.4], [75.0, 32.8], [76.9, 32.0], [78.8, 31.2], [81.0, 30.2], [82.8, 28.4],
  [85.0, 27.5], [88.0, 26.9], [89.8, 26.1], [92.0, 27.6], [94.5, 28.0], [96.6, 28.4],
  [97.3, 27.0], [96.2, 24.5], [94.6, 22.2], [92.6, 21.9], [91.0, 22.9], [89.0, 22.1],
  [87.9, 21.5], [86.6, 20.6], [85.0, 19.6], [83.0, 17.6], [80.9, 16.0], [80.2, 13.2],
  [79.8, 10.4], [78.2, 8.9], [77.5, 8.1], [76.2, 9.6], [74.9, 12.2], [73.8, 15.6],
  [72.8, 19.1], [72.6, 21.5], [70.9, 20.9], [69.0, 22.4], [70.6, 24.3], [70.1, 26.1],
  [71.2, 27.9], [73.1, 29.6], [74.6, 31.6],
];

const outlinePath = `${OUTLINE.map(([lon, lat], i) => {
  const { x, y } = project(lat, lon);
  return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(' ')} Z`;

const GRATICULE_LON = [70, 75, 80, 85, 90, 95];
const GRATICULE_LAT = [10, 15, 20, 25, 30, 35];

export type MapMetric = 'risk' | 'volume' | 'progress';

export function IndiaGeoMap({
  districts,
  points,
  metric = 'risk',
  showPoints = true,
  selectedDistrict,
  onSelectDistrict,
  onSelectCase,
  className,
  bandFilter,
}: {
  districts: DistrictSummary[];
  points?: MapPoint[];
  metric?: MapMetric;
  showPoints?: boolean;
  selectedDistrict?: string | null;
  onSelectDistrict?: (key: string | null) => void;
  onSelectCase?: (caseId: string) => void;
  className?: string;
  bandFilter?: RiskLevel[];
}) {
  const [hovered, setHovered] = useState<DistrictSummary | null>(null);
  const [hoverPoint, setHoverPoint] = useState<MapPoint | null>(null);

  const maxCases = useMemo(() => Math.max(1, ...districts.map((d) => d.openCases)), [districts]);
  const bandSet = useMemo(() => (bandFilter && bandFilter.length ? new Set(bandFilter) : null), [bandFilter]);

  const visible = useMemo(
    () =>
      districts.filter((d) => {
        if (d.openCases === 0) return false;
        if (!bandSet) return true;
        return bandSet.has(riskFromScore(d.riskScore));
      }),
    [districts, bandSet],
  );

  const radiusFor = (d: DistrictSummary) => {
    const scale = Math.sqrt(d.openCases / maxCases);
    return 3 + scale * 15;
  };

  const fillFor = (d: DistrictSummary) => {
    if (metric === 'volume') return '#3B72F0';
    if (metric === 'progress') return RISK_HEX[riskFromScore(100 - Math.min(100, d.observedDelayRate * 160))];
    return RISK_HEX[riskFromScore(d.riskScore)];
  };

  const active = hovered ?? (selectedDistrict ? districts.find((d) => d.key === selectedDistrict) ?? null : null);

  return (
    <div className={cn('relative', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="District-level acquisition risk across India">
        <defs>
          <radialGradient id="geo-glow" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="rgb(var(--c-brand))" stopOpacity="0.07" />
            <stop offset="100%" stopColor="rgb(var(--c-brand))" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={W} height={H} fill="url(#geo-glow)" />

        {GRATICULE_LON.map((lon) => {
          const { x } = project(0, lon);
          return (
            <g key={`lon-${lon}`}>
              <line x1={x} y1={0} x2={x} y2={H} stroke="rgb(var(--c-line))" strokeWidth={0.6} strokeDasharray="3 6" />
              <text x={x + 3} y={H - 6} fontSize={8.5} fill="rgb(var(--c-ink-3))">
                {lon}°E
              </text>
            </g>
          );
        })}
        {GRATICULE_LAT.map((lat) => {
          const { y } = project(lat, 0);
          return (
            <g key={`lat-${lat}`}>
              <line x1={0} y1={y} x2={W} y2={y} stroke="rgb(var(--c-line))" strokeWidth={0.6} strokeDasharray="3 6" />
              <text x={4} y={y - 4} fontSize={8.5} fill="rgb(var(--c-ink-3))">
                {lat}°N
              </text>
            </g>
          );
        })}

        <path
          d={outlinePath}
          fill="rgb(var(--c-surface-2))"
          fillOpacity={0.85}
          stroke="rgb(var(--c-line-strong))"
          strokeWidth={1.3}
        />

        {/* Case points: the raw parcel layer, thinned server-side. */}
        {showPoints &&
          points?.map((p) => {
            const { x, y } = project(p.lat, p.lon);
            const band = (['Low', 'Medium', 'High', 'Critical'] as RiskLevel[])[p.b];
            if (bandSet && !bandSet.has(band)) return null;
            return (
              <circle
                key={p.r}
                cx={x}
                cy={y}
                r={p.b >= 2 ? 1.9 : 1.3}
                fill={RISK_HEX[band]}
                fillOpacity={p.b >= 2 ? 0.85 : 0.42}
                onMouseEnter={() => setHoverPoint(p)}
                onMouseLeave={() => setHoverPoint(null)}
                onClick={() => onSelectCase?.(p.id)}
                className={onSelectCase ? 'cursor-pointer' : undefined}
              />
            );
          })}

        {/* District clusters */}
        {visible.map((d) => {
          const { x, y } = project(d.lat, d.lon);
          const r = radiusFor(d);
          const isSelected = selectedDistrict === d.key;
          const dim = selectedDistrict !== null && selectedDistrict !== undefined && !isSelected;
          return (
            <g
              key={d.key}
              onMouseEnter={() => setHovered(d)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectDistrict?.(isSelected ? null : d.key)}
              className={cn('transition-opacity duration-300', onSelectDistrict && 'cursor-pointer', dim && 'opacity-30')}
            >
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={fillFor(d)}
                fillOpacity={0.26}
                stroke={fillFor(d)}
                strokeWidth={isSelected ? 2.4 : 1.2}
              />
              <circle cx={x} cy={y} r={Math.max(1.8, r * 0.26)} fill={fillFor(d)} />
              {isSelected && (
                <circle cx={x} cy={y} r={r + 4} fill="none" stroke={fillFor(d)} strokeWidth={1.4} opacity={0.55} className="animate-pulse" />
              )}
            </g>
          );
        })}
      </svg>

      {/* Readout */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        {(active || hoverPoint) && (
          <div className="mx-auto w-fit max-w-full animate-fade-in rounded-xl border border-line bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur">
            {hoverPoint ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <p className="font-mono text-[12px] font-bold text-ink">{hoverPoint.id}</p>
                <span className="text-[11px] text-ink-3">
                  risk{' '}
                  <span
                    className="font-bold num"
                    style={{ color: RISK_HEX[(['Low', 'Medium', 'High', 'Critical'] as RiskLevel[])[hoverPoint.b]] }}
                  >
                    {hoverPoint.s}%
                  </span>
                </span>
                <span className="text-[11px] text-ink-3">{hoverPoint.p}</span>
                <span className="text-[10.5px] text-ink-3">click to open the case</span>
              </div>
            ) : active ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <p className="text-[13px] font-bold text-ink">
                  {active.district}
                  <span className="ml-2 text-[11px] font-medium text-ink-3">{active.state}</span>
                </p>
                <span className="text-[11px] text-ink-3">
                  <span className="font-bold text-ink num">{active.openCases.toLocaleString('en-IN')}</span> open cases
                </span>
                <span className="text-[11px] text-ink-3">
                  risk{' '}
                  <span className="font-bold num" style={{ color: RISK_HEX[riskFromScore(active.riskScore)] }}>
                    {active.riskScore}%
                  </span>
                </span>
                <span className="text-[11px] text-ink-3">
                  historical delay rate{' '}
                  <span className="font-bold text-ink num">{(active.observedDelayRate * 100).toFixed(0)}%</span>
                </span>
                <span className="text-[11px] text-ink-3">
                  <span className="font-bold text-ink num">{Math.round(active.areaHa).toLocaleString('en-IN')}</span> ha
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function GeoLegend({ metric = 'risk', pointsShown }: { metric?: MapMetric; pointsShown?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {(['Low', 'Medium', 'High', 'Critical'] as RiskLevel[]).map((lvl) => (
        <span key={lvl} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: RISK_HEX[lvl] }} />
          <span className="text-[11px] font-medium text-ink-2">{lvl}</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full border border-line-strong bg-surface-2" />
        <span className="text-[11px] font-medium text-ink-3">bubble size ∝ open cases</span>
      </span>
      {pointsShown !== undefined && (
        <span className="text-[10.5px] text-ink-3">
          {pointsShown.toLocaleString('en-IN')} parcel points drawn (thinned server-side, high risk kept first)
        </span>
      )}
      <span className="ml-auto text-[10.5px] text-ink-3">
        {metric === 'volume'
          ? 'Bubbles sized by open case volume'
          : metric === 'progress'
            ? 'Shaded by historical delay rate'
            : 'Shaded by predicted delay risk'}
      </span>
    </div>
  );
}
