import { InApp } from '../components/InApp';
import { useStore } from '../lib/store';
import { CHAIN, CONSTRUCTION, downstream } from '../lib/stages';
import { Reveal } from '../components/Interactive';

export function Chain() {
  const hover = useStore((s) => s.chainHover);
  const set = useStore((s) => s.set);
  const node = CHAIN.find((c) => c.id === hover);
  const order = [...CHAIN.map((c) => c.id), CONSTRUCTION.id];
  const deps = hover ? [...downstream(hover)].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : [];
  const labelOf = (id: string) => (id === CONSTRUCTION.id ? CONSTRUCTION.label : CHAIN.find((c) => c.id === id)?.label ?? id);
  return (
    <section id="chain" className="relative h-[100svh] min-h-[680px]" aria-labelledby="chain-title">
      <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-cine-950/90 to-transparent" />
      <div className="scrim-bottom absolute inset-x-0 bottom-0 h-[45%]" />
      <div className="relative mx-auto flex h-full max-w-content flex-col justify-between px-4 pb-8 pt-24 md:px-8 md:pb-10 md:pt-28">
        <Reveal className="max-w-[640px]">
          <p className="cine-eyebrow">The problem</p>
          <h2 id="chain-title" className="h-section mt-3">
            Land acquisition is a chain.
          </h2>
          <p className="lede mt-4 max-w-[520px]">Delay is rarely one event. It accumulates across stages — and travels downstream to construction.</p>
          <InApp to="/projects" className="mt-5">
            Every project shows these nine steps, with the parcels still pending at each
          </InApp>
        </Reveal>

        <div className="grid items-end gap-4 lg:grid-cols-[1fr_380px]">
          <div className="pe" role="group" aria-label="Acquisition stages">
            <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-500">
              Hover a stage — in the scene or below
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CHAIN.map((c, i) => {
                const isDep = deps.includes(c.id);
                return (
                  <button
                    key={c.id}
                    className="seg-btn !px-3 !py-1.5 !text-[12px]"
                    aria-pressed={hover === c.id}
                    style={isDep ? { borderColor: 'rgba(225,164,60,0.7)', color: '#f0c77f' } : undefined}
                    onMouseEnter={() => set({ chainHover: c.id })}
                    onMouseLeave={() => set({ chainHover: null })}
                    onFocus={() => set({ chainHover: c.id })}
                    onBlur={() => set({ chainHover: null })}
                    onClick={() => set({ chainHover: hover === c.id ? null : c.id })}
                  >
                    <span className="mr-1.5 font-mono text-[10px] opacity-50">{String(i + 1).padStart(2, '0')}</span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="panel pe min-h-[196px] p-5" aria-live="polite">
            {node ? (
              <div key={node.id} className="fx-in">
                <p className="cine-eyebrow">Stage · timeline paused</p>
                <h3 className="mt-2 font-grotesk text-2xl font-semibold uppercase tracking-[0.02em] text-mist-50">{node.label}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-mist-200">{node.blurb}</p>
                {deps.length > 0 && (
                  <p className="mt-3 text-[13px] text-mist-300">
                    <span className="text-[#f0c77f]">Can hold up: </span>
                    {deps.map(labelOf).join(' · ')}
                  </p>
                )}
                <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mist-500">Signals: {node.signals.join(' · ')}</p>
              </div>
            ) : (
              <div>
                <p className="cine-eyebrow">Dependencies</p>
                <p className="mt-2 text-[14px] leading-relaxed text-mist-200">
                  Each stage feeds the next. Pending compensation, for example, can become a dependency for possession — and possession
                  for construction.
                </p>
                <p className="mt-3 font-mono text-[12px] text-[#f0c77f]">Compensation → Possession → Construction</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
