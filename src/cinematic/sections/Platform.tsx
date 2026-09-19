/**
 * Landing sections carried over from the previous landing page — now inside the
 * 3D experience and fed by the live platform API (/api/summary).
 */
import { CineLink as Link } from '../components/CineLink';
import {
  Activity,
  ArrowRight,
  BellRing,
  BrainCircuit,
  Building2,
  CircuitBoard,
  FileSearch,
  Gavel,
  Globe2,
  Layers,
  ListChecks,
  Map,
  Network,
  PlugZap,
  Scale,
  ShieldCheck,
  Target,
  Users,
  Workflow,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { Reveal, Tilt, CountUp } from '../components/Interactive';
import type { RiskLevel } from '@/data/types';

const PROBLEMS = [
  { icon: Scale, title: 'Ownership disputes', text: 'Fragmented and contested titles force repeated verification before an award can be declared.' },
  { icon: Gavel, title: 'Litigation', text: 'Writ petitions and stay orders take whole stretches of alignment off the critical path.' },
  { icon: Building2, title: 'Compensation', text: 'Valuation disagreements and treasury sequencing stall disbursement long after awards.' },
  { icon: FileSearch, title: 'Documentation', text: 'Mutation gaps and record mismatches block awards even where there is no dispute.' },
  { icon: Map, title: 'Survey backlogs', text: 'Joint measurement delays leave parcels outside the acquisition pipeline entirely.' },
  { icon: CircuitBoard, title: 'Utility relocation', text: 'Unscheduled electricity, water and telecom crossings prevent possession.' },
  { icon: Workflow, title: 'File movement', text: 'Hand-offs between revenue, legal and project offices exceed disposal norms.' },
  { icon: Users, title: 'Public objections', text: 'Objections filed in the statutory window accumulate faster than they are disposed.' },
  { icon: ShieldCheck, title: 'Clearances', text: 'Environmental and forest conditions surface late and force rework.' },
];

const FLOW = [
  { icon: Activity, title: 'Score every project and parcel', text: 'Each open case is scored for the probability that its next statutory milestone slips by more than 30 days.' },
  { icon: BrainCircuit, title: 'Forecast the milestone', text: 'Stage-level forecasts show expected slip and completion, not just a status label.' },
  { icon: ListChecks, title: 'Explain the prediction', text: 'Every score carries its ranked contributing factors, so it can be defended in a review meeting.' },
  { icon: Target, title: 'Route the action', text: 'Recommendations become interventions with a named owner, a due date and a workflow status.' },
];

const FEATURES = [
  { icon: BrainCircuit, title: 'Milestone delay prediction', text: 'Probability that a case, stage or project misses its next milestone — explained and back-tested.', to: '/risk' },
  { icon: ListChecks, title: 'Issue profiling', text: 'Ownership, compensation, documentation, approvals, litigation, R&R and clearances — only the causes that apply to the project type.', to: '/cases' },
  { icon: Network, title: 'National hierarchy', text: 'Ministries, States and UTs, divisions and districts — each user sees exactly their jurisdiction.', to: '/hierarchy' },
  { icon: Workflow, title: 'Project-type dependencies', text: 'Roads, railways, irrigation, transmission and urban works each carry their own authorities and clearances.', to: '/projects' },
  { icon: Layers, title: 'Nine-stage case management', text: 'Lifecycle, milestones, compensation, possession and R&R tracked per parcel.', to: '/cases' },
  { icon: Globe2, title: 'Geographic view', text: 'Risk concentration from State to district on administrative boundaries — in 2D and 3D.', to: '/map' },
  { icon: BellRing, title: 'Early warnings', text: 'Milestones flagged before the deadline passes, routed to a named owner.', to: '/alerts' },
  { icon: PlugZap, title: 'Integration-ready', text: 'Provider contracts for land records, courts, compensation and GIS — synthetic adapters today.', to: '/integrations' },
];

const AUDIENCE = ['Central ministries', 'Land acquisition officers', 'District collectorates', 'Project implementation units', 'Infrastructure authorities', 'State nodal departments'];

const BANDS: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];
const BAND_HEX: Record<RiskLevel, string> = { Low: '#5f9b86', Medium: '#e1a43c', High: '#e0612f', Critical: '#d8443a' };

