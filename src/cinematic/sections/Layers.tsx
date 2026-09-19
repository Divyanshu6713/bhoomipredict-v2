import { InApp } from '../components/InApp';
import { useStore } from '../lib/store';
import { PLATFORM_LAYERS } from '../lib/content';

export function Layers() {
  const hover = useStore((s) => s.stackHover);
  const set = useStore((s) => s.set);
  const active = hover >= 0 ? PLATFORM_LAYERS[hover] : null;
  return (
    <section id="layers" data-pinned="true" className="relative" style={{ height: '240vh' }} aria-labelledby="layers-title">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="scrim-left absolute inset-0 hidden md:block" />
        <div className="scrim-bottom absolute inset-x-0 bottom-0 h-[60%] md:hidden" />
        <div className="relative mx-auto flex h-full max-w-content items-end px-4 pb-10 md:items-center md:px-8 md:pb-0">
          <div className="pe max-w-[430px]">
            <p className="cine-eyebrow">Exploded view</p>
            <h2 id="layers-title" className="h-section mt-3 !text-[clamp(1.9rem,3.8vw,3.4rem)]">
              One platform. Seven layers.
            </h2>
            <InApp to="/data" className="mt-4">
              Data &amp; model — every layer on live synthetic data
            </InApp>
            <ul className="mt-7 space-y-1" aria-label="Platform layers, top to bottom">
              {PLATFORM_LAYERS.map((l, i) => (
                <li key={l.k}>
                  <button
                    onMouseEnter={() => set({ stackHover: i })}
                    onMouseLeave={() => set({ stackHover: -1 })}
                    onFocus={() => set({ stackHover: i })}
                    onBlur={() => set({ stackHover: -1 })}
                    aria-describedby="layer-purpose"
                    className={`flex w-full items-center gap-4 rounded-lg border px-4 py-2.5 text-left transition-colors ${
                      hover === i ? 'border-white/25 bg-white/[0.06]' : 'border-transparent hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="font-mono text-[10.5px] text-mist-500">{String(7 - i).padStart(2, '0')}</span>
                    <span className={`font-grotesk text-[15px] font-semibold uppercase tracking-[0.12em] ${hover === i ? 'text-mist-50' : 'text-mist-300'}`}>{l.k}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div id="layer-purpose" className="mt-5 min-h-[72px]" aria-live="polite">
              {active ? (
                <p key={active.k} className="fx-in text-[15px] leading-relaxed text-mist-100">
                  <span className="font-semibold text-gis-300">{active.k}. </span>
                  {active.purpose}
                </p>
              ) : (
                <p className="text-[14px] text-mist-400">Hover a layer — here or in the stack — to see what it does. Scroll to separate them.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
