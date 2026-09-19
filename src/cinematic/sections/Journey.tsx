import { useLiveValue } from '../hooks/useLiveValue';
import { live } from '../lib/store';
import { hero, today, segmentsToday, world } from '../lib/dataset';
import { journeyStep, JOURNEY_STEPS } from '../three/mode';
import { pct } from '../lib/palette';
import { phaseLabel } from '../lib/stages';
import { segmentName } from '../lib/world';

const S = today[hero.idx].score!;
const seg = segmentsToday[hero.segment];

const STEPS = [
  {
    k: 'Landscape',
    title: `A corridor crosses ${world.parcels.length.toLocaleString('en-IN')} parcels.`,
    body: `${world.row.length} of them sit inside the right-of-way. Each carries its own acquisition history.`,
  },
  {
    k: 'Parcel',
    title: `Parcel ${hero.id}.`,
    body: `${hero.areaHa.toFixed(2)} ha of ${hero.landUse.toLowerCase()} land on work front ${segmentName(hero.segment)}. Stage: ${phaseLabel(today[hero.idx].stage)}.`,
  },
  {
    k: 'Data',
    title: 'A parcel is a bundle of records.',
    body: 'Ownership, survey, notification, compensation, litigation, R&R — each with dates, gaps and owners.',
  },
  {
    k: 'Risk signal',
    title: `${pct(S.p)} predicted probability of missing the next milestone.`,
    body: `Next milestone: ${S.nextMilestone}. Scored by a demonstration model on synthetic data.`,
  },
  {
    k: 'Explanation',
    title: 'Four signals contributed most.',
    body: 'Compensation pending, ownership records unresolved, an active legal case, and weeks without a recorded action. Contributors to the model — not proven causes.',
  },
  {
    k: 'Action',
    title: 'Checks, not verdicts.',
    body: `Suggested administrative checks go to an officer for review. This parcel sits on work front ${seg.name}, where ${seg.total - seg.ready} of ${seg.total} parcels are still pending.`,
  },
];

export function Journey() {
  const step = useLiveValue(() => journeyStep(live.progress.journey));
  const s = STEPS[step];
  return (
    <section id="journey" data-pinned="true" className="relative" style={{ height: `${JOURNEY_STEPS * 100}vh` }} aria-label="From land to action">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="scrim-left absolute inset-0 hidden md:block" />
        <div className="scrim-bottom absolute inset-x-0 bottom-0 h-1/2 md:hidden" />
        <div className="relative mx-auto flex h-full max-w-content items-end px-4 pb-12 md:items-center md:px-8 md:pb-0">
          <div className="max-w-[460px]">
            <p className="cine-eyebrow">Land → Parcel → Data → Risk → Explanation → Action</p>
            <ol className="mt-6 flex gap-1.5" aria-label="Journey steps">
              {STEPS.map((x, i) => (
                <li
                  key={x.k}
                  aria-current={i === step ? 'step' : undefined}
                  className={`h-[3px] flex-1 rounded-full transition-colors duration-500 ${i <= step ? 'bg-mist-50' : 'bg-white/15'}`}
                >
                  <span className="sr-only">{x.k}</span>
                </li>
              ))}
            </ol>
            <div key={step} className="fx-in mt-7" aria-live="polite">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-mist-400">
                {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')} · <span className="text-gis-300">{s.k}</span>
              </p>
              <h2 className="h-section mt-3 !text-[clamp(1.9rem,3.6vw,3.3rem)]">{s.title}</h2>
              <p className="lede mt-4">{s.body}</p>
            </div>
            <p className="mt-10 font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-500">Scroll to continue</p>
          </div>
        </div>
      </div>
    </section>
  );
}
