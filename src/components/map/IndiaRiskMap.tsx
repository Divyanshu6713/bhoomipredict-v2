import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { RISK_HEX, riskFromScore } from '@/lib/risk';
import { STATE_TILES } from '@/data/geo';
import { formatCompact } from '@/lib/format';
import type { StateSummary } from '@/data/types';

const CELL = 46;
const GAP = 5;
const COLS = 11;
const ROWS = 9;
const PAD = 10;
const W = COLS * (CELL + GAP) + PAD * 2;
const H = ROWS * (CELL + GAP) + PAD * 2;

export type TileMetric = 'risk' | 'cases' | 'delay';

/**
 * Tile cartogram of India.
 *
 * Kept alongside the geographic layer because triage decisions depend on
 * comparing states, not on their shape: every state stays equally legible and
 * clickable here, including the small ones a true choropleth would hide.
 */
export function IndiaRiskMap({
  states,
  selected,
  onSelect,
  className,
  metric = 'risk',
}: {
  states: StateSummary[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  className?: string;
  metric?: TileMetric;
}) {
  const [hovered, setHovered] = useState<StateSummary | null>(null);

  const byName = useMemo(() => new Map(states.map((s) => [s.state, s])), [states]);
  const maxCases = useMemo(() => Math.max(1, ...states.map((s) => s.openCases)), [states]);

  const opacityFor = (s: StateSummary | undefined) => {
    if (!s) return 1;
    if (metric === 'cases') return 0.3 + (s.openCases / maxCases) * 0.7;
    if (metric === 'delay') return 0.35 + Math.min(1, s.observedDelayRate / 0.7) * 0.65;
    return 0.45 + (s.riskScore / 100) * 0.55;
  };

  const active = hovered ?? (selected ? byName.get(selected) ?? null : null);

  return (
    <div className={cn('relative', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="State-wise land acquisition risk across India">
        {STATE_TILES.map((tile) => {
          const stat = byName.get(tile.name);
          const isSelected = selected === tile.name;
          const isDim = selected !== null && !isSelected;
          const interactive = Boolean(stat && stat.openCases > 0);
          const x = PAD + tile.col * (CELL + GAP);
          const y = PAD + tile.row * (CELL + GAP);

          return (
            <g
              key={tile.code}
              transform={`translate(${x} ${y})`}
              onMouseEnter={() => stat && setHovered(stat)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => interactive && onSelect(isSelected ? null : tile.name)}
              className={cn(
                'transition-opacity duration-300',
                interactive ? 'cursor-pointer' : 'cursor-default',
                isDim && 'opacity-35',
              )}
            >
              <rect
                width={CELL}
                height={CELL}
                rx={9}
                fill={stat ? RISK_HEX[riskFromScore(stat.riskScore)] : 'rgb(var(--c-surface-3))'}
                fillOpacity={opacityFor(stat)}
                stroke={isSelected ? 'rgb(var(--c-ink))' : 'rgba(255,255,255,0.25)'}
                strokeWidth={isSelected ? 2.4 : 1}
                className="transition-all duration-200"
              />
              <text
                x={CELL / 2}
                y={CELL / 2 - 3}
                textAnchor="middle"
                className="pointer-events-none select-none font-bold"
                fontSize="12.5"
                fill={stat ? '#fff' : 'rgb(var(--c-ink-3))'}
              >
                {tile.code}
              </text>
              {stat && (
                <text
                  x={CELL / 2}
                  y={CELL / 2 + 11}
                  textAnchor="middle"
                  className="pointer-events-none select-none font-semibold"
                  fontSize="9.5"
                  fill="rgba(255,255,255,0.82)"
                >
                  {metric === 'cases'
                    ? formatCompact(stat.openCases)
                    : metric === 'delay'
                      ? `${(stat.observedDelayRate * 100).toFixed(0)}%`
                      : `${stat.riskScore}%`}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        {active && (
          <div className="mx-auto w-fit max-w-full animate-fade-in rounded-xl border border-line bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <p className="text-[13px] font-bold text-ink">{active.state}</p>
              <span className="text-[11px] text-ink-3">
                <span className="font-bold text-ink num">{active.projects}</span> projects
              </span>
              <span className="text-[11px] text-ink-3">
                <span className="font-bold text-ink num">{formatCompact(active.openCases)}</span> open cases
              </span>
              <span className="text-[11px] text-ink-3">
                risk{' '}
                <span className="font-bold num" style={{ color: RISK_HEX[active.riskBand] }}>
                  {active.riskScore}%
                </span>
              </span>
              <span className="text-[11px] text-ink-3">
                observed delay rate <span className="font-bold text-ink num">{(active.observedDelayRate * 100).toFixed(0)}%</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MapLegend({ metric = 'risk' }: { metric?: TileMetric }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {(['Low', 'Medium', 'High', 'Critical'] as const).map((lvl) => (
        <div key={lvl} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px]" style={{ background: RISK_HEX[lvl] }} />
          <span className="text-[11px] font-medium text-ink-2">{lvl}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[4px] bg-surface-3 ring-1 ring-line" />
        <span className="text-[11px] font-medium text-ink-3">No monitored projects</span>
      </div>
      <span className="ml-auto text-[10.5px] text-ink-3">
        Shade intensity ∝{' '}
        {metric === 'cases' ? 'open case volume' : metric === 'delay' ? 'observed delay rate' : 'predicted risk'}
      </span>
    </div>
  );
}
