import { InApp } from '../components/InApp';
import { useState } from 'react';
import { LIMITS } from '../lib/content';
import { Reveal, Tilt } from '../components/Interactive';

export function Limits() {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <section id="limits" className="relative py-28 md:py-36" aria-labelledby="lim-title">
      <div className="absolute inset-0 bg-cine-950/85" />
      <div className="relative mx-auto max-w-content px-4 md:px-8">
        <Reveal className="max-w-[720px]">
          <p className="cine-eyebrow">Limitations</p>
          <h2 id="lim-title" className="h-section mt-3">
            Trust requires limits.
          </h2>
          <p className="lede mt-4">What this prototype cannot do is part of the design, not a footnote. Select a card to see how the design responds.</p>
          <InApp to="/about" className="mt-5">
            About — method, data and limitations
          </InApp>
        </Reveal>
        <Reveal className="pe mt-10">
          <dl className="grid gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:grid-cols-3">
            {[
              { t: 'Synthetic records', d: 'Every project, parcel, case and outcome is generated for demonstration. None represents an actual proceeding.' },
              { t: 'No government system connected', d: 'Land records, courts and treasury data arrive through synthetic adapters built to documented provider contracts.' },
              { t: 'Real model pipeline', d: 'Training, scoring, SHAP explanations, drift monitoring and gated retraining run for real on that data.' },
            ].map((x) => (
              <div key={x.t}>
                <dt className="text-[14px] font-semibold text-mist-50">{x.t}</dt>
                <dd className="mt-1 text-[13px] leading-relaxed text-mist-400">{x.d}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LIMITS.map((l, i) => {
            const on = !!open[i];
            return (
              <li key={l.k}>
                <Reveal delay={i * 70} className="h-full">
                  <Tilt className="h-full">
                    <button
                      className="pe panel group relative flex h-full min-h-[210px] w-full flex-col justify-between overflow-hidden p-6 text-left transition-colors hover:!border-white/25"
                      aria-expanded={on}
                      onClick={() => setOpen({ ...open, [i]: !on })}
                      data-cursor="explore"
                    >
                      <span
                        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: 'radial-gradient(420px circle at var(--gx,50%) var(--gy,50%), rgba(114,184,200,0.08), transparent 60%)' }}
                      />
                      <span className="relative flex items-center justify-between">
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f0c77f]">{l.k}</span>
                        <span className={`text-mist-400 transition-transform duration-300 ${on ? 'rotate-45' : ''}`} aria-hidden="true">
                          +
                        </span>
                      </span>
                      <span className="relative mt-6 block">
                        <span className="block font-grotesk text-[21px] font-semibold leading-tight tracking-[-0.01em] text-mist-50">{l.title}</span>
                        <span
                          className={`grid transition-all duration-500 ${on ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                        >
                          <span className="overflow-hidden text-[13.5px] leading-relaxed text-mist-300">{l.body}</span>
                        </span>
                      </span>
                    </button>
                  </Tilt>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
