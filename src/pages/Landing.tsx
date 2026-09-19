import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BellRing,
  BrainCircuit,
  Building2,
  CircuitBoard,
  Database,
  FileSearch,
  Gavel,
  Globe2,
  Layers,
  ListChecks,
  Map,
  Menu,
  Network,
  PlugZap,
  Scale,
  ShieldCheck,
  Target,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/brand';
import { Button, DemoDataBadge, Skeleton } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { PortalLink } from '@/components/transition/Portal';
import { EXPERIENCE_HOME, STANDARD_HOME, preloadExperience, rememberHome } from '@/lib/homeView';
import { useApi } from '@/hooks';
import { fetchSummary } from '@/api/client';
import { RISK_CLASS, RISK_HEX, RISK_ICON, RISK_ORDER } from '@/lib/risk';
import { formatCompact, formatNumber } from '@/lib/format';
import type { PortfolioSummary } from '@/data/types';

/* ------------------------------------------------------------------ copy */

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
  { icon: BrainCircuit, title: 'Milestone delay prediction', text: 'Probability that a case, stage or project misses its next milestone — explained and back-tested.' },
  { icon: ListChecks, title: 'Issue profiling', text: 'Ownership, compensation, documentation, approvals, litigation, R&R and clearances — only the causes that apply to the project type.' },
  { icon: Network, title: 'National hierarchy', text: 'Ministries, States and UTs, divisions and districts — each user sees exactly their jurisdiction.' },
  { icon: Workflow, title: 'Project-type dependencies', text: 'Roads, railways, irrigation, transmission and urban works each carry their own authorities and clearances.' },
  { icon: Layers, title: 'Nine-stage case management', text: 'Lifecycle, milestones, compensation, possession and R&R tracked per parcel.' },
  { icon: Globe2, title: 'Geographic view', text: 'Risk concentration from State to district on administrative boundaries.' },
  { icon: BellRing, title: 'Early warnings', text: 'Milestones flagged before the deadline passes, routed to a named owner.' },
  { icon: PlugZap, title: 'Integration-ready', text: 'Provider contracts for land records, courts, compensation and GIS — synthetic adapters today.' },
];

const PIPELINE = [
  { icon: Database, title: 'Data layer', text: 'Land records, notifications, awards, court and clearance data through provider contracts.' },
  { icon: Layers, title: 'Validation & features', text: 'Completeness scoring, field-gap audit and schedule-versus-progress signals.' },
  { icon: BrainCircuit, title: 'Prediction', text: 'Gradient-boosted ensemble with a time-aware split, benchmarked against a baseline.' },
  { icon: Activity, title: 'Explanation', text: 'Per-case SHAP contributions grouped into factors a reviewer recognises.' },
  { icon: Target, title: 'Human decision', text: 'A named owner accepts, defers or rejects each recommendation. The platform decides nothing.' },
];

const AUDIENCE = ['Central ministries', 'Land acquisition officers', 'District collectorates', 'Project implementation units', 'Infrastructure authorities', 'State nodal departments'];

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';

/* ------------------------------------------------------------- sections */

/** Entry into the optional immersive 3D experience. The 3D code starts loading on hover or focus. */
function ExploreIn3D({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <PortalLink to={EXPERIENCE_HOME} variant="dive" onMouseEnter={preloadExperience} onFocus={preloadExperience} onClick={() => (rememberHome(EXPERIENCE_HOME), onClick?.())} className={cn('focus-ring', className)}>
      {children}
    </PortalLink>
  );
}

const Sparkle = () => (
  <span aria-hidden className="text-brand">
    ✦
  </span>
);

