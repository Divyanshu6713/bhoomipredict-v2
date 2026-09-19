/**
 * Overview card: the portfolio in scope as a slowly turning 3D relief of India.
 * Uses the dashboard's own State figures, so it always matches the bar chart
 * beside it; clicking a State focuses the whole overview on it.
 */
import { useMemo } from 'react';
import IndiaMap3D from './IndiaMap3D';
import { useApi } from '@/hooks';
import { fetchBoundaries, fetchProjectMap } from '@/api/client';
import type { GroupRisk } from '@/data/types';
import type { MapStateStat } from '@/components/gis/IndiaGISMap';

export default function PortfolioRelief3D({
  stateRisk,
  selectedState,
  onSelectState,
  height = 380,
}: {
  stateRisk: GroupRisk[];
  selectedState: string | null;
  onSelectState: (state: string | null) => void;
  height?: number;
}) {
  const states = useApi((signal) => fetchBoundaries('states', undefined, signal), []);
  const projects = useApi((signal) => fetchProjectMap(signal), []);
  const stateStats = useMemo(
    () => new Map<string, MapStateStat>(stateRisk.map((r) => [r.key, { state: r.key, projects: r.projects, avgRisk: r.avgRisk, highOrCritical: r.highRisk + r.critical }])),
    [stateRisk],
  );
  const inScope = useMemo(
    () => (projects.data?.projects ?? []).filter((p) => stateStats.has(p.state) && (!selectedState || p.state === selectedState)),
    [projects.data, stateStats, selectedState],
  );
  return (
    <IndiaMap3D
      compact
      states={states.data}
      projects={inScope}
      stateStats={stateStats}
      selectedState={selectedState}
      onSelectState={onSelectState}
      height={height}
    />
  );
}
