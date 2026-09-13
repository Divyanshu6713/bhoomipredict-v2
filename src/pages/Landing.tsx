import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BellRing,
  BrainCircuit,
  Building2,
  ChevronRight,
  CircuitBoard,
  Database,
  FileSearch,
  Gavel,
  Globe2,
  LayoutDashboard,
  Layers,
  Network,
  PlugZap,
  ListChecks,
  Map,
  Menu,
  Play,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/brand';
import { AnimatedNumber, Badge, Button, Card, DemoDataBadge, SectionTitle } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { HeroVisual } from '@/components/landing/HeroVisual';
import { createContext, useContext } from 'react';
import { useApi, useInView } from '@/hooks';
import { fetchSummary } from '@/api/client';
import type { PortfolioSummary } from '@/data/types';

/**
 * The landing page quotes live portfolio figures. One fetch at the top is shared
 * with every section through this context, so the marketing copy can never drift
 * from what the platform actually holds.
 */
const StatsContext = createContext<PortfolioSummary | null>(null);
const useStats = () => useContext(StatsContext);

/* ------------------------------------------------------------------ data */

const PROBLEMS = [
  { icon: Scale, title: 'Ownership disputes', text: 'Fragmented and contested titles force repeated verification cycles before an award can be declared.' },
  { icon: Gavel, title: 'Legal cases', text: 'Writ petitions and stay orders remove entire stretches of alignment from the critical path.' },
  { icon: Building2, title: 'Compensation issues', text: 'Valuation disagreements and treasury sequencing stall disbursement long after awards are declared.' },
  { icon: FileSearch, title: 'Documentation problems', text: 'Mutation gaps and record mismatches block award declaration even where there is no dispute.' },
  { icon: Map, title: 'Survey delays', text: 'Joint measurement backlogs leave parcels outside the acquisition pipeline entirely.' },
  { icon: CircuitBoard, title: 'Utility relocation', text: 'Unscheduled electricity, water and telecom crossings prevent possession certification.' },
  { icon: Workflow, title: 'Administrative bottlenecks', text: 'File movement between revenue, legal and project offices routinely exceeds disposal norms.' },
  { icon: Users, title: 'Public objections', text: 'Objections filed under the statutory window accumulate faster than they are disposed.' },
  { icon: ShieldCheck, title: 'Environmental approvals', text: 'Clearance conditions surface late and force rework on already-acquired stretches.' },
];

const FLOW = [
  { step: 'Risk', icon: Activity, title: 'Score every project and parcel', text: 'A composite risk score is computed from litigation load, compensation lag, documentation state and objection density.' },
  { step: 'Prediction', icon: BrainCircuit, title: 'Predict the next milestone, not just status', text: 'The model returns the probability that a specific statutory milestone slips by more than 30 days, per case and per stage.' },
  { step: 'Explanation', icon: ListChecks, title: 'Show what moved the prediction', text: 'Every prediction carries its ranked contributing factors, so the number can be defended in a review meeting.' },
  { step: 'Action', icon: Target, title: 'Prioritise where review matters', text: 'A ranked queue of project-stage cells, each with a recommended review and a named human owner.' },
];

const FEATURES = [
  { icon: BrainCircuit, title: 'Milestone delay prediction', text: 'The probability that a case, stage or project misses its next statutory milestone by more than 30 days — explained and back-tested.' },
  { icon: ListChecks, title: 'Land-acquisition issue profiling', text: 'Ownership, compensation, documentation, approvals, litigation, R&R, clearances, utilities and more — only the causes that apply to the project type.' },
  { icon: Network, title: 'National administrative hierarchy', text: 'Central ministries, organisations, zones, all 28 States and 8 UTs, divisions and districts — each user sees exactly their jurisdiction.' },
  { icon: Workflow, title: 'Project-type dependencies', text: 'Roads, railways, irrigation, transmission and urban works each carry their own authorities, frameworks and clearances.' },
  { icon: Layers, title: 'Nine-stage case management', text: 'Lifecycle, milestones, compensation, possession and R&R tracked per parcel across the statutory pipeline.' },
  { icon: Globe2, title: 'Geographic intelligence', text: 'India → State → district risk concentration on official administrative boundaries.' },
  { icon: BellRing, title: 'Early warnings & interventions', text: 'Milestones flagged before the deadline passes, each routed to a named owner with a ranked, evidence-backed action.' },
  { icon: PlugZap, title: 'Government data integration-ready', text: 'Provider contracts for land records, courts, compensation, notifications, clearances and GIS — synthetic adapters today, official sources tomorrow.' },
];