export function Causes() {
  const summary = useStore((s) => s.summary);
  return (
    <section id="causes" className="relative py-28 md:py-36" aria-labelledby="causes-title">
      <div className="absolute inset-0 bg-cine-950/80" />
      <div className="relative mx-auto grid max-w-content gap-12 px-4 md:px-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <Reveal>
          <p className="cine-eyebrow">Why corridors slip</p>
          <h2 id="causes-title" className="h-section mt-3">
            Land acquisition rarely fails for one reason.
          </h2>
          <p className="lede mt-4">
            A corridor slips because many small dependencies slip at once — each visible to a different office, none visible to everyone. By the time a delay
            reaches a review meeting, the window to prevent it has usually closed.
          </p>
          {summary && (
            <p className="mt-8 border-l-2 border-gis-400 pl-4 text-[14px] text-mist-300">
              <CountUp value={summary.totals.highRiskCases} className="font-grotesk text-2xl font-semibold text-mist-50" /> cases in the demonstration dataset
              currently carry High or Critical risk on their next milestone.
            </p>
          )}
        </Reveal>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <li key={p.title}>
              <Reveal delay={i * 50} className="h-full">
                <Tilt className="h-full">
                  <div className="pe panel h-full p-5 transition-colors hover:!border-white/25" data-cursor="explore">
                    <p.icon className="h-5 w-5 text-gis-300" aria-hidden />
                    <h3 className="mt-4 text-[15px] font-semibold text-mist-50">{p.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-mist-400">{p.text}</p>
                  </div>
                </Tilt>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LivePortfolio() {
  const summary = useStore((s) => s.summary);
  const dist = summary?.projectRiskDistribution;
  const total = dist ? BANDS.reduce((a, b) => a + (dist[b] ?? 0), 0) || 1 : 1;
  const factors = (summary?.contributors ?? []).slice(0, 6);
  const maxShare = Math.max(0.01, ...factors.map((f) => f.share));
  const t = summary?.totals;
  return (
    <section id="live" className="relative py-28 md:py-36" aria-labelledby="live-title">
      <div className="absolute inset-0 bg-cine-950/80" />
      <div className="relative mx-auto max-w-content px-4 md:px-8">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-[680px]">
            <div className="flex flex-wrap items-center gap-2">
              <p className="cine-eyebrow">Live from the platform</p>
              <span className="tag">{summary ? 'Connected to the API' : 'Connecting…'}</span>
            </div>
            <h2 id="live-title" className="h-section mt-3">
              Every number here comes from the running model.
            </h2>
            <p className="lede mt-4">
              The corridor above is an illustrative scene. These figures are the platform&rsquo;s own scores across the synthetic national corpus — the same
              data every dashboard screen uses.
            </p>
          </div>
          <Link to="/risk" className="btn btn-ghost pe shrink-0">
            Explore risk analysis <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Reveal>
            <div className="pe panel h-full p-6">
              <div className="grid grid-cols-3 gap-4 border-b pb-5 hair">
                {[
                  ['Projects', t?.projects],
                  ['Open cases', t?.openCases],
                  ['High or critical', t?.highRiskCases],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">{l}</p>
                    {v == null ? (
                      <span className="mt-2 block h-7 w-16 animate-pulse rounded bg-white/10" />
                    ) : (
                      <CountUp value={v as number} className="mt-1 block font-grotesk text-3xl font-semibold text-mist-50" />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[13px] font-medium text-mist-200">Projects by predicted risk</p>
              {dist ? (
                <>
                  <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/5">
                    {BANDS.map((b) => (
                      <span key={b} className="border-r-2 border-cine-900 last:border-r-0" style={{ width: `${((dist[b] ?? 0) / total) * 100}%`, background: BAND_HEX[b] }} />
                    ))}
                  </div>
                  <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                    {BANDS.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-[12.5px] text-mist-300">
                        <span className="h-2 w-2 rounded-full" style={{ background: BAND_HEX[b] }} />
                        {b} <span className="font-mono text-mist-50">{dist[b] ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <span className="mt-3 block h-10 animate-pulse rounded bg-white/5" />
              )}
              {summary && (
                <p className="mt-6 border-t pt-4 text-[12px] text-mist-500 hair">
                  Model {summary.model.version ?? summary.model.deployed} · held-out test ROC-AUC{' '}
                  <span className="font-mono text-mist-300">{summary.model.test.rocAuc.toFixed(3)}</span> on synthetic data — not a measure of real-world accuracy.
                </p>
              )}
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="pe panel h-full p-6">
              <p className="text-[13px] font-medium text-mist-200">What is driving predicted delay right now</p>
              <p className="mt-0.5 text-[12px] text-mist-500">Share of risk-increasing model contribution across all open cases</p>
              {factors.length ? (
                <ol className="mt-5 space-y-3.5">
                  {factors.map((f, i) => (
                    <li key={f.group}>
                      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <span className="text-mist-100">{f.group}</span>
                        <span className="font-mono text-mist-50">{Math.round(f.share * 100)}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${(f.share / maxShare) * 100}%`, background: i === 0 ? '#e1a43c' : 'rgba(225,164,60,0.5)' }} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-5 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="block h-4 animate-pulse rounded bg-white/5" style={{ width: `${95 - i * 12}%` }} />
                  ))}
                </div>
              )}
              <p className="mt-5 border-t pt-3 text-[12px] text-mist-500 hair">Contributions explain the model&rsquo;s predictions. They are not a finding that a factor caused a delay.</p>
            </div>
          </Reveal>
        </div>

        <ol className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="How it works">
          {FLOW.map((f, i) => (
            <li key={f.title}>
              <Reveal delay={i * 70}>
                <div className={`border-t-2 pt-5 ${i === 0 ? 'border-gis-400' : 'border-white/10'}`}>
                  <p className="flex items-center gap-2 font-mono text-[11px] text-mist-500">
                    0{i + 1} <f.icon className="h-4 w-4" aria-hidden />
                  </p>
                  <h3 className="mt-3 text-[15px] font-semibold text-mist-50">{f.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-mist-400">{f.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Capabilities() {
  return (
    <section id="capabilities" className="relative py-28 md:py-36" aria-labelledby="cap-title">
      <div className="absolute inset-0 bg-cine-950/80" />
      <div className="relative mx-auto max-w-content px-4 md:px-8">
        <Reveal className="max-w-[720px]">
          <p className="cine-eyebrow">Capabilities</p>
          <h2 id="cap-title" className="h-section mt-3">
            One workspace for the acquisition cell.
          </h2>
          <p className="lede mt-4">Each capability maps to a decision someone in the acquisition chain has to make this week — and opens the screen that does it.</p>
        </Reveal>
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <li key={f.title}>
              <Reveal delay={i * 50} className="h-full">
                <Tilt className="h-full">
                  <Link to={f.to} className="pe panel group flex h-full flex-col p-5 transition-colors hover:!border-gis-400/50" data-cursor="explore">
                    <f.icon className="h-5 w-5 text-gis-300" aria-hidden />
                    <h3 className="mt-4 text-[15px] font-semibold text-mist-50">{f.title}</h3>
                    <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-mist-400">{f.text}</p>
                    <span className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist-500 transition-colors group-hover:text-gis-300">
                      Open {f.to} →
                    </span>
                  </Link>
                </Tilt>
              </Reveal>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-6 hair">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-500">Designed for</p>
          {AUDIENCE.map((a) => (
            <p key={a} className="text-[13.5px] text-mist-300">
              {a}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
