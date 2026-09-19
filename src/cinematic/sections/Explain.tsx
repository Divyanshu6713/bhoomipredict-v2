import { InApp } from '../components/InApp';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { world, hero, hero2 } from '../lib/dataset';
import { score, MODEL_VERSION, MODEL, type Overrides } from '../lib/model';
import { TODAY } from '../lib/world';
import { stageLabel } from '../lib/stages';
import { pct, riskColor, fmtC } from '../lib/palette';
import { CountUp } from '../components/Interactive';

const TOGGLES: { k: keyof Overrides; label: string; from: (d: string) => string; to: string }[] = [
  { k: 'comp', label: 'Compensation', from: (d) => d, to: 'Resolved' },
  { k: 'owner', label: 'Ownership records', from: (d) => d, to: 'Resolved' },
  { k: 'legal', label: 'Legal case', from: (d) => d, to: 'Closed' },
  { k: 'idle', label: 'Last recorded action', from: (d) => d, to: '5 days ago' },
];

function Gauge({ p }: { p: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" className="h-32 w-32 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke={riskColor(p)}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`}
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.2,.8,.2,1), stroke 0.4s' }}
      />
    </svg>
  );
}

export function Explain() {
  const focusId = useStore((s) => s.focusId);
  const whatIf = useStore((s) => s.whatIf);
  const hoverKey = useStore((s) => s.xaiHover);
  const set = useStore((s) => s.set);
  const [tab, setTab] = useState<'why' | 'whatif' | 'details'>('why');
  const parcel = world.byId.get(focusId) ?? hero;
  const base = useMemo(() => score(parcel, TODAY)!, [parcel]);
  const cur = useMemo(() => score(parcel, TODAY, whatIf)!, [parcel, whatIf]);
  const changed = Object.values(whatIf).some(Boolean);
  const rows = base.rows.filter((r) => r.key !== 'ptype').slice(0, 8);
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.contribution)), 0.2);
  const baseRow = (k: string) => base.rows.find((r) => r.key === k)!;
  const done = base.stage >= 12;
  const missing = parcel.acq?.missing ?? [];

  const presets = [hero, hero2];
  return (
    <section id="xai" className="relative min-h-[100svh]" aria-labelledby="xai-title">
      <div className="scrim-right absolute inset-0 hidden md:block" />
      <div className="absolute inset-0 bg-cine-950/60 md:hidden" />
      <div className="relative mx-auto flex min-h-[100svh] max-w-content items-center justify-end px-4 py-24 md:px-8">
        <div className="pe w-full max-w-[520px]">
          <p className="cine-eyebrow">Explainable AI</p>
          <h2 id="xai-title" className="h-section mt-3 !text-[clamp(1.9rem,3.8vw,3.4rem)]">
            Why is this case high risk?
          </h2>
          <InApp to="/predict" className="mt-4">
            Scenario scoring — change an input on a real project and see the score move
          </InApp>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {presets.map((p) => (
              <button key={p.id} className="seg-btn" aria-pressed={p.id === parcel.id} onClick={() => set({ focusId: p.id, whatIf: {} })}>
                {p.id}
              </button>
            ))}
            {!presets.includes(parcel) && (
              <span className="seg-btn" aria-pressed="true">
                {parcel.id}
              </span>
            )}
            <span className="text-[12px] text-mist-500">or pick any parcel in the command center</span>
          </div>

          <div className="panel mt-5 p-5 md:p-6">
            {done ? (
              <p className="text-mist-200">Parcel {parcel.id} has been handed over — there is no pending milestone to score.</p>
            ) : (
              <>
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <Gauge p={cur.p} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <CountUp value={cur.p * 100} format={(v) => `${Math.round(v)}%`} className="font-grotesk text-[34px] font-semibold tracking-[-0.03em]" duration={700} />
                    </div>
                  </div>
                  <div>
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-400">Predicted delay risk</p>
                    <p className="mt-1 text-[15px] text-mist-100">
                      Next milestone: <b className="font-semibold">{cur.nextMilestone}</b>
                    </p>
                    <p className="mt-1 text-[13px] text-mist-400">
                      Parcel {parcel.id} · stage {stageLabel(cur.stage)}
                    </p>
                    {changed && (
                      <p className="mt-2 text-[12.5px] text-[#f0c77f]">
                        {pct(base.p)} → {pct(cur.p)} · illustrative model response
                      </p>
                    )}
                  </div>
                </div>

                <div role="tablist" aria-label="Explanation views" className="mt-6 flex gap-1.5">
                  {(
                    [
                      ['why', 'Contributions'],
                      ['whatif', 'What if?'],
                      ['details', 'Details'],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className="seg-btn !py-1.5" onClick={() => setTab(k)}>
                      {l}
                    </button>
                  ))}
                </div>

                {tab === 'why' && (
                  <div className="fx-in mt-4" role="tabpanel">
                    <ul className="space-y-1">
                      {rows.map((r) => {
                        const c = cur.rows.find((x) => x.key === r.key)!.contribution;
                        const w = (Math.abs(c) / maxAbs) * 50;
                        return (
                          <li
                            key={r.key}
                            tabIndex={0}
                            data-cursor="explain"
                            onMouseEnter={() => set({ xaiHover: r.key })}
                            onMouseLeave={() => set({ xaiHover: null })}
                            onFocus={() => set({ xaiHover: r.key })}
                            onBlur={() => set({ xaiHover: null })}
                            className={`grid grid-cols-[1fr_120px_52px] items-center gap-3 rounded-md px-2 py-1.5 transition-colors ${
                              hoverKey === r.key ? 'bg-white/[0.06]' : ''
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] text-mist-100">{r.label}</span>
                              <span className="block truncate text-[11px] text-mist-500">{cur.rows.find((x) => x.key === r.key)!.display}</span>
                            </span>
                            <span className="relative h-2 rounded-full bg-white/[0.06]" aria-hidden="true">
                              <span className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-white/25" />
                              <span
                                className="absolute top-0 h-2 rounded-full transition-all duration-500"
                                style={{
                                  left: c >= 0 ? '50%' : `${50 - w}%`,
                                  width: `${w}%`,
                                  background: c >= 0 ? '#e1a43c' : '#72b8c8',
                                }}
                              />
                            </span>
                            <span className="text-right font-mono text-[12px]" style={{ color: c >= 0 ? '#f0c77f' : '#72b8c8' }}>
                              {fmtC(c)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[12.5px] leading-snug text-mist-300">
                      Values are <b className="text-mist-100">model contributions</b> in log-odds, relative to an average case. Each feature
                      contributed to the model's prediction — none is a proven cause of delay.
                    </p>
                  </div>
                )}

                {tab === 'whatif' && (
                  <div className="fx-in mt-4" role="tabpanel">
                    <ul className="space-y-2">
                      {TOGGLES.map((t) => {
                        const r = baseRow(t.k);
                        const relevant = r && r.contribution > 0.02;
                        const on = !!whatIf[t.k];
                        return (
                          <li key={t.k} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] px-3 py-2.5">
                            <span className="min-w-0">
                              <span className="block text-[13px] text-mist-100">{t.label}</span>
                              <span className="block text-[11.5px] text-mist-400">
                                {relevant ? (
                                  <>
                                    <span className={on ? 'line-through opacity-60' : ''}>{t.from(r.display)}</span>
                                    {on && <span className="text-ok"> → {t.to}</span>}
                                  </>
                                ) : (
                                  'Not a risk-raising signal for this parcel'
                                )}
                              </span>
                            </span>
                            <button
                              role="switch"
                              aria-checked={on}
                              aria-label={`${t.label}: ${on ? t.to : 'as recorded'}`}
                              disabled={!relevant}
                              onClick={() => set({ whatIf: { ...whatIf, [t.k]: !on } })}
                              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-30 ${
                                on ? 'border-transparent bg-ok' : 'border-white/20 bg-white/5'
                              }`}
                            >
                              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-mist-50 transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-4 text-[12.5px] leading-snug text-mist-300">
                      <b className="text-[#f0c77f]">Illustrative model response.</b> Toggling an input re-scores the same demonstration model. It
                      shows how the model reacts — it does not estimate what would actually happen if the issue were resolved.
                    </p>
                    {changed && (
                      <button className="mt-3 text-[12px] text-gis-300 underline-offset-4 hover:underline" onClick={() => set({ whatIf: {} })}>
                        Reset to recorded values
                      </button>
                    )}
                  </div>
                )}

                {tab === 'details' && (
                  <div className="fx-in mt-4" role="tabpanel">
                    <div className="kv">
                      <span>Model version</span>
                      <span>{MODEL_VERSION}</span>
                    </div>
                    <div className="kv">
                      <span>Prediction date</span>
                      <span>Snapshot · project day {TODAY}</span>
                    </div>
                    <div className="kv">
                      <span>Data freshness</span>
                      <span>Last record {Math.round(cur.idleDays)} days before snapshot</span>
                    </div>
                    <div className="kv">
                      <span>Current stage</span>
                      <span>{stageLabel(cur.stage)}</span>
                    </div>
                    <div className="kv">
                      <span>Baseline (average case)</span>
                      <span>{pct(1 / (1 + Math.exp(-base.base)))}</span>
                    </div>
                    <div className="kv">
                      <span>Calibration / confidence</span>
                      <span className="text-[#f0c77f]">Not validated on real outcomes</span>
                    </div>
                    <div className="kv">
                      <span>Missing-data warnings</span>
                      <span className={missing.length ? 'text-[#f0c77f]' : ''}>
                        {missing.length ? missing.map((m) => ({ rr: 'R&R survey date', response: 'Stakeholder log', notif: 'Notification date' })[m] ?? m).join(', ') + ' missing — imputed' : 'None'}
                      </span>
                    </div>
                    <div className="kv">
                      <span>Top contributing features</span>
                      <span>
                        {base.rows
                          .filter((r) => r.contribution > 0)
                          .slice(0, 3)
                          .map((r) => r.label)
                          .join(', ')}
                      </span>
                    </div>
                    <p className="mt-3 text-[11.5px] text-mist-500">
                      Intercept {MODEL.b0.toFixed(2)} fitted so ~15% of open synthetic cases fall in the high band. Synthetic data cannot establish
                      real-world accuracy.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
