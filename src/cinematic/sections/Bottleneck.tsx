import { InApp } from '../components/InApp';
import { useLiveValue } from '../hooks/useLiveValue';
import { live } from '../lib/store';
import { world, today, clusterParcels } from '../lib/dataset';
import { X_MIN, X_MAX } from '../lib/world';

const REVEALS = [
  'High-risk clusters',
  'Incomplete corridor segments',
  'Parcels blocking construction work fronts',
  'Environmental overlaps (riverine land)',
  'Ownership / litigation concentrations',
  'Geographic hotspots',
];

export function Bottleneck() {
  const p = useLiveValue(() => Math.round(live.progress.bottleneck * 200) / 200);
  const scanned = Math.max(0, Math.min(1, (p - 0.06) / 0.52));
  const scanX = X_MIN + (X_MAX - X_MIN) * scanned;
  const seen = world.row.filter((q) => q.cx <= scanX);
  const flagged = seen.filter((q) => today[q.idx].band === 'high').length;
  const watch = seen.filter((q) => today[q.idx].band === 'medium').length;
  const phase = p < 0.06 ? 0 : p < 0.56 ? 1 : p < 0.72 ? 2 : 3;
  return (
    <section id="bottleneck" data-pinned="true" className="relative" style={{ height: '320vh' }} aria-labelledby="bn-title">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="scrim-left absolute inset-0 hidden md:block" />
        <div className="scrim-bottom absolute inset-x-0 bottom-0 h-1/2 md:hidden" />
        <div className="relative mx-auto flex h-full max-w-content items-end px-4 pb-10 md:items-center md:px-8 md:pb-0">
          <div className="max-w-[440px]">
            <p className="cine-eyebrow">Early warning</p>
            <h2 id="bn-title" className="h-section mt-3">
              See the risk before the delay.
            </h2>
            <InApp to="/map" className="mt-4">
              Risk map — where high-risk parcels cluster, State to district
            </InApp>
            <div className="panel mt-7 p-5" aria-live="polite">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-400">
                {phase === 0 && 'Corridor · as recorded'}
                {phase === 1 && 'Scanning corridor…'}
                {phase === 2 && 'Cluster detected'}
                {phase === 3 && 'Potential bottleneck'}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="font-grotesk text-2xl font-semibold text-mist-50">{seen.length}</p>
                  <p className="text-[11.5px] text-mist-400">parcels scanned</p>
                </div>
                <div>
                  <p className="font-grotesk text-2xl font-semibold text-[#f0c77f]">{watch}</p>
                  <p className="text-[11.5px] text-mist-400">medium</p>
                </div>
                <div>
                  <p className="font-grotesk text-2xl font-semibold text-[#ff9b6a]">{flagged}</p>
                  <p className="text-[11.5px] text-mist-400">high risk</p>
                </div>
              </div>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gis-400 transition-[width] duration-150" style={{ width: `${scanned * 100}%` }} />
              </div>
              {phase >= 2 && (
                <p className="fx-in mt-4 text-[14px] text-mist-100">
                  {clusterParcels.length} high-risk parcels are adjacent on work front C3.
                  {phase === 3 && ' Work on that construction front may be held until they clear.'}
                </p>
              )}
            </div>
            <p className="mt-6 font-grotesk text-[clamp(1.1rem,1.6vw,1.35rem)] leading-snug text-mist-100">
              A single unresolved parcel can affect the larger project workflow.
            </p>
            <ul className="mt-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="What GIS reveals that tables hide">
              {REVEALS.map((r, i) => {
                const on = p > 0.1 + i * 0.1;
                return (
                  <li key={r} className={`flex items-center gap-2 text-[12.5px] transition-all duration-500 ${on ? 'text-mist-200 opacity-100' : 'text-mist-500 opacity-40'}`}>
                    <span className={`h-1 w-1 rounded-full ${on ? 'bg-gis-400' : 'bg-mist-500'}`} />
                    {r}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