function Nav() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#how', label: 'How it works' },
    { href: '#capabilities', label: 'Capabilities' },
    { href: '#explainability', label: 'Explainability' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className={cn(container, 'flex h-14 items-center justify-between gap-6')}>
        <Link to="/" className="rounded-md focus-ring" aria-label={`${BRAND.product} home`}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Page sections">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink focus-ring">
              {l.label}
            </a>
          ))}
          <Link to="/about" className="rounded-md px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink focus-ring">
            Methodology
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ExploreIn3D className="hidden h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-xs transition-colors hover:border-brand/50 hover:bg-surface-2 lg:inline-flex">
            <Sparkle /> Explore in 3D
          </ExploreIn3D>
          <Link to="/login" className="hidden sm:block">
            <Button size="sm" variant="ghost" tabIndex={-1}>
              Sign in
            </Button>
          </Link>
          <Link to="/dashboard" className="hidden sm:block">
            <Button size="sm" tabIndex={-1}>
              Open dashboard
            </Button>
          </Link>
          <button type="button" onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-3 focus-ring md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-surface px-4 pb-4 pt-2 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2.5 text-base text-ink-2 hover:bg-surface-3">
              {l.label}
            </a>
          ))}
          <Link to="/about" className="block rounded-md px-2 py-2.5 text-base text-ink-2 hover:bg-surface-3">
            Methodology
          </Link>
          <ExploreIn3D onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2.5 text-base font-medium text-ink hover:bg-surface-3">
            <Sparkle /> Explore in 3D
          </ExploreIn3D>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/login">
              <Button variant="secondary" className="w-full" tabIndex={-1}>
                Sign in
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button className="w-full" tabIndex={-1}>
                Open dashboard
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero({ stats }: { stats: PortfolioSummary | null }) {
  return (
    <section className="border-b border-line bg-surface">
      <div className={cn(container, 'grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-24')}>
        <div>
          <p className="text-sm font-medium text-brand">Land acquisition intelligence for infrastructure</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl sm:leading-[1.08]">Predict land acquisition delays before they become project delays.</h1>
          <p className="mt-5 max-w-xl text-md text-ink-2 sm:text-lg">
            {BRAND.product} scores every acquisition case for the risk of missing its next statutory milestone, explains what is driving that risk, and routes the fix to the office
            that owns it — from the ministry down to the district.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/dashboard">
              <Button size="lg" tabIndex={-1}>
                Open the dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/predict">
              <Button size="lg" variant="secondary" tabIndex={-1}>
                Try scenario scoring
              </Button>
            </Link>
          </div>
          <ExploreIn3D className="group mt-5 inline-flex max-w-full items-center gap-3 rounded-full border border-line-strong bg-surface py-1.5 pl-1.5 pr-4 text-sm shadow-xs transition-[border-color,box-shadow] hover:border-brand/50 hover:shadow-pop">
            <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 font-medium text-surface">
              <span aria-hidden>✦</span> Explore in 3D
            </span>
            <span className="min-w-0 truncate text-ink-2">
              <span className="sm:hidden">Immersive tour</span>
              <span className="hidden sm:inline">Walk from land parcel to decision, immersively</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </ExploreIn3D>
          <p className="mt-6 text-sm text-ink-3">
            Demonstration build on synthetic data.{' '}
            <a href="#data" className="link">
              What that means
            </a>
          </p>
        </div>

        <ProductPreview stats={stats} />
      </div>
    </section>
  );
}

