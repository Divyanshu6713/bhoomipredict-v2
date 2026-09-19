import { InApp } from '../components/InApp';
import { useEffect, useMemo, useRef, useState } from 'react';
import { openCases, today, hero } from '../lib/dataset';
import { useStore } from '../lib/store';
import { MODEL_VERSION, type FeatureKey } from '../lib/model';
import { CHECK_FOR } from '../lib/parcelInfo';
import { pct, riskColor, fmtC } from '../lib/palette';
import { CountUp, Reveal } from '../components/Interactive';

const INPUTS: { label: string; keys: FeatureKey[]; note?: string }[] = [
  { label: 'Project type', keys: ['ptype'] },
  { label: 'Land area', keys: ['area'] },
  { label: 'Affected families', keys: ['families'] },
  { label: 'Compensation status', keys: ['comp'] },
  { label: 'Approval timelines', keys: ['notif', 'idle'] },
  { label: 'Legal disputes', keys: ['legal'] },
  { label: 'Possession status', keys: [], note: 'Defines the milestone being predicted' },
  { label: 'R&R progress', keys: ['rr'] },
  { label: 'Stakeholder responsiveness', keys: ['response', 'objections'] },
  { label: 'Historical performance', keys: ['hist'] },
  { label: 'Ownership records', keys: ['owner'] },
];

const pick = (target: number) =>
  [...openCases].filter((p) => p !== hero).sort((a, b) => Math.abs(today[a.idx].score!.p - target) - Math.abs(today[b.idx].score!.p - target))[0];
const CASES = [hero, pick(0.42), pick(0.1)];

interface Particle {
  i: number; // stream index (-1 = model→output)
  t: number;
  speed: number;
}

