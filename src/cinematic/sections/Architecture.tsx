import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { Reveal, Tilt } from '../components/Interactive';
import { InApp } from '../components/InApp';

const FLOW = [
  { k: 'Data', d: 'Acquisition records, milestones, parcels, cases, compensation and R&R status arrive from source systems (synthetic here).' },
  { k: 'Validation', d: 'Schema, range and date-order checks. Failures are flagged, not silently dropped.' },
  { k: 'Features', d: 'Stage durations, idle time, unresolved-record share, dispute and R&R indicators — computed per parcel and date.' },
  { k: 'ML', d: 'A calibrated model estimates the probability of missing the next milestone.' },
  { k: 'Risk', d: 'Probability, band and trend per parcel, rolled up to project, district and state.' },
  { k: 'Explanation', d: 'Per-case contributions (SHAP / permutation importance) plus human-readable rules and data warnings.' },
  { k: 'Action', d: 'Suggested administrative checks enter an intervention queue for an officer to review.' },
];

/** What actually runs in this build (from the platform's own pipeline). */
const BUILD = [
  { k: 'Data layer', items: ['Land records, notifications, awards, court and clearance data through provider contracts', 'Synthetic adapters today'] },
  { k: 'Validation & features', items: ['Completeness scoring', 'Field-gap audit', 'Schedule-versus-progress signals'] },
  { k: 'Prediction', items: ['Gradient-boosted ensemble', 'Time-aware split', 'Benchmarked against a baseline'] },
  { k: 'Explanation', items: ['Per-case SHAP contributions', 'Grouped into factors a reviewer recognises'] },
  { k: 'Human decision', items: ['A named owner accepts, escalates or closes each intervention, with a note', 'The platform decides nothing'] },
];

const ARCH = [
  { k: 'Data sources', items: ['Synthetic / demo acquisition records', 'Project milestones', 'Parcel / GIS data', 'Legal-dispute indicators', 'Compensation / R&R status'] },
  { k: 'Data validation', items: ['Schema & type checks', 'Date-order consistency', 'Missing-data flags'] },
  { k: 'PostgreSQL + PostGIS', items: ['Versioned case records', 'Parcel & corridor geometry', 'Spatial joins'] },
  { k: 'ML service', items: ['Logistic regression', 'Random forest / XGBoost', 'Probability calibration'] },
  { k: 'Explainability', items: ['SHAP / permutation importance', 'Human-readable rules', 'Data-quality warnings'] },
  { k: 'FastAPI', items: ['Scoped REST API', 'Model & data version on every score', 'Audit hooks'] },
  { k: 'React dashboard', items: ['GIS (MapLibre / Leaflet)', 'Risk · Timeline · Alerts', 'Intervention queue'] },
];

