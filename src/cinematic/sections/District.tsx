import { InApp } from '../components/InApp';
import { useLiveValue } from '../hooks/useLiveValue';
import { live } from '../lib/store';
import { hero, today, world, openCases, highCases, segmentsToday, districts, stateTotals, stageDistribution, clusterParcels, PROJECT_NAME } from '../lib/dataset';
import { TODAY } from '../lib/world';
import { STAGE_RAMP, pct } from '../lib/palette';
import { phaseLabel } from '../lib/stages';
import { CountUp } from '../components/Interactive';

const LEVELS = ['Parcel', 'Project', 'District', 'State'];
const home = districts.find((d) => d.isHome)!;
const dist = stageDistribution(world.row, TODAY);

function Spark({ values }: { values: number[] }) {
  const w = 160;
  const h = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#e1a43c" strokeWidth="1.5" />
    </svg>
  );
}

function Stat({ v, l, tone }: { v: number; l: string; tone?: string }) {
  return (
    <div>
      <CountUp value={v} className={`block font-grotesk text-3xl font-semibold tracking-[-0.02em] ${tone ?? 'text-mist-50'}`} />
      <span className="text-[12px] text-mist-400">{l}</span>
    </div>
  );
}

export function District() {
  const level = useLiveValue(() => Math.min(3, Math.floor(live.progress.district * 4 * 0.999)));
  const hs = today[hero.idx].score!;
  const blocked = segmentsToday.filter((s) => s.share < 0.8).length;
  return (
    <section id="district" data-pinned="true" className="relative" style={{ height: '360vh' }} aria-labelledby="dist-title">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="scrim-left absolute inset-0 hidden md:block" />
        <div className="scrim-bottom absolute inset-x-0 bottom-0 h-[55%] md:hidden" />
        <div className="relative mx-auto flex h-full max-w-content items-end px-4 pb-10 md:items-center md:px-8 md:pb-0">
          <div className="max-w-[440px]">
            <p className="cine-eyebrow">Zoom out</p>
            <h2 id="dist-title" className="sr-only">
              From parcel to state
            </h2>
            <InApp to="/hierarchy" className="mt-3">
              Portfolio — drill from the nation to your district
            </InApp>
            <ol className="mt-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em]" aria-label="Zoom level">
              {LEVELS.map((l, i) => (
                <li key={l} className="flex items-center gap-2" aria-current={i === level ? 'step' : undefined}>
                  <span className={i === level ? 'text-mist-50' : i < level ? 'text-gis-400' : 'text-mist-500'}>{l}</span>
                  {i < 3 && <span className="text-mist-600">→</span>}
                </li>
              ))}
            </ol>
            <div key={level} className="fx-in mt-6" aria-live="polite">
              {level === 0 && (
                <>
                  <p className="h-section">Parcel {hero.id}</p>
                  <p className="lede mt-3">
                    {pct(hs.p)} risk · {phaseLabel(hs.stage)} · {hero.areaHa.toFixed(2)} ha. One parcel — one line in a register.
                  </p>
                </>
              )}
              {level === 1 && (
                <>
                  <p className="h-section">{PROJECT_NAME}</p>
                  <div className="mt-6 grid grid-cols-2 gap-5">
                    <Stat v={openCases.length} l="active cases" />
                    <Stat v={highCases.length} l="high risk" tone="text-[#ff9b6a]" />
                    <Stat v={1} l="high-risk cluster (C3)" />
                    <Stat v={blocked} l="work fronts waiting on land" tone="text-[#f0c77f]" />
                  </div>
                  <p className="mt-4 text-[13px] text-mist-400">{clusterParcels.length} of the high-risk parcels sit together on one work front.</p>
                </>
              )}
              {level === 2 && (
                <>
                  <p className="h-section">District D-07</p>
                  <div className="mt-6 grid grid-cols-2 gap-5">
                    <Stat v={home.activeCases} l="active cases" />
                    <Stat v={home.highRisk} l="high risk" tone="text-[#ff9b6a]" />
                    <Stat v={home.unresolved} l="unresolved cases" />
                    <Stat v={home.constructionDeps} l="construction dependencies" tone="text-[#f0c77f]" />
                  </div>
                  <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">Stage distribution · this project</p>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                    {dist.map((n, k) => (n ? <div key={k} style={{ width: `${(n / world.row.length) * 100}%`, background: STAGE_RAMP[k] }} /> : null))}
                  </div>
                  <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">Risk trend · 12 months</p>
                  <Spark values={home.trend} />
                </>
              )}
              {level === 3 && (
                <>
                  <p className="h-section">State view</p>
                  <div className="mt-6 grid grid-cols-2 gap-5">
                    <Stat v={stateTotals.active} l="active cases" />
                    <Stat v={stateTotals.high} l="high risk" tone="text-[#ff9b6a]" />
                    <Stat v={stateTotals.clusters} l="high-risk clusters" />
                    <Stat v={districts.length} l="districts (schematic)" />
                  </div>
                  <p className="mt-4 text-[13px] text-mist-400">Columns rise with each district's risk index. Signals mark where attention is needed.</p>
                </>
              )}
            </div>
            <p className="mt-8 text-[11.5px] text-mist-500">
              Synthetic roll-up. The hex grid is a schematic layout, not an administrative boundary map.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
