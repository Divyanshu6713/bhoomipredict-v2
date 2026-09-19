import { CineLink as Link } from '../components/CineLink';
import { Magnetic, CountUp } from '../components/Interactive';
import { scrollToId } from '../lib/scroll';
import { useStore } from '../lib/store';

const TITLE = 'LAND PULSE';

export function Hero() {
  const summary = useStore((s) => s.summary);
  const t = summary?.totals;
  return (
    <section id="hero" className="relative h-[100svh] min-h-[620px]" aria-labelledby="hero-title">
      <div className="scrim-bottom absolute inset-x-0 bottom-0 h-[62%]" />
      <div className="relative mx-auto flex h-full max-w-content flex-col justify-end px-4 pb-10 md:px-8 md:pb-16">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="cine-eyebrow hero-in" style={{ animationDelay: '1.4s' }}>
              Explainable early warning · Land-acquisition delay risk
            </p>
            <h1 id="hero-title" className="h-display mt-4 whitespace-nowrap text-[clamp(3.2rem,10.5vw,8.8rem)] text-mist-50" aria-label={TITLE}>
              {TITLE.split('').map((ch, i) => (
                <span key={i} aria-hidden="true" className="hero-letter" style={{ animationDelay: `${1.55 + i * 0.05}s` }}>
                  {ch === ' ' ? ' ' : ch}
                </span>
              ))}
            </h1>
            <p
              className="hero-in mt-3 font-grotesk text-[clamp(1.35rem,2.6vw,2.2rem)] font-medium tracking-[-0.02em] text-mist-100"
              style={{ animationDelay: '2.1s' }}
            >
              Predict Delays. <span className="text-gis-300">Accelerate Development.</span>
            </p>
            <p className="lede hero-in mt-4 max-w-[30rem]" style={{ animationDelay: '2.3s' }}>
              An explainable early-warning and decision-support layer for land-acquisition risk.
            </p>
            <div className="hero-in mt-8 flex flex-wrap gap-3" style={{ animationDelay: '2.5s' }}>
              <Magnetic>
                <button className="btn btn-primary" onClick={() => scrollToId('journey')} data-cursor="explore">
                  Explore Land Pulse
                  <span aria-hidden="true">↓</span>
                </button>
              </Magnetic>
              <Magnetic>
                <button className="btn btn-ghost" onClick={() => scrollToId('ai')}>
                  See how it works
                </button>
              </Magnetic>
              <Link to="/dashboard" className="btn !px-3 text-mist-300 underline-offset-4 hover:text-mist-50 hover:underline">
                Open the dashboard →
              </Link>
            </div>
          </div>
          <div className="hero-in hidden max-w-[320px] lg:block" style={{ animationDelay: '2.7s' }}>
            <div className="panel p-5">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#f0c77f]">Live portfolio · demonstration dataset</p>
              <p className="mt-2 text-[13px] leading-snug text-mist-200">
                Synthetic data for prototype demonstration — not suitable for administrative decision-making.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 hair">
                <Stat label="Projects" value={t?.projects} />
                <Stat label="Open cases" value={t?.openCases} compact />
                <Stat label="High or critical" value={t ? t.highRiskCases : undefined} compact tone="text-[#ff9b6a]" />
              </div>
              <p className="mt-3 text-[11px] leading-snug text-mist-500">
                {t ? `Scored by the platform model across ${t.states} States/UTs.` : 'Connecting to the platform…'} The 3D corridor is an illustrative scene.
              </p>
            </div>
            <p className="mt-4 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-400">
              <span className="h-1.5 w-1.5 rounded-full bg-gis-400 pulse-dot" /> Move across the land · hover a parcel · click to inspect
            </p>
          </div>
        </div>
        <p className="mt-8 font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-400 lg:hidden">
          Synthetic data · prototype · tap a parcel
        </p>
      </div>
    </section>
  );
}

const compactFmt = (v: number) => (v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : Math.round(v).toLocaleString('en-IN'));

function Stat({ label, value, tone = 'text-mist-50', compact = false }: { label: string; value?: number; tone?: string; compact?: boolean }) {
  return (
    <div>
      {value == null ? (
        <span className={`block h-7 w-12 animate-pulse rounded bg-white/10`} aria-hidden="true" />
      ) : (
        <CountUp value={value} format={compact ? compactFmt : undefined} className={`block font-grotesk text-xl font-semibold ${tone}`} />
      )}
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-mist-400">{label}</span>
    </div>
  );
}
