import { useLiveValue } from '../hooks/useLiveValue';
import { live } from '../lib/store';
import { CineLink as Link } from '../components/CineLink';
import { Magnetic } from '../components/Interactive';
import { BRAND } from '@/lib/brand';
import { StandardViewLink } from '../components/Chrome';

function CTAs() {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <Magnetic>
        <Link to="/dashboard" className="btn btn-primary" data-cursor="explore">
          Open the dashboard →
        </Link>
      </Magnetic>
      <Magnetic>
        <Link to="/predict" className="btn btn-ghost">
          Try scenario scoring
        </Link>
      </Magnetic>
      <Magnetic>
        <Link to="/about" className="btn btn-ghost">
          Read the methodology
        </Link>
      </Magnetic>
    </div>
  );
}

/** Back on the land — now the visitor can read it. */
export function Return() {
  return (
    <section id="return" className="relative h-[100svh] min-h-[640px]" aria-labelledby="ret-title">
      <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-cine-950 via-cine-950/70 to-transparent" />
      <div className="relative mx-auto flex h-full max-w-content flex-col items-center justify-end px-4 pb-16 text-center md:px-8">
        <p className="cine-eyebrow">The same land — now you can read it</p>
        <h2 id="ret-title" className="h-section mt-4 max-w-[900px]">
          From fragmented acquisition data to explainable early warning and informed administrative action.
        </h2>
        <p className="mt-4 text-[13px] text-mist-400">Columns are risk. Pins are signals. Hover and click — every parcel is live.</p>
        <div className="pe mt-8">
          <CTAs />
        </div>
      </div>
    </section>
  );
}

const WORDS = ['Risk', 'Driver', 'Action'];

export function Finale() {
  const p = useLiveValue(() => Math.round(live.progress.finale * 100) / 100);
  const caption = p < 0.15 ? 'One parcel.' : p < 0.32 ? 'One project.' : p < 0.5 ? 'One district.' : p < 0.64 ? 'Many signals.' : p < 0.74 ? 'One intelligence layer.' : '';
  const wordsOn = p >= 0.72;
  const brandOn = p >= 0.84;
  return (
    <section id="finale" data-pinned="true" className="relative" style={{ height: '420vh' }} aria-labelledby="fin-title">
      <div className="sticky top-0 flex h-[100svh] items-center justify-center overflow-hidden">
        <div className={`absolute inset-0 bg-cine-950 transition-opacity duration-1000 ${brandOn ? 'opacity-60' : 'opacity-0'}`} />
        <div className="relative px-4 text-center">
          {!wordsOn && caption && (
            <p key={caption} className="fx-in font-grotesk text-[clamp(1.6rem,3.6vw,3rem)] font-medium tracking-[-0.02em] text-mist-100" aria-live="polite">
              {caption}
            </p>
          )}
          {wordsOn && !brandOn && (
            <div className="flex flex-col items-center gap-2" aria-label="Risk, driver, action">
              {WORDS.map((w, i) => (
                <div key={w} className="flex flex-col items-center">
                  <p className="fx-in font-grotesk text-[clamp(2.2rem,6vw,5rem)] font-semibold uppercase tracking-[0.06em] text-mist-50" style={{ animationDelay: `${i * 220}ms` }}>
                    {w}
                  </p>
                  {i < 2 && (
                    <span className="fx-in text-mist-500" style={{ animationDelay: `${i * 220 + 110}ms` }} aria-hidden="true">
                      ↓
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {brandOn && (
            <div className="fx-in">
              <h2 id="fin-title" className="h-display text-[clamp(3.4rem,11vw,9.5rem)] text-mist-50">
                LAND PULSE
              </h2>
              <p className="mt-3 font-grotesk text-[clamp(1.2rem,2.4vw,2rem)] font-medium tracking-[-0.02em] text-mist-200">
                Predict Delays. <span className="text-gis-300">Accelerate Development.</span>
              </p>
              <div className={`pe mt-10 transition-opacity duration-700 ${p > 0.9 ? 'opacity-100' : 'opacity-0'}`}>
                <CTAs />
              </div>
            </div>
          )}
          {!brandOn && <h2 className="sr-only">Land Pulse</h2>}
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLS = [
  { title: 'Monitor', links: [['Overview', '/dashboard'], ['Portfolio', '/hierarchy'], ['Projects', '/projects'], ['Risk map', '/map']] },
  { title: 'Risk & action', links: [['Risk analysis', '/risk'], ['Scenario scoring', '/predict'], ['Interventions', '/queue'], ['Alerts', '/alerts']] },
  { title: 'About', links: [['Methodology', '/about'], ['Data & model', '/data'], ['Data sources', '/data-sources'], ['Analytics', '/analytics']] },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] bg-cine-950 px-4 pb-10 pt-14 md:px-8">
      <div className="mx-auto max-w-content">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <img src="/brand/landpulse-logo-on-dark.png" alt={BRAND.product} className="h-11 w-auto" width={560} height={221} loading="lazy" />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-mist-400">
              {BRAND.descriptor} for infrastructure programmes across India. Research prototype for SIH26017.
            </p>
            <StandardViewLink className="tag mt-5 inline-flex hover:!text-mist-50" />
          </div>
          {FOOTER_COLS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-300">{c.title}</p>
              <ul className="mt-3 space-y-2">
                {c.links.map(([label, href]) => (
                  <li key={href}>
                    <Link to={href} className="text-[13.5px] text-mist-400 transition-colors hover:text-mist-50">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/[0.06] pt-6 text-[12px] text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {BRAND.product} {BRAND.version} · {BRAND.attribution}
          </p>
          <p>Demonstration build. Synthetic data only — not an official government record. No government deployment, partnership or live integration is implied.</p>
        </div>
      </div>
    </footer>
  );
}