export function AIFlow() {
  const [caseIdx, setCaseIdx] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [runId, setRunId] = useState(0);
  const reduced = useStore((s) => s.reduced);
  const parcel = CASES[caseIdx];
  const sc = today[parcel.idx].score!;
  const rows = useMemo(
    () =>
      INPUTS.map((inp) => {
        const rs = sc.rows.filter((r) => inp.keys.includes(r.key));
        return {
          ...inp,
          c: rs.reduce((a, r) => a + r.contribution, 0),
          value: inp.keys.length ? rs.map((r) => r.display).join(' · ') : inp.note!,
        };
      }),
    [sc],
  );
  const top = sc.rows.filter((r) => r.contribution > 0.05).slice(0, 3);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const inRefs = useRef<(HTMLDivElement | null)[]>([]);
  const modelRef = useRef<HTMLDivElement>(null);
  const liveModel = useStore((s) => s.summary?.model.version ?? s.summary?.model.deployed ?? null);
  const outRef = useRef<HTMLDivElement>(null);
  const state = useRef({ hover: null as number | null, rows, p: sc.p, burst: 0 });
  state.current.hover = hover;
  state.current.rows = rows;
  state.current.p = sc.p;

  useEffect(() => {
    state.current.burst = 1;
  }, [runId, caseIdx]);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);
    type Pt = [number, number];
    let geo: { a: Pt[]; m: Pt; mr: Pt; o: Pt; w: number; h: number } | null = null;
    const measure = () => {
      const w = wrap.current!;
      const r = w.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rel = (el: HTMLElement, side: 'l' | 'r') => {
        const b = el.getBoundingClientRect();
        return [side === 'r' ? b.right - r.left : b.left - r.left, b.top - r.top + b.height / 2] as [number, number];
      };
      geo = {
        a: inRefs.current.map((el) => (el ? rel(el, 'r') : [0, 0])),
        m: rel(modelRef.current!, 'l'),
        mr: rel(modelRef.current!, 'r'),
        o: rel(outRef.current!, 'l'),
        w: r.width,
        h: r.height,
      };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap.current!);
    const parts: Particle[] = [];
    let last = performance.now();
    const bez = (a: [number, number], b: [number, number], t: number): [number, number] => {
      const cx = (a[0] + b[0]) / 2;
      const u = 1 - t;
      const x = u * u * u * a[0] + 3 * u * u * t * cx + 3 * u * t * t * cx + t * t * t * b[0];
      const y = u * u * u * a[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * b[1];
      return [x, y];
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || !geo || geo.w < 900) {
        ctx.clearRect(0, 0, cv.width, cv.height);
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = state.current;
      const mr = geo.mr;
      ctx.clearRect(0, 0, geo.w, geo.h);
      const maxC = Math.max(0.2, ...st.rows.map((r) => Math.abs(r.c)));
      // curves
      st.rows.forEach((r, i) => {
        const a = geo!.a[i];
        const b: [number, number] = [geo!.m[0], geo!.m[1] + (i - (st.rows.length - 1) / 2) * 6];
        const dim = st.hover != null && st.hover !== i;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.bezierCurveTo((a[0] + b[0]) / 2, a[1], (a[0] + b[0]) / 2, b[1], b[0], b[1]);
        const strength = Math.abs(r.c) / maxC;
        ctx.strokeStyle = r.keys.length === 0 ? 'rgba(141,155,166,0.15)' : `rgba(114,184,200,${dim ? 0.05 : 0.1 + strength * 0.25})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        // spawn
        if (!reduced && r.keys.length) {
          const rate = (0.4 + strength * 4) * (1 + st.burst * 4);
          if (Math.random() < rate * dt) parts.push({ i, t: 0, speed: 0.55 + Math.random() * 0.35 });
        }
      });
      // model → output
      ctx.beginPath();
      ctx.moveTo(mr[0], mr[1]);
      ctx.bezierCurveTo((mr[0] + geo.o[0]) / 2, mr[1], (mr[0] + geo.o[0]) / 2, geo.o[1], geo.o[0], geo.o[1]);
      ctx.strokeStyle = 'rgba(224,97,47,0.35)';
      ctx.stroke();
      if (!reduced && Math.random() < (1 + st.p * 6) * (1 + st.burst * 3) * dt) parts.push({ i: -1, t: 0, speed: 0.7 });
      st.burst = Math.max(0, st.burst - dt * 0.8);
      // particles
      for (let k = parts.length - 1; k >= 0; k--) {
        const q = parts[k];
        q.t += dt * q.speed;
        if (q.t >= 1) {
          parts.splice(k, 1);
          continue;
        }
        let pos: [number, number];
        let col: string;
        if (q.i === -1) {
          pos = bez(mr, geo.o, q.t);
          col = 'rgba(255,155,106,';
        } else {
          const r = st.rows[q.i];
          const a = geo.a[q.i];
          const b: [number, number] = [geo.m[0], geo.m[1] + (q.i - (st.rows.length - 1) / 2) * 6];
          pos = bez(a, b, q.t);
          col = r.c > 0.05 ? 'rgba(240,199,127,' : r.c < -0.05 ? 'rgba(114,184,200,' : 'rgba(160,170,178,';
          if (st.hover != null && st.hover !== q.i) col = 'rgba(120,130,140,';
        }
        const alpha = Math.sin(q.t * Math.PI);
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], q.i === -1 ? 2.4 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `${col}${alpha})`;
        ctx.fill();
      }
      if (parts.length > 500) parts.splice(0, parts.length - 500);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [reduced]);

  return (
    <section id="ai" className="relative min-h-[100svh] py-24 md:py-28" aria-labelledby="ai-title">
      <div className="absolute inset-0 bg-cine-950/70" />
      <div className="relative mx-auto max-w-content px-4 md:px-8">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-[640px]">
            <p className="cine-eyebrow">AI prediction</p>
            <h2 id="ai-title" className="h-section mt-3">
              Not a robot. A network of signals.
            </h2>
            <p className="lede mt-4">Case data flows into a model; a probability comes out, with the signals that drove it and the checks they suggest.</p>
            <InApp to="/data" className="mt-5">
              Data &amp; model — the live model, its version and how it was tested
            </InApp>
          </div>
          <div className="pe flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Sample case">
            {CASES.map((c, i) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={caseIdx === i}
                aria-pressed={caseIdx === i}
                className="seg-btn"
                onClick={() => setCaseIdx(i)}
              >
                {c.id} <span className="ml-1 opacity-60">{['high', 'medium', 'low'][i]}</span>
              </button>
            ))}
            <button className="btn btn-ghost !px-4 !py-2 !text-[11px]" onClick={() => setRunId((r) => r + 1)} data-cursor="inspect">
              Run prediction
            </button>
          </div>
        </Reveal>

        <div ref={wrap} className="pe relative mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px_300px] lg:gap-16">
          <canvas ref={canvas} className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true" />
          <div className="relative">
            <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-400">Inputs (SIH26017)</p>
            <ul className="space-y-1">
              {rows.map((r, i) => (
                <li key={r.label}>
                  <div
                    ref={(el) => {
                      inRefs.current[i] = el;
                    }}
                    tabIndex={0}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 transition-colors ${
                      hover === i ? 'border-white/30 bg-white/5' : 'border-white/[0.07] bg-cine-900/60'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[12.5px] leading-tight text-mist-100">{r.label}</span>
                      <span className="block truncate text-[11px] leading-tight text-mist-400">{r.value}</span>
                    </span>
                    <span
                      className="shrink-0 font-mono text-[11.5px]"
                      style={{ color: r.keys.length === 0 ? '#6f7e8a' : r.c > 0.05 ? '#f0c77f' : r.c < -0.05 ? '#72b8c8' : '#8d9ba6' }}
                    >
                      {r.keys.length === 0 ? 'target' : fmtC(r.c)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative flex items-center">
            <div ref={modelRef} className="panel w-full p-5 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gis-400">ML model</p>
              <div className="mx-auto my-4 grid w-fit grid-cols-4 gap-1.5" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="h-2 w-2 rounded-full bg-gis-400/70 pulse-dot" style={{ animationDelay: `${(i * 137) % 1000}ms` }} />
                ))}
              </div>
              <p className="font-mono text-[12px] text-mist-200">p = σ(β₀ + Σ βᵢxᵢ)</p>
              <p className="mt-2 text-[11.5px] leading-snug text-mist-400">
                Scene: {MODEL_VERSION}, a simplified model. The dashboard runs a gradient-boosted tree ensemble
                {liveModel ? ` (${liveModel})` : ''} with exact TreeSHAP explanations.
              </p>
            </div>
          </div>
          <div className="relative flex flex-col gap-3">
            <div ref={outRef} className="panel p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist-400">Risk probability</p>
              <CountUp
                key={parcel.id}
                value={sc.p * 100}
                format={(v) => `${Math.round(v)}%`}
                className="mt-1 block font-grotesk text-5xl font-semibold tracking-[-0.03em]"
              />
              <span className="sr-only">{pct(sc.p)}</span>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full transition-[width] duration-700" style={{ width: pct(sc.p), background: riskColor(sc.p) }} />
              </div>
              <p className="mt-2 text-[12px] text-mist-400">
                {parcel.id} · next milestone {sc.nextMilestone}
              </p>
            </div>
            <div className="mx-auto h-5 w-px bg-white/20" aria-hidden="true" />
            <div className="panel p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist-400">Explanation</p>
              <ul className="mt-2 space-y-1.5">
                {top.length ? (
                  top.map((r) => (
                    <li key={r.key} className="flex justify-between gap-3 text-[13px] text-mist-100">
                      {r.label}
                      <span className="font-mono text-[12px] text-[#f0c77f]">+{r.contribution.toFixed(2)}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-mist-300">No feature pushes this case notably above baseline.</li>
                )}
              </ul>
            </div>
            <div className="mx-auto h-5 w-px bg-white/20" aria-hidden="true" />
            <div className="panel p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist-400">Administrative check</p>
              <p className="mt-2 text-[14px] text-mist-50">{top[0] ? CHECK_FOR[top[0].key] : 'Routine review — no priority check'}</p>
              <p className="mt-2 text-[11.5px] text-mist-500">Suggested for human review</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
