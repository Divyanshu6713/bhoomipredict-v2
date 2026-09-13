import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Brain,
  ChevronRight,
  ClipboardList,
  Database,
  FileBarChart,
  FileStack,
  Gauge,
  Globe2,
  History,
  Info,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Map,
  Menu,
  Moon,
  Network,
  Search,
  Settings2,
  ShieldAlert,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, DemoDataBadge } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useApi, useDebounced, useOnClickOutside, useTheme } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchAlerts, fetchCases, fetchHealth, fetchNotifications, fetchProjects } from '@/api/client';
import { RISK_CLASS } from '@/lib/risk';
import { SEVERITY_CLASS } from '@/lib/status';
import { formatDate } from '@/lib/format';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  permission?: string;
}

const TRACK_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Command Centre', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: Gauge },
  { to: '/cases', label: 'Cases & Parcels', icon: Map },
  { to: '/map', label: 'GIS Risk Map', icon: Globe2 },
];

const PREDICT_NAV: NavItem[] = [
  { to: '/risk', label: 'AI Risk', icon: ShieldAlert },
  { to: '/predict', label: 'Scenario Scoring', icon: Brain },
  { to: '/queue', label: 'Intervention Queue', icon: ListChecks },
  { to: '/alerts', label: 'Alert Centre', icon: Bell },
];

const REVIEW_NAV: NavItem[] = [
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/documents', label: 'Documents', icon: FileStack },
  { to: '/registry', label: 'Authority Registry', icon: Network },
  { to: '/data', label: 'Data & Model', icon: Database },
  { to: '/about', label: 'Methodology', icon: Info },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Administration', icon: Settings2, permission: 'admin.view' },
  { to: '/audit', label: 'Audit Trail', icon: History, permission: 'audit.view' },
];

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Acquisition Command Centre', subtitle: 'Portfolio position, predicted milestone risk and where to intervene first — scoped to your jurisdiction' },
  '/projects': { title: 'Acquisition Projects', subtitle: 'Registry across the nine-stage statutory lifecycle' },
  '/projects/new': { title: 'New Project', subtitle: 'Validated against the authority registry, geography and lifecycle rules' },
  '/cases': { title: 'Cases & Parcels', subtitle: 'Parcel-level acquisition cases with predicted milestone risk' },
  '/predict': { title: 'Scenario Scoring', subtitle: 'Test a project context and interventions against the model and the dependency network' },
  '/risk': { title: 'AI Risk Intelligence', subtitle: 'Stage, district and factor-level decomposition of predicted delay' },
  '/queue': { title: 'Intervention Queue', subtitle: 'Data-driven interventions with owners, due dates and workflow status' },
  '/alerts': { title: 'Alert Centre', subtitle: 'Rule-driven alerts on risk, deadlines, blockages and backlogs in your jurisdiction' },
  '/map': { title: 'GIS Risk Map', subtitle: 'India → state → district → project, on administrative boundaries' },
  '/analytics': { title: 'Portfolio Analytics', subtitle: 'Stage throughput, district performance and model behaviour' },
  '/data': { title: 'Data & Model', subtitle: 'Corpus composition, data quality, model card and exports' },
  '/reports': { title: 'Reports', subtitle: 'MIS review packs and dataset exports' },
  '/documents': { title: 'Document Repository', subtitle: 'Notifications, awards, land records and survey documents by project, stage and case' },
  '/registry': { title: 'Authority & Dependency Registry', subtitle: 'Frameworks, project types and state profiles that decide who owns each step' },
  '/admin': { title: 'Administration', subtitle: 'Projects, CSV upload, retraining, model metrics and data consistency' },
  '/audit': { title: 'Audit Trail', subtitle: 'Every recorded change, with user, role, before and after' },
  '/profile': { title: 'My Profile', subtitle: 'Role, jurisdiction, assignments and notifications' },
  '/about': { title: 'Methodology', subtitle: 'How the platform produces, explains and bounds its forecasts' },
};

