import { InApp } from '../components/InApp';
import { useStore } from '../lib/store';
import { hero, today } from '../lib/dataset';
import { SIGNATURE_LAYERS } from '../lib/content';
import { pct } from '../lib/palette';
import { Magnetic } from '../components/Interactive';

const S = today[hero.idx].score!;

const TABS = [
  { k: 'Risk', verb: 'Risk', cursor: 'explore' },
  { k: 'Explain', verb: 'Explain', cursor: 'explain' },
  { k: 'Action', verb: 'Action', cursor: 'inspect' },
] as const;

export function Signature() {
  const step = useStore((s) => s.signatureStep);
  const set = useStore((s) => s.set);
  return (
    <section id="signature" className="relative h-[100svh] min-h-[680px]" aria-labelledby="sig-title">
      <div className="scrim-left absolute inset-0" />
      <div className="relative mx-auto flex h-full max-w-content items-center px-4 md:px-8">
        <div className="pe max-w-[470px]">
          <p className="cine-eyebrow">The Land Pulse signature</p>
          <h2 id="sig-title" className="h-section mt-3">
            Risk <span className="text-mist-500">→</span> Driver <span className="text-mist-500">→</span> Action
          </h2>
          <InApp to="/cases" className="mt-4">
            Open any parcel: its risk, why, and what is holding it
          </InApp>
          <div role="tablist" aria-label="Signature steps" className="mt-8 grid grid-cols-3 gap-2">
            {TABS.map((t, i) => (
              <Magnetic key={t.k} strength={0.15} className="w-full">
                <button
                  role="tab"
                  id={`sig-tab-${i}`}
                  aria-selected={step === i}
                  aria-controls="sig-panel"
                  data-cursor={t.cursor}
                  onClick={() => set({ signatureStep: i as 0 | 1 | 2 })}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    step === i ? 'border-transparent bg-mist-50 text-cine-950' : 'border-white/10 text-mist-300 hover:border-white/25 hover:text-mist-50'
                  }`}
                >
                  <span className="block font-mono text-[10px] opacity-60">0{i + 1}</span>
                  <span className="font-grotesk text-[15px] font-semibold uppercase tracking-[0.08em]">{t.verb}</span>
                </button>
              </Magnetic>
            ))}
          </div>
          <div id="sig-panel" role="tabpanel" aria-labelledby={`sig-tab-${step}`} className="mt-6 min-h-[260px]">
            {step === 0 && (
              <div className="fx-in">
                <p className="font-grotesk text-[56px] font-semibold leading-none tracking-[-0.03em] text-[#ff9b6a]">{pct(S.p)}</p>
                <p className="mt-2 text-[15px] text-mist-200">predicted probability of missing the next milestone ({S.nextMilestone}).</p>
                <p className="mt-4 text-[13px] text-mist-400">Parcel {hero.id} · synthetic case · demonstration model</p>
                <button className="btn btn-ghost mt-6 !py-2.5" data-cursor="explain" onClick={() => set({ signatureStep: 1 })}>
                  Explain →
                </button>
              </div>
            )}
            {step === 1 && (
              <div className="fx-in">
                <p className="text-[13px] uppercase tracking-[0.14em] text-mist-400">Drivers — top model contributors</p>
                <ul className="mt-3 space-y-2.5">
                  {SIGNATURE_LAYERS.map((l) => (
                    <li key={l.key} className="flex items-center gap-3 text-[15px] text-mist-100">
                      <span className="h-2 w-2 rounded-full bg-risk-med" />
                      {l.driver}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[12.5px] leading-snug text-mist-400">
                  These are signals the model weighed, not established causes of delay.
                </p>
                <button className="btn btn-ghost mt-5 !py-2.5" data-cursor="inspect" onClick={() => set({ signatureStep: 2 })}>
                  Action →
                </button>
              </div>
            )}
            {step === 2 && (
              <div className="fx-in">
                <p className="text-[13px] uppercase tracking-[0.14em] text-mist-400">Human-reviewed administrative checks</p>
                <ol className="mt-3 space-y-2.5">
                  {SIGNATURE_LAYERS.map((l, i) => (
                    <li key={l.key} className="flex gap-3 text-[14.5px] text-mist-100">
                      <span className="font-mono text-[11px] text-gis-400">{String(i + 1).padStart(2, '0')}</span>
                      <span>
                        {l.check}
                        <span className="ml-2 text-[12px] text-mist-500">· {l.owner}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#e1a43c]/40 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#f0c77f]">
                  Human review required
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