function FlowStrip() {
  const [hover, setHover] = useState<number | null>(null);
  const reduced = useStore((s) => s.reduced);
  const svg = useRef<SVGSVGElement>(null);
  const hoverRef = useRef<number | null>(null);
  hoverRef.current = hover;
  useEffect(() => {
    const g = svg.current!.querySelector('#particles')!;
    const N = 26;
    const dots: { t: number; s: number; el: SVGCircleElement }[] = [];
    for (let i = 0; i < N; i++) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('r', '2.6');
      g.appendChild(el);
      dots.push({ t: i / N, s: 0.05 + Math.random() * 0.03, el });
    }
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      dots.forEach((d) => {
        if (!reduced && hoverRef.current == null) d.t = (d.t + dt * d.s) % 1;
        const x = 40 + d.t * 920;
        const seg = Math.min(6, Math.floor(d.t * 7));
        const y = 50 + Math.sin(d.t * 40 + d.s * 100) * 6;
        d.el.setAttribute('cx', String(x));
        d.el.setAttribute('cy', String(y));
        const warm = seg >= 4;
        d.el.setAttribute('fill', warm ? (seg === 4 ? '#e0612f' : '#e1a43c') : '#9fd3df');
        d.el.setAttribute('opacity', hoverRef.current == null || hoverRef.current === seg ? '0.95' : '0.25');
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      dots.forEach((d) => d.el.remove());
    };
  }, [reduced]);
  return (
    <div className="pe">
      <svg ref={svg} viewBox="0 0 1000 100" className="w-full" role="img" aria-label="Data flows from data, through validation, features, ML, risk and explanation, to action">
        <line x1="40" y1="50" x2="960" y2="50" stroke="rgba(159,211,223,0.2)" />
        <g id="particles" />
        {FLOW.map((f, i) => {
          const x = 40 + (i + 0.5) * (920 / 7);
          return (
            <g key={f.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              <circle cx={x} cy={50} r={hover === i ? 11 : 7} fill="#05070a" stroke={i >= 4 ? '#e1a43c' : '#72b8c8'} strokeWidth="1.5" style={{ transition: 'r .3s' }} />
              <text x={x} y={86} textAnchor="middle" fill={hover === i ? '#fff' : '#98a6b1'} style={{ font: '600 11px JetBrains Mono, monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {f.k}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-1.5 md:hidden">
        {FLOW.map((f, i) => (
          <button key={f.k} className="seg-btn !py-1 !text-[11px]" aria-pressed={hover === i} onClick={() => setHover(hover === i ? null : i)}>
            {f.k}
          </button>
        ))}
      </div>
      <p className="mx-auto mt-3 min-h-[48px] max-w-[640px] text-center text-[14px] leading-relaxed text-mist-200" aria-live="polite">
        {hover != null ? (
          <>
            <b className="text-mist-50">{FLOW[hover].k}.</b> {FLOW[hover].d}
          </>
        ) : (
          <span className="text-mist-400">Hover a stage to pause the flow and see what happens there.</span>
        )}
      </p>
    </div>
  );
}

export function Architecture() {
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<'build' | 'proposed'>('build');
  const cols = view === 'build' ? BUILD : ARCH;
  return (
    <section id="architecture" className="relative py-28 md:py-36" aria-labelledby="arch-title">
      <div className="absolute inset-0 bg-cine-950/75" />
      <div className="relative mx-auto max-w-content px-4 md:px-8">
        <Reveal className="max-w-[720px]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="cine-eyebrow">Data → ML → Risk → Action</p>
            <span className="tag">{view === 'build' ? 'This build' : 'Proposed architecture'}</span>
          </div>
          <h2 id="arch-title" className="h-section mt-3">
            Watch the system work.
          </h2>
          <p className="lede mt-4">
            Dashboard scores come from the platform&rsquo;s own pipeline; the illustrative scene on this page runs the same flow in your browser. Both use synthetic
            data.
          </p>
          <InApp to="/data-sources" className="mt-5">
            Data sources — each adapter, its contract and what it feeds
          </InApp>
        </Reveal>
        <div className="mt-12">
          <FlowStrip />
        </div>
        <div className="pe mt-14 flex gap-1.5" role="tablist" aria-label="Architecture view">
          <button role="tab" aria-selected={view === 'build'} className="seg-btn" onClick={() => setView('build')}>
            Under the hood · this build
          </button>
          <button role="tab" aria-selected={view === 'proposed'} className="seg-btn" onClick={() => setView('proposed')}>
            Proposed production stack
          </button>
        </div>
        <div className={`mt-5 grid gap-3 sm:grid-cols-2 ${view === 'build' ? 'lg:grid-cols-5' : 'lg:grid-cols-7'}`}>
          {cols.map((a, i) => (
            <Reveal key={a.k} delay={i * 60}>
              <Tilt className="h-full">
                <div
                  className={`pe panel relative h-full p-4 transition-colors ${hover === i ? '!border-gis-400/50' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <p className="font-mono text-[10px] text-mist-500">{String(i + 1).padStart(2, '0')}</p>
                  <p className="mt-1 font-grotesk text-[14px] font-semibold uppercase tracking-[0.06em] text-mist-50">{a.k}</p>
                  <ul className="mt-3 space-y-1.5">
                    {a.items.map((it) => (
                      <li key={it} className="text-[12.5px] leading-snug text-mist-300">
                        {it}
                      </li>
                    ))}
                  </ul>
                  {i < cols.length - 1 && (
                    <svg className="absolute -right-3 top-1/2 hidden h-2 w-3 lg:block" viewBox="0 0 12 8" aria-hidden="true">
                      <line x1="0" y1="4" x2="12" y2="4" stroke="#72b8c8" className="flow-dash" />
                    </svg>
                  )}
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