function NavGroup({ items, label, onNavigate }: { items: NavItem[]; label: string; onNavigate?: () => void }) {
  return (
    <div>
      <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">{label}</p>
      <nav className="space-y-0.5">
        {items.map(({ to, label: text, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all duration-200',
                isActive ? 'bg-white/[0.09] text-white shadow-inset' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-all duration-300', isActive ? 'opacity-100' : '-translate-x-1 opacity-0')} />
                <Icon className={cn('h-[17px] w-[17px] shrink-0 transition-colors', isActive && 'text-brand')} />
                <span className="truncate">{text}</span>
                {typeof badge === 'number' && badge > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 num">{badge > 999 ? `${(badge / 1000).toFixed(1)}k` : badge}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useOnClickOutside<HTMLDivElement>(() => setOpen(false));
  const debounced = useDebounced(query.trim(), 260);
  const enabled = debounced.length >= 2;

  const projects = useApi((signal) => (enabled ? fetchProjects({ q: debounced, pageSize: 5 }, signal) : Promise.resolve(null)), [debounced, enabled]);
  const cases = useApi((signal) => (enabled ? fetchCases({ q: debounced, pageSize: 4, status: 'all' }, signal) : Promise.resolve(null)), [debounced, enabled]);

  const hasResults = (projects.data?.projects.length ?? 0) > 0 || (cases.data?.rows.length ?? 0) > 0;
  const busy = enabled && (projects.loading || cases.loading || projects.refreshing || cases.refreshing);
  const go = (to: string) => {
    navigate(to);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search projects, districts, authorities, villages, case IDs…"
        className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-10 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus-ring"
      />
      {busy && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-3" />}

      {open && enabled && (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-[440px] overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-pop animate-scale-in">
          {!hasResults && !busy && <p className="px-3 py-6 text-center text-xs text-ink-3">No matches for “{debounced}” in your jurisdiction.</p>}
          {(projects.data?.projects.length ?? 0) > 0 && (
            <>
              <p className="label-xs px-3 py-2">Projects</p>
              {projects.data!.projects.map((p) => (
                <button key={p.id} onClick={() => go(`/projects/${p.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2">
                  <span className="font-mono text-[11px] text-ink-3">{p.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{p.name}</span>
                  <span className={cn('text-[11px] font-bold num', RISK_CLASS[p.riskBand].text)}>{p.riskScore}%</span>
                </button>
              ))}
            </>
          )}
          {(cases.data?.rows.length ?? 0) > 0 && (
            <>
              <p className="label-xs px-3 py-2">Cases</p>
              {cases.data!.rows.map((c) => (
                <button key={c.caseId} onClick={() => go(`/cases/${c.caseId}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2">
                  <span className="font-mono text-[11px] text-ink-3">{c.caseId}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                    {c.village}, {c.district}
                  </span>
                  <span className={cn('text-[11px] font-bold num', RISK_CLASS[c.riskBand].text)}>{c.riskScore}%</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WarningBell() {
  const [open, setOpen] = useState(false);
  const ref = useOnClickOutside<HTMLDivElement>(() => setOpen(false));
  const { pathname } = useLocation();
  const notifications = useApi((signal) => fetchNotifications(signal), [pathname]);
  const alerts = useApi((signal) => (open ? fetchAlerts({ status: 'UNREAD', focus: '1', pageSize: 6 }, signal) : Promise.resolve(null)), [open]);
  const total = notifications.data?.total ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`${total} notifications`}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-ring"
      >
        <Bell className="h-[18px] w-[18px]" />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white num">{total > 99 ? '99+' : total}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-scale-in">
          <div className="border-b border-line px-4 py-3">
            <p className="font-display text-sm font-bold text-ink">Notifications</p>
            <p className="text-[11px] text-ink-3 num">
              {notifications.data?.unreadAlerts ?? 0} unread alerts in your focus areas · {notifications.data?.openAssigned ?? 0} actions assigned to your role
            </p>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {(alerts.data?.items ?? []).map((a) => (
              <Link key={a.id} to={a.link} onClick={() => setOpen(false)} className="flex gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-surface-2">
                <span className={cn('mt-0.5 h-fit rounded-md border px-1.5 py-0.5 text-[10px] font-bold', SEVERITY_CLASS[a.severity])}>{a.severity}</span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{a.title}</p>
                  <p className="truncate text-[11px] text-ink-3">{a.project.name}</p>
                  <p className="mt-0.5 text-[10px] text-ink-3">{formatDate(a.date)}</p>
                </div>
              </Link>
            ))}
            {alerts.loading && <p className="px-4 py-6 text-center text-xs text-ink-3">Loading…</p>}
            {!alerts.loading && (alerts.data?.items.length ?? 0) === 0 && <p className="px-4 py-6 text-center text-xs text-ink-3">No unread alerts in your focus areas.</p>}
          </div>
          <div className="grid grid-cols-2 border-t border-line">
            <Link to="/alerts" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1 bg-surface-2 px-4 py-2.5 text-xs font-semibold text-brand hover:bg-surface-3">
              Alert centre <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/queue?mine=1" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1 border-l border-line bg-surface-2 px-4 py-2.5 text-xs font-semibold text-brand hover:bg-surface-3">
              My actions <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useOnClickOutside<HTMLDivElement>(() => setOpen(false));
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const initials = user.name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 py-1.5 pl-1.5 pr-3 transition-colors hover:border-line-strong focus-ring">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-navy-800 text-[11px] font-bold text-white">{initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[12.5px] font-semibold text-ink">{user.name}</span>
          <span className="block max-w-[190px] truncate text-[10px] text-ink-3">
            {user.roleLabel} · {user.scopeLabel}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop animate-scale-in">
          <div className="border-b border-line px-3 py-3">
            <p className="text-[13px] font-semibold text-ink">{user.name}</p>
            <p className="text-[11px] leading-snug text-ink-3">{user.designation}</p>
            <p className="text-[11px] leading-snug text-ink-3">{user.department}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge className="border-brand/25 bg-brand/10 text-brand">{user.roleLabel}</Badge>
              <Badge>{user.scopeLabel}</Badge>
              <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">Demo profile</Badge>
            </div>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <UserRound className="h-4 w-4" /> My profile & assignments
          </button>
          <button
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-4 w-4" /> Sign out / switch profile
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const { can } = useAuth();

  const health = useApi((signal) => fetchHealth(signal), []);
  const notifications = useApi((signal) => fetchNotifications(signal), [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const predictNav = useMemo(
    () =>
      PREDICT_NAV.map((n) =>
        n.to === '/queue' ? { ...n, badge: notifications.data?.openAssigned ?? 0 } : n.to === '/alerts' ? { ...n, badge: notifications.data?.unreadAlerts ?? 0 } : n,
      ),
    [notifications.data],
  );
  const adminNav = ADMIN_NAV.filter((n) => !n.permission || can(n.permission));

  const page =
    PAGE_TITLES[pathname] ??
    (pathname.endsWith('/edit')
      ? { title: 'Edit Project', subtitle: 'Changes are validated, re-scored and written to the audit trail' }
      : pathname.startsWith('/projects/')
        ? { title: 'Project Intelligence', subtitle: 'Authorities, lifecycle, case backlog, risk, explanation and actions' }
        : pathname.startsWith('/cases/')
          ? { title: 'Case Intelligence', subtitle: 'One acquisition case, its blockers, predicted milestone risk and why' }
          : { title: 'BhoomiPredict', subtitle: '' });

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 grid-lines">
      <div className="flex items-center justify-between px-5 py-5">
        <Link to="/" className="focus-ring rounded-lg">
          <Logo tone="light" />
        </Link>
        <button onClick={() => setMobileOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 lg:hidden" aria-label="Close navigation">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        <NavGroup items={TRACK_NAV} label="Track" onNavigate={() => setMobileOpen(false)} />
        <NavGroup items={predictNav} label="Predict & act" onNavigate={() => setMobileOpen(false)} />
        <NavGroup items={REVIEW_NAV} label="Review" onNavigate={() => setMobileOpen(false)} />
        {adminNav.length > 0 && <NavGroup items={adminNav} label="Administer" onNavigate={() => setMobileOpen(false)} />}
      </div>

      <div className="border-t border-white/[0.07] p-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60', health.data?.ok ? 'animate-ping bg-emerald-400' : 'bg-rose-400')} />
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', health.data?.ok ? 'bg-emerald-400' : 'bg-rose-400')} />
            </span>
            <p className="text-[11px] font-bold text-white/80">{health.data?.ok ? 'Model service online' : health.loading ? 'Connecting…' : 'API unreachable'}</p>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/40">
            {health.data ? `${health.data.rows.toLocaleString('en-IN')} cases · ${health.data.projects} projects · SHAP ${health.data.shap ? 'on' : 'off'}` : 'Start the API with npm run dev'}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[268px] animate-slide-in-right">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button onClick={() => setMobileOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2 lg:hidden focus-ring" aria-label="Open navigation">
              <Menu className="h-[18px] w-[18px]" />
            </button>
            <div className="hidden min-w-0 flex-1 md:block">
              <GlobalSearch />
            </div>
            <div className="flex-1 md:hidden" />
            <div className="flex shrink-0 items-center gap-2">
              <DemoDataBadge className="hidden xl:inline-flex" />
              <button onClick={toggle} aria-label="Toggle colour theme" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-ring">
                {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              </button>
              <WarningBell />
              <UserMenu />
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <h1 className="font-display text-lg font-extrabold tracking-tight text-ink sm:text-xl">{page.title}</h1>
              {page.subtitle && <p className="mt-0.5 text-xs text-ink-3">{page.subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" dot="bg-emerald-500">
                Snapshot {health.data?.today ? formatDate(health.data.today) : '—'}
              </Badge>
              <Link to="/queue?mine=1" className="hidden sm:block">
                <Button size="sm" className="gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" /> My actions
                  {(notifications.data?.openAssigned ?? 0) > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[10px] num">{notifications.data?.openAssigned}</span>}
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-7">
          <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
        </main>

        <footer className="border-t border-line px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-ink-3">
            <p className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              SYNTHETIC DEMO DATA — not an official acquisition record; project locations are not real project sites.
            </p>
            <p>BhoomiPredict · AI decision support for land acquisition · v2.1</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