const PIPELINE = [
  { icon: Database, title: 'Data integration layer', text: 'Land records, notifications, awards, court and clearance data through provider contracts — synthetic in this prototype.' },
  { icon: Layers, title: 'Validation & features', text: 'Completeness scoring, field-gap audit, stage-date normalisation and engineered schedule-versus-progress signals.' },
  { icon: BrainCircuit, title: 'ML prediction', text: 'A gradient-boosted ensemble trained with a time-aware split, benchmarked against a logistic baseline.' },
  { icon: Activity, title: 'Explainability', text: 'Per-case SHAP contributions, grouped into the operational factors a reviewer recognises.' },
  { icon: Target, title: 'Human decision', text: 'A ranked prompt with a named owner who accepts, defers or rejects it. The platform decides nothing.' },
];

const AUDIENCE = [
  'Central Ministries & Organisations',
  'Land Acquisition Officers',
  'District Collectorates',
  'Project Implementation Units',
  'Infrastructure Authorities',
  'State Nodal Departments',
];

/* ------------------------------------------------------------- sections */

function Nav() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#problem', label: 'Problem' },
    { href: '#solution', label: 'Solution' },
    { href: '#features', label: 'Features' },
    { href: '#how', label: 'How it works' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-navy-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3.5 lg:px-8">
        <Link to="/" className="focus-ring rounded-lg">
          <Logo tone="light" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/about"
            className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            Methodology
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="hidden sm:block">
            <Button size="sm" className="gap-1.5">
              Explore Platform <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <button
            onClick={() => setOpen((o) => !o)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/70 md:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/[0.07] px-5 py-3 md:hidden">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/5"
            >
              {l.label}
            </a>
          ))}
          <Link to="/dashboard" className="mt-2 block">
            <Button size="sm" className="w-full">
              Explore Platform
            </Button>
          </Link>
        </div>
      )}
    </header>
  );
}

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  return (
    <div
      ref={ref}
      className={cn('transition-all duration-700', inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function Hero() {
  const stats = useStats();
  return (
    <section className="relative overflow-hidden bg-navy-950">
      <div className="absolute inset-0 grid-lines opacity-60" />
      <div className="absolute -left-40 top-0 h-[420px] w-[420px] rounded-full bg-brand/20 blur-[130px]" />
      <div className="absolute -right-24 top-40 h-[360px] w-[360px] rounded-full bg-accent-teal/10 blur-[120px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-8 lg:py-24">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-brand/30 bg-brand/10 text-brand-ink" dot="bg-brand">
              National Land Acquisition Intelligence · Prototype
            </Badge>
            <DemoDataBadge />
          </div>

          <h1 className="mt-6 font-display text-[38px] font-extrabold leading-[1.08] tracking-tight text-white sm:text-[52px] lg:text-[56px]">
            Anticipate{' '}
            <span className="relative inline-block">
              <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[#7BA4FF] to-[#4F8BFF]">
                Bottlenecks.
              </span>
              <span className="absolute inset-x-0 bottom-1.5 z-0 h-3 rounded bg-brand/25" />
            </span>{' '}
            Accelerate Infrastructure.
          </h1>

          <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-white/60">
            {BRAND.product} is a land acquisition intelligence, delay-risk prediction and decision support platform
            for infrastructure across India — identifying the ownership, compensation, approval, legal and clearance
            bottlenecks behind a delay, from the ministry down to the district, before the milestone slips.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/dashboard">
              <Button size="lg" className="gap-2">
                Explore Platform <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/predict">
              <Button size="lg" variant="outline" className="gap-2 border-white/20 text-white hover:bg-white/10 hover:border-white/35">
                <Play className="h-4 w-4" /> View Demo
              </Button>
            </Link>
          </div>

          <div className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {[
              { value: stats?.totals.projects ?? 0, label: 'Acquisition projects tracked', suffix: '' },
              { value: (stats?.totals.cases ?? 0) / 1000, label: 'Parcel-level cases scored (thousands)', suffix: 'k', decimals: 0 },
              { value: stats?.model.test.rocAuc ?? 0, label: 'Test ROC-AUC on held-out milestones', suffix: '', decimals: 3 },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-display text-[26px] font-extrabold leading-none text-white">
                  <AnimatedNumber value={s.value} decimals={s.decimals ?? 0} suffix={s.suffix} />
                </p>
                <p className="mt-1.5 text-[11px] leading-tight text-white/40">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-pop backdrop-blur-sm animate-float">
            <HeroVisual />
          </div>
        </div>
      </div>

      {/* audience strip */}
      <div className="relative border-t border-white/[0.07] bg-navy-900/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 lg:px-8">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/30">Built for</p>
          {AUDIENCE.map((a) => (
            <p key={a} className="text-[12.5px] font-semibold text-white/45">
              {a}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const stats = useStats();
  return (
    <section id="problem" className="bg-bg py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal>
          <SectionTitle
            eyebrow="The Problem"
            title="Land acquisition rarely fails for one reason."
            description="A corridor slips because a dozen small dependencies slip at once — each visible to a different office, none visible to everyone. By the time a delay is recorded in a review meeting, the window to prevent it has usually closed."
            className="max-w-3xl"
          />
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <Reveal key={p.title} delay={i * 55}>
              <Card className="group h-full p-5 card-hover">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/10 text-rose-500 transition-transform duration-300 group-hover:scale-110">
                  <p.icon className="h-[18px] w-[18px]" />
                </span>
                <h3 className="mt-4 font-display text-[15px] font-bold text-ink">{p.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{p.text}</p>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center gap-6 rounded-2xl border border-line bg-surface px-6 py-5 shadow-card">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
                <TrendingUp className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-lg font-extrabold text-ink num">
                  <AnimatedNumber value={stats?.totals.highRiskCases ?? 0} /> cases
                </p>
                <p className="text-[11.5px] text-ink-3">carry High or Critical predicted risk on their next milestone right now</p>
              </div>
            </div>
            <div className="h-10 w-px bg-line" />
            <p className="max-w-md text-[13px] leading-relaxed text-ink-2">
              That exposure is concentrated in a small number of project-stage cells. Finding them before the deadline
              passes is the entire value of the platform.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SolutionSection() {
  return (
    <section id="solution" className="relative overflow-hidden bg-navy-950 py-20 lg:py-24">
      <div className="absolute inset-0 grid-lines opacity-50" />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal>
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7BA4FF]">
              The Solution
            </p>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-[32px] sm:leading-[1.15]">
              From historical records to a decision, in four steps.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-white/55">
              {BRAND.product} does not stop at a risk label. Each stage of the chain is designed to survive a review
              meeting — the score is explainable, the forecast is bounded, and the recommendation names an owner.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((f, i) => (
            <Reveal key={f.step} delay={i * 90}>
              <div className="group relative h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand/35 hover:bg-white/[0.055]">
                {i < FLOW.length - 1 && (
                  <ChevronRight className="absolute -right-[13px] top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-white/20 lg:block" />
                )}
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-[#7BA4FF] transition-transform duration-300 group-hover:scale-110">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-[34px] font-extrabold leading-none text-white/[0.07] num">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7BA4FF]">{f.step}</p>
                <h3 className="mt-1.5 font-display text-[15.5px] font-bold leading-snug text-white">{f.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/50">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="bg-bg py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal>
          <SectionTitle
            eyebrow="Capabilities"
            title="Everything a land acquisition cell needs in one workspace."
            description="Eight capabilities, each mapped to a decision someone in the acquisition chain has to make this week."
            align="center"
          />
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 50}>
              <Card className="group relative h-full overflow-hidden p-5 card-hover">
                <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand/[0.06] transition-transform duration-500 group-hover:scale-150" />
                <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand transition-transform duration-300 group-hover:scale-110">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="relative mt-4 font-display text-[15px] font-bold text-ink">{f.title}</h3>
                <p className="relative mt-1.5 text-[13px] leading-relaxed text-ink-2">{f.text}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ImpactSection() {
  const live = useStats();
  const stats = [
    {
      value: live?.totals.projects ?? 0,
      label: 'Acquisition projects',
      caption: `across ${live?.totals.states ?? 0} states and ${live?.totals.districts ?? 0} districts`,
      icon: LayoutDashboard,
      accent: '#3B72F0',
    },
    {
      value: live?.totals.cases ?? 0,
      label: 'Parcel-level cases tracked',
      caption: 'with stage, ownership, compensation and legal status',
      icon: Layers,
      accent: '#0EA5A4',
    },
    {
      value: live?.totals.highRiskCases ?? 0,
      label: 'High-risk cases identified',
      caption: 'flagged for early review before the milestone falls due',
      icon: ShieldCheck,
      accent: '#F97316',
    },
    {
      value: live?.totals.delayedMilestones ?? 0,
      label: 'Milestones already overdue',
      caption: 'projects past their current stage deadline',
      icon: TrendingUp,
      accent: '#E11D48',
    },
  ];

  return (
    <section className="relative overflow-hidden bg-navy-900 py-20 lg:py-24">
      <div className="absolute inset-0 grid-lines opacity-40" />
      <div className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-brand/10 blur-[140px]" />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7BA4FF]">
                Impact
              </p>
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-[32px]">
                What the platform is watching right now.
              </h2>
            </div>
            <DemoDataBadge />
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 80}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
                <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${s.accent}, transparent)` }} />
                <span
                  className="grid h-11 w-11 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `${s.accent}22`, color: s.accent }}
                >
                  <s.icon className="h-5 w-5" />
                </span>
                <p className="mt-5 font-display text-[38px] font-extrabold leading-none tracking-tight text-white">
                  <AnimatedNumber value={s.value} duration={1800} />
                </p>
                <p className="mt-2.5 text-[13px] font-bold text-white/80">{s.label}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/40">{s.caption}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={180}>
          <p className="mt-8 text-center text-[11.5px] text-white/35">
            All figures are generated from a fixed synthetic corpus for demonstration. They do not represent any
            actual project, department or acquisition proceeding.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="how" className="bg-bg py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal>
          <SectionTitle
            eyebrow="How It Works"
            title="A pipeline that ends in an instruction, not a chart."
            align="center"
          />
        </Reveal>

        <div className="relative mt-14">
          <div className="absolute left-0 right-0 top-[26px] hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent lg:block" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((p, i) => (
              <Reveal key={p.title} delay={i * 90}>
                <div className="relative text-center lg:text-left">
                  <div className="relative mx-auto mb-5 grid h-[54px] w-[54px] place-items-center rounded-2xl border border-line bg-surface shadow-card lg:mx-0">
                    <p.icon className="h-[22px] w-[22px] text-brand" />
                    <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white num">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="font-display text-[14.5px] font-bold text-ink">{p.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{p.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={120}>
          <Card className="mt-14 grid gap-8 p-7 lg:grid-cols-[1.2fr_1fr] lg:p-9">
            <div>
              <Badge className="border-brand/25 bg-brand/10 text-brand">Explainability by default</Badge>
              <h3 className="mt-4 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                Every number on the screen can be traced back to a cause.
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
                A forecast that cannot be explained cannot be acted on. {BRAND.product} decomposes each prediction into
                ranked contributing factors and converts those factors directly into recommendations — so the officer
                reading the screen knows both the number and the reason behind it.
              </p>
              <Link to="/predict" className="mt-6 inline-block">
                <Button className="gap-2">
                  Try the prediction engine <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-5">
              <p className="label-xs">Why is this project at risk?</p>
              {[
                { label: 'Pending legal cases', v: 32, c: '#E11D48' },
                { label: 'Ownership complexity', v: 24, c: '#F97316' },
                { label: 'Compensation delays', v: 18, c: '#F59E0B' },
                { label: 'Documentation issues', v: 12, c: '#3B72F0' },
                { label: 'Public objections', v: 8, c: '#0EA5A4' },
                { label: 'Other factors', v: 6, c: '#94A3B8' },
              ].map((r, i) => (
                <div key={r.label} className="mt-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] font-semibold text-ink">{r.label}</span>
                    <span className="text-[12.5px] font-bold text-ink num">{r.v}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full animate-grow-bar"
                      style={{ ['--bar-w' as string]: `${r.v * 3}%`, width: `${r.v * 3}%`, background: r.c, animationDelay: `${i * 80}ms` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-navy-950 py-20 lg:py-28">
      <div className="absolute inset-0 grid-lines opacity-50" />
      <div className="absolute left-1/2 top-1/2 h-[360px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 blur-[150px]" />

      <div className="relative mx-auto max-w-3xl px-5 text-center lg:px-8">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11.5px] font-semibold text-white/70">
            <Sparkles className="h-3.5 w-3.5 text-[#7BA4FF]" />
            Decision support for infrastructure delivery
          </span>
          <h2 className="mt-6 font-display text-[30px] font-extrabold leading-tight tracking-tight text-white sm:text-[40px]">
            Turn land acquisition data into actionable intelligence.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-white/55">
            Open the dashboard and work through a live portfolio of monitored corridors — every screen is populated
            and interactive from the first click.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/dashboard">
              <Button size="lg" className="gap-2">
                Launch Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/about">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:border-white/35">
                Read the methodology
              </Button>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { title: 'Track', links: [['Command Centre', '/dashboard'], ['National Portfolio', '/hierarchy'], ['Projects', '/projects'], ['GIS Risk Map', '/map']] },
    { title: 'Predict', links: [['AI Risk', '/risk'], ['Scenario Scoring', '/predict'], ['Intervention Queue', '/queue'], ['Alert Centre', '/alerts']] },
    { title: 'Review', links: [['Analytics', '/analytics'], ['Data Sources', '/data-sources'], ['Data & Model', '/data'], ['About & Methodology', '/about']] },
  ];

  return (
    <footer className="border-t border-white/[0.07] bg-navy-950 py-12">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-[12.5px] leading-relaxed text-white/40">
              {BRAND.tagline} Land acquisition intelligence, delay-risk prediction and decision support for
              infrastructure programmes across India.
            </p>
            <div className="mt-4">
              <DemoDataBadge />
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/30">{c.title}</p>
              <ul className="mt-3.5 space-y-2">
                {c.links.map(([label, href]) => (
                  <li key={href}>
                    <Link to={href} className="text-[13px] text-white/55 transition-colors hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-6 text-[11.5px] text-white/35">
          <p>
            {BRAND.product} · {BRAND.version} · <span className="font-semibold text-white/60">{BRAND.attribution}</span>
          </p>
          <p>Demonstration build. Synthetic data only — not an official government record.</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  // The landing page stays usable if the API is down: every figure falls back to
  // a dash rather than blocking the page behind a loading state.
  const summary = useApi((signal) => fetchSummary(signal), []);

  return (
    <StatsContext.Provider value={summary.data}>
    <div className="min-h-screen bg-bg">
      <Nav />
      <Hero />
      <ProblemSection />
      <SolutionSection />
      <FeaturesSection />
      <ImpactSection />
      <HowItWorksSection />
      <FinalCta />
      <Footer />
    </div>
    </StatsContext.Provider>
  );
}