/** A real, data-driven slice of the product rather than an illustration. */
function ProductPreview({ stats }: { stats: PortfolioSummary | null }) {
  const dist = stats?.projectRiskDistribution;
  const total = dist ? RISK_ORDER.reduce((a, b) => a + (dist[b] ?? 0), 0) || 1 : 1;
  const topFactors = (stats?.contributors ?? []).slice(0, 4);
  const maxShare = Math.max(0.01, ...topFactors.map((f) => f.share));

  return (
    <figure className="card overflow-hidden shadow-pop" aria-label="Live portfolio snapshot">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-sm font-medium text-ink">Portfolio risk snapshot</p>
        <DemoDataBadge />
      </div>
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        {[
          { label: 'Projects', value: stats ? formatNumber(stats.totals.projects) : null },
          { label: 'Cases scored', value: stats ? formatCompact(stats.totals.cases) : null },
          { label: 'High or critical', value: stats ? formatCompact(stats.totals.highRiskCases) : null },
        ].map((m) => (
          <div key={m.label} className="px-4 py-3.5 sm:px-5">
            <p className="text-xs text-ink-3">{m.label}</p>
            {m.value ? <p className="mt-1 text-xl font-semibold tracking-tight text-ink num">{m.value}</p> : <Skeleton className="mt-2 h-5 w-14" />}
          </div>
        ))}
      </div>

      <div className="px-5 py-4">
        <p className="text-xs font-medium text-ink-2">Projects by predicted risk</p>
        {dist ? (
          <>
            <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-surface-3">
              {RISK_ORDER.map((b) => (
                <span key={b} className="border-r-2 border-surface last:border-r-0" style={{ width: `${((dist[b] ?? 0) / total) * 100}%`, background: RISK_HEX[b] }} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {RISK_ORDER.map((b) => {
                const Icon = RISK_ICON[b];
                return (
                  <li key={b} className="flex items-center gap-1.5 text-xs text-ink-2">
                    <Icon className={cn('h-3.5 w-3.5', RISK_CLASS[b].text)} aria-hidden />
                    {b} <span className="ml-auto font-medium text-ink num sm:ml-0">{dist[b] ?? 0}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <Skeleton className="mt-3 h-10 w-full" />
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        <p className="text-xs font-medium text-ink-2">Leading delay factors across open cases</p>
        {topFactors.length ? (
          <ol className="mt-3 space-y-2.5">
            {topFactors.map((f, i) => (
              <li key={f.group} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11rem)_1fr_2.5rem]">
                <span className="truncate text-ink">{f.group}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full" style={{ width: `${(f.share / maxShare) * 100}%`, background: i === 0 ? 'rgb(var(--c-brand))' : 'rgb(var(--c-brand) / 0.5)' }} />
                </span>
                <span className="text-right text-ink-2 num">{Math.round(f.share * 100)}%</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        )}
      </div>
      {stats && (
        <figcaption className="border-t border-line bg-surface-2 px-5 py-2.5 text-xs text-ink-3">
          Model {stats.model.version ?? stats.model.deployed} · held-out test ROC-AUC <span className="num">{stats.model.test.rocAuc.toFixed(3)}</span>
        </figcaption>
      )}
    </figure>
  );
}

function Audience() {
  return (
    <div className="border-b border-line bg-bg">
      <div className={cn(container, 'flex flex-wrap items-center gap-x-6 gap-y-2 py-5')}>
        <p className="text-xs font-medium text-ink-3">Designed for</p>
        {AUDIENCE.map((a) => (
          <p key={a} className="text-sm text-ink-2">
            {a}
          </p>
        ))}
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, className }: { eyebrow: string; title: string; description?: string; className?: string }) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 text-md text-ink-2">{description}</p>}
    </div>
  );
}

function ProblemSection({ stats }: { stats: PortfolioSummary | null }) {
  return (
    <section id="problem" className="scroll-mt-16 py-16 sm:py-24">
      <div className={container}>
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="The problem"
              title="Land acquisition rarely fails for one reason."
              description="A corridor slips because many small dependencies slip at once — each visible to a different office, none visible to everyone. By the time a delay reaches a review meeting, the window to prevent it has usually closed."
            />
            {stats && (
              <p className="mt-6 border-l-2 border-brand pl-4 text-sm text-ink-2">
                <span className="text-lg font-semibold text-ink num">{formatNumber(stats.totals.highRiskCases)}</span> cases in the demonstration dataset currently carry High or Critical
                risk on their next milestone.
              </p>
            )}
          </div>
          <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {PROBLEMS.map((p) => (
              <li key={p.title}>
                <p.icon className="h-5 w-5 text-ink-3" aria-hidden />
                <h3 className="mt-3 text-base font-semibold text-ink">{p.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 border-y border-line bg-surface py-16 sm:py-24">
      <div className={container}>
        <SectionHeading eyebrow="How it works" title="From records to a decision, in four steps." description="Each step is designed to survive a review meeting: the score is explainable, the forecast is bounded, and the recommendation names an owner." />
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {FLOW.map((f, i) => (
            <li key={f.title} className={cn('border-t-2 pt-5', i === 0 ? 'border-brand' : 'border-line')}>
              <p className="flex items-center gap-2 text-sm text-ink-3">
                <span className="num">0{i + 1}</span>
                <f.icon className="h-4 w-4" aria-hidden />
              </p>
              <h3 className="mt-3 text-base font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-2">{f.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="capabilities" className="scroll-mt-16 py-16 sm:py-24">
      <div className={container}>
        <SectionHeading eyebrow="Capabilities" title="One workspace for the acquisition cell." description="Each capability maps to a decision someone in the acquisition chain has to make this week." />
        <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="bg-surface p-5 sm:p-6">
              <f.icon className="h-5 w-5 text-brand" aria-hidden />
              <h3 className="mt-4 text-base font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-2">{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Explainability({ stats }: { stats: PortfolioSummary | null }) {
  const factors = (stats?.contributors ?? []).slice(0, 6);
  const max = Math.max(0.01, ...factors.map((f) => f.share));
  return (
    <section id="explainability" className="scroll-mt-16 border-y border-line bg-surface py-16 sm:py-24">
      <div className={container}>
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Explainability"
              title="Every number can be traced to its reasons."
              description={`A forecast that cannot be explained cannot be acted on. ${BRAND.product} decomposes each prediction into ranked contributing factors and turns them into recommendations — so the officer reading the screen knows both the number and why.`}
            />
            <Link to="/risk" className="mt-6 inline-block">
              <Button variant="secondary" tabIndex={-1}>
                Explore risk analysis <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="card p-5 sm:p-6">
            <p className="text-sm font-medium text-ink">What is driving predicted delay right now</p>
            <p className="mt-0.5 text-xs text-ink-3">Share of risk-increasing model contribution across all open cases</p>
            {factors.length ? (
              <ol className="mt-5 space-y-3.5">
                {factors.map((f, i) => (
                  <li key={f.group}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink">{f.group}</span>
                      <span className="font-medium text-ink num">{Math.round(f.share * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full" style={{ width: `${(f.share / max) * 100}%`, background: i === 0 ? 'rgb(var(--c-brand))' : 'rgb(var(--c-brand) / 0.5)' }} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-4" style={{ width: `${95 - i * 12}%` }} />
                ))}
              </div>
            )}
            <p className="mt-5 border-t border-line pt-3 text-xs text-ink-3">Contributions explain the model&rsquo;s predictions. They are not a finding that a factor caused a delay.</p>
          </div>
        </div>

        <div className="mt-16">
          <h3 className="text-sm font-medium text-ink-2">Under the hood</h3>
          <ol className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((p, i) => (
              <li key={p.title} className="text-sm">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <p.icon className="h-4 w-4 text-ink-3" aria-hidden />
                  <span>
                    <span className="sr-only">Step {i + 1}: </span>
                    {p.title}
                  </span>
                </p>
                <p className="mt-1 text-ink-2">{p.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function DataNote() {
  return (
    <section id="data" className="scroll-mt-16 py-16 sm:py-20">
      <div className={container}>
        <div className="grid gap-6 rounded-xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[1fr_2fr] lg:gap-12">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">About this demonstration</h2>
            <p className="mt-2 text-sm text-ink-3">Being explicit about what is real matters in land administration.</p>
          </div>
          <dl className="grid gap-5 sm:grid-cols-3">
            {[
              { t: 'Synthetic records', d: 'Every project, parcel, case and outcome is generated for demonstration. None represents an actual proceeding.' },
              { t: 'No government system connected', d: 'Land records, courts and treasury data arrive through synthetic adapters built to documented provider contracts.' },
              { t: 'Real model pipeline', d: 'Training, scoring, SHAP explanations, drift monitoring and gated retraining run for real on that data.' },
            ].map((x) => (
              <div key={x.t}>
                <dt className="text-sm font-semibold text-ink">{x.t}</dt>
                <dd className="mt-1 text-sm text-ink-2">{x.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-line bg-surface py-16 sm:py-20">
      <div className={cn(container, 'flex flex-col items-start justify-between gap-6 md:flex-row md:items-center')}>
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">See where your portfolio is likely to slip.</h2>
          <p className="mt-2 text-md text-ink-2">Sign in with a demonstration profile and work through a live portfolio — every screen is populated and interactive.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/dashboard">
            <Button size="lg" tabIndex={-1}>
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/about">
            <Button size="lg" variant="secondary" tabIndex={-1}>
              Read the methodology
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { title: 'Monitor', links: [['Overview', '/dashboard'], ['Portfolio', '/hierarchy'], ['Projects', '/projects'], ['Risk map', '/map']] },
    { title: 'Risk & action', links: [['Risk analysis', '/risk'], ['Scenario scoring', '/predict'], ['Interventions', '/queue'], ['Alerts', '/alerts']] },
    { title: 'About', links: [['Methodology', '/about'], ['Data & model', '/data'], ['Data sources', '/data-sources'], ['Analytics', '/analytics']] },
  ];

  return (
    <footer className="border-t border-line bg-bg py-12">
      <div className={container}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-3">
              {BRAND.tagline} {BRAND.descriptor} for infrastructure programmes across India.
            </p>
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-sm font-medium text-ink">{c.title}</p>
              <ul className="mt-3 space-y-2">
                {c.links.map(([label, href]) => (
                  <li key={href}>
                    <Link to={href} className="text-sm text-ink-3 transition-colors hover:text-ink">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {BRAND.product} {BRAND.version} · {BRAND.attribution}
          </p>
          <p>Demonstration build. Synthetic data only — not an official government record.</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  // The landing page stays usable if the API is down: figures fall back to
  // skeletons rather than blocking the page.
  const summary = useApi((signal) => fetchSummary(signal), []);
  const stats = summary.data;
  useEffect(() => rememberHome(STANDARD_HOME), []);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero stats={stats} />
        <Audience />
        <ProblemSection stats={stats} />
        <HowItWorks />
        <Capabilities />
        <Explainability stats={stats} />
        <DataNote />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
