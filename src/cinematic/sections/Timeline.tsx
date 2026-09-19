import { InApp } from '../components/InApp';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { world, stageDistribution } from '../lib/dataset';
import { TODAY, DAY_MAX, stageAt } from '../lib/world';
import { STAGES, STAGE_DOCS, COMPLETE } from '../lib/stages';
import { score } from '../lib/model';
import { STAGE_RAMP } from '../lib/palette';

/** Median entry day of each stage across right-of-way parcels (data-driven marker positions). */
const MEDIANS = STAGES.map((_, k) => {
  const d = world.row
    .filter((p) => p.acq!.entries[k + 1] > p.acq!.entries[k])
    .map((p) => p.acq!.entries[k])
    .sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)] ?? 0;
});

export function Timeline() {
  const day = useStore((s) => s.day);
  const set = useStore((s) => s.set);
  const reduced = useStore((s) => s.reduced);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const dragging = useRef(false);

  const setDay = (d: number) => set({ day: Math.round(Math.max(0, Math.min(DAY_MAX, d))) });
  const fromX = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    setDay(((x - r.left) / r.width) * DAY_MAX);
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const d = useStore.getState().day + dt * 90;
      if (d >= DAY_MAX) {
        setDay(DAY_MAX);
        setPlaying(false);
        return;
      }
      setDay(d);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const dist = useMemo(() => stageDistribution(world.row, day), [day]);
  const stats = useMemo(() => {
    let open = 0;
    let high = 0;
    for (const p of world.row) {
      if (stageAt(p, day) >= COMPLETE) continue;
      open++;
      const s = score(p, day);
      if (s && s.p >= 0.55) high++;
    }
    return { open, high, done: world.row.length - open };
  }, [day]);
  const head = MEDIANS.reduce((acc, m, k) => (m <= day ? k : acc), 0);
  const total = world.row.length;

  return (
    <section id="timeline" className="relative min-h-[100svh]" aria-labelledby="tl-title">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-cine-950/90 to-transparent" />
      <div className="scrim-bottom absolute inset-x-0 bottom-0 h-[55%]" />
      <div className="relative mx-auto flex min-h-[100svh] max-w-content flex-col justify-between px-4 pb-8 pt-24 md:px-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row">
          <div className="max-w-[520px]">
            <p className="cine-eyebrow">Acquisition timeline</p>
            <h2 id="tl-title" className="h-section mt-3 !text-[clamp(1.9rem,3.8vw,3.4rem)]">
              Drag through the lifecycle.
            </h2>
            <p className="lede mt-3">The land updates as you move: parcel stages, risk, and which records matter at each point.</p>
            <InApp to="/trends" className="mt-4">
              Trends &amp; KPIs — how delay and risk move month by month
            </InApp>
          </div>
          <div className="pe panel w-full max-w-[300px] self-start p-4" aria-live="polite">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist-400">Records at this stage</p>
            <p className="mt-1 font-grotesk text-lg font-semibold text-mist-50">{STAGES[head]}</p>
            <ul className="mt-2 space-y-1">
              {STAGE_DOCS[head].map((d) => (
                <li key={`${head}-${d}`} className="fx-in flex items-center gap-2 text-[12.5px] text-mist-200">
                  <span className="h-3 w-2.5 rounded-[2px] border border-gis-400/60" aria-hidden="true" /> {d}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-mist-500">Generic record types, not a specific statute.</p>
          </div>
        </div>

        <div className="pe">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <p className="font-grotesk text-4xl font-semibold tracking-[-0.02em] text-mist-50">Day {day}</p>
              {day > TODAY ? (
                <span className="tag tag-warn">Beyond snapshot · simulated projection</span>
              ) : day === TODAY ? (
                <span className="tag">Snapshot day</span>
              ) : (
                <span className="tag">Recorded history (synthetic)</span>
              )}
            </div>
            <div className="flex gap-5 text-[12.5px] text-mist-300">
              <span>
                <b className="font-grotesk text-lg text-mist-50">{stats.open}</b> open
              </span>
              <span>
                <b className="font-grotesk text-lg text-[#ff9b6a]">{stats.high}</b> high risk
              </span>
              <span>
                <b className="font-grotesk text-lg text-[#8fd1ae]">{stats.done}</b> handed over
              </span>
            </div>
          </div>

          <div className="mb-3 flex h-2 overflow-hidden rounded-full" aria-label="Stage distribution" role="img">
            {dist.map((n, k) =>
              n ? <div key={k} title={`${k === COMPLETE ? 'Handed over' : STAGES[k]}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: STAGE_RAMP[k] }} className="transition-[width] duration-300" /> : null,
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              className="btn btn-ghost !h-11 !w-11 shrink-0 !p-0"
              aria-label={playing ? 'Pause' : 'Play timeline'}
              onClick={() => {
                if (!playing && day >= DAY_MAX) setDay(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <div
              ref={track}
              role="slider"
              tabIndex={0}
              aria-label="Project day"
              aria-valuemin={0}
              aria-valuemax={DAY_MAX}
              aria-valuenow={day}
              aria-valuetext={`Day ${day}, ${STAGES[head]}`}
              data-cursor="drag"
              className="relative h-16 flex-1 touch-none select-none"
              onPointerDown={(e) => {
                dragging.current = true;
                setPlaying(false);
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                fromX(e.clientX);
              }}
              onPointerMove={(e) => dragging.current && fromX(e.clientX)}
              onPointerUp={() => (dragging.current = false)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 60 : 10;
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setDay(day + step);
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setDay(day - step);
                else if (e.key === 'PageUp') setDay(day + 90);
                else if (e.key === 'PageDown') setDay(day - 90);
                else if (e.key === 'Home') setDay(0);
                else if (e.key === 'End') setDay(DAY_MAX);
                else return;
                e.preventDefault();
              }}
            >
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
              <div className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-gis-400" style={{ width: `${(day / DAY_MAX) * 100}%` }} />
              <div className="absolute top-1/2 h-6 w-px -translate-y-1/2 bg-[#f0c77f]" style={{ left: `${(TODAY / DAY_MAX) * 100}%` }} aria-hidden="true">
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#f0c77f]">
                  Snapshot
                </span>
              </div>
              {MEDIANS.map((m, k) => (
                <button
                  key={k}
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setPlaying(false);
                    setDay(m + 1);
                  }}
                  className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(m / DAY_MAX) * 100}%` }}
                  aria-hidden="true"
                >
                  <span
                    className={`block rounded-full border transition-all duration-300 ${
                      k <= head ? 'h-3 w-3 border-transparent bg-mist-50' : 'h-2.5 w-2.5 border-white/40 bg-cine-900'
                    } ${k === head ? '!h-4 !w-4 shadow-[0_0_0_4px_rgba(114,184,200,0.25)]' : ''}`}
                  />
                </button>
              ))}
              <div className="absolute top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-mist-50 shadow-[0_0_14px_rgba(227,234,238,0.7)]" style={{ left: `${(day / DAY_MAX) * 100}%` }} aria-hidden="true" />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1 md:grid-cols-12" role="group" aria-label="Jump to a stage">
            {STAGES.map((st, k) => (
              <button
                key={st}
                onClick={() => {
                  setPlaying(false);
                  setDay(MEDIANS[k] + 1);
                }}
                className={`truncate rounded-md px-1 py-1.5 text-center font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors ${
                  k === head ? 'bg-mist-50 text-cine-950' : k < head ? 'text-gis-300 hover:bg-white/5' : 'text-mist-500 hover:bg-white/5 hover:text-mist-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-mist-500">
            {reduced ? 'Use arrow keys to step through days. ' : 'Drag the playhead or use arrow keys. '}Markers sit at each stage's median start day across the corridor.
          </p>
        </div>
      </div>
    </section>
  );
}
