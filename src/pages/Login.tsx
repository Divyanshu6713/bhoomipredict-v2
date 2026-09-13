import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, Check, Info, Landmark, Loader2, Search, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, DemoDataBadge, Select } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { AdministrativeChain, PositionBreadcrumb } from '@/components/hierarchy/AdministrativeChain';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchDemoUsers, fetchHierarchy, fetchHierarchyOptions } from '@/api/client';
import { BRAND } from '@/lib/brand';
import type { AuthorityTier, HierarchyConfig, RoleId, User } from '@/data/types';

type Mode = 'directory' | 'configure';

const TIER_FILTERS: Array<{ id: 'all' | AuthorityTier; label: string }> = [
  { id: 'all', label: 'All levels' },
  { id: 'national', label: 'National' },
  { id: 'region', label: 'Region / Zone' },
  { id: 'state', label: 'State / UT' },
  { id: 'district', label: 'District' },
];

/**
 * Sign-in for the demonstration. There is no identity provider in the
 * prototype, so a user either picks a directory profile or configures a
 * position anywhere in the national hierarchy. Either way the API enforces
 * the jurisdiction and permissions that come with it.
 */
export default function Login() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) === 'configure' ? 'configure' : 'directory');
  const next = params.get('next') || '/dashboard';

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="flex min-h-screen flex-col bg-navy-900 grid-lines">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="focus-ring rounded-lg">
            <Logo tone="light" />
          </Link>
          <DemoDataBadge />
        </div>

        <div className="mt-10 max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FFB866]">{BRAND.tagline}</p>
          <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-tight text-white sm:text-[34px]">Sign in to {BRAND.product}</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-white/60">
            Your administrative position decides what you see: a national authority sees every State and UT, a ministry sees its sector, a zone or state sees its own portfolio, and a district officer sees the district. The API enforces the same scope and permissions.
          </p>
        </div>

        <div className="mt-6 inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1" role="tablist">
          {(
            [
              ['directory', 'Directory profiles', Users],
              ['configure', 'Configure a position', SlidersHorizontal],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn('flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors', mode === id ? 'bg-white text-navy-900' : 'text-white/60 hover:text-white')}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div className="mt-6">{mode === 'directory' ? <Directory next={next} /> : <Configure next={next} />}</div>
      </div>

      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-[11.5px] text-white/40">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
            Demonstration profiles and synthetic data. Names are illustrative personas, not real officials; no government identity system is connected.
          </p>
          <p>
            {BRAND.product} · <span className="font-semibold text-white/60">{BRAND.attribution}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------- directory */

function Directory({ next }: { next: string }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const users = useApi((signal) => fetchDemoUsers(signal), []);
  const [tier, setTier] = useState<'all' | AuthorityTier>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = users.data?.users ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length };
    for (const u of list) c[u.scope === 'division' ? 'district' : u.scope] = (c[u.scope === 'division' ? 'district' : u.scope] ?? 0) + 1;
    return c;
  }, [list]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = new Map<string, User[]>();
    for (const u of list) {
      const t = u.scope === 'division' ? 'district' : u.scope;
      if (tier !== 'all' && t !== tier) continue;
      if (q && !`${u.name} ${u.designation} ${u.department} ${u.roleLabel} ${u.scopeLabel}`.toLowerCase().includes(q)) continue;
      const key = u.position.governmentLevel === 'central' ? 'Government of India' : u.position.lineage.find((l) => l.kind === 'state_government')?.name ?? 'State governments';
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(u);
    }
    return Array.from(out.entries()).sort((a, b) => (a[0] === 'Government of India' ? -1 : b[0] === 'Government of India' ? 1 : a[0].localeCompare(b[0])));
  }, [list, tier, query]);

  const choose = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await signIn(id);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {TIER_FILTERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTier(t.id)}
            className={cn('rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors', tier === t.id ? 'border-brand/60 bg-brand/25 text-white' : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white')}
          >
            {t.label} <span className="ml-1 text-white/40 num">{counts[t.id] ?? 0}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ministry, state, role…" className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-8 pr-3 text-[13px] text-white placeholder:text-white/35 focus-ring" />
        </div>
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-rose-300">{error}</p>}
      {users.loading && <p className="mt-10 text-white/60">Loading profiles…</p>}
      {users.error && <p className="mt-10 text-rose-300">Could not reach the API: {users.error.message}</p>}
      {!users.loading && grouped.length === 0 && list.length > 0 && <p className="mt-10 text-[13px] text-white/50">No profile matches. Try another level, or configure a position.</p>}

      <div className="mt-6 space-y-7">
        {grouped.map(([group, members]) => (
          <div key={group}>
            <p className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
              {group === 'Government of India' ? <Landmark className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />} {group}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((u) => (
                <button
                  key={u.id}
                  onClick={() => choose(u.id)}
                  disabled={busy !== null}
                  className={cn('group rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-all hover:border-brand/50 hover:bg-white/[0.07]', busy === u.id && 'border-brand/60')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-white">{u.name}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-white/60">{u.designation}</p>
                    </div>
                    {busy === u.id ? <Loader2 className="h-4 w-4 animate-spin text-white/60" /> : <ArrowRight className="h-4 w-4 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" />}
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-white/45">{u.department}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge className="border-brand/30 bg-brand/15 text-[#9DBBFF]">
                      <ShieldCheck className="h-3 w-3" /> {u.roleLabel}
                    </Badge>
                    <Badge className="border-white/15 bg-white/5 text-white/65">{u.position.tierLabel}</Badge>
                  </div>
                  <PositionBreadcrumb position={u.position} className="mt-2.5 text-white/45 [&_.font-semibold]:text-white/75" />
                  <p className="mt-1.5 text-[10.5px] text-white/35">{u.permissions.length ? `${u.permissions.length} write permissions` : 'Read-only'} · {u.position.portfolio.label}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- configure */

type Government = 'central' | 'state';

function Configure({ next }: { next: string }) {
  const { signInWithPosition } = useAuth();
  const navigate = useNavigate();
  const config = useApi((signal) => fetchHierarchy(signal), []);
  const [government, setGovernment] = useState<Government>('central');
  const [ministry, setMinistry] = useState('in:morth');
  const [centralOrg, setCentralOrg] = useState('');
  const [stateName, setStateName] = useState('');
  const [stateOrg, setStateOrg] = useState('');
  const [units, setUnits] = useState<{ region?: string; state?: string; division?: string; district?: string }>({});
  const [role, setRole] = useState<RoleId | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgId = government === 'central' ? centralOrg || ministry : stateOrg || (stateName ? `st:${config.data?.states.find((s) => s.id === stateName)?.code}` : '');

  const options = useApi(
    (signal) => (orgId ? fetchHierarchyOptions({ orgId, ...units }, signal) : Promise.resolve(null)),
    [orgId, units.region, units.state, units.division, units.district],
  );

  // A role that is not held at the chosen tier is dropped rather than silently kept.
  useEffect(() => {
    const roles = options.data?.roles ?? [];
    if (roles.length && !roles.some((r) => r.id === role)) setRole(roles[0].id);
  }, [options.data?.roles, role]);

  const setUnit = (level: 'region' | 'state' | 'division' | 'district', value: string) => {
    setUnits((u) => {
      const order = ['region', 'state', 'division', 'district'] as const;
      const nextUnits = { ...u, [level]: value || undefined };
      for (const lv of order.slice(order.indexOf(level) + 1)) delete nextUnits[lv];
      return nextUnits;
    });
  };

  const submit = async () => {
    if (!orgId || !role) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPosition(role, { orgId, units });
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (config.error) return <p className="text-rose-300">Could not load the hierarchy: {config.error.message}</p>;
  if (!config.data) return <p className="text-white/60">Loading the national hierarchy…</p>;
  const h = config.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="card space-y-5 p-5">
        <Step n={1} title="Authority" hint="Which government the position belongs to">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['central', 'Central Government', 'Ministries and central organisations'],
                ['state', 'State / UT Government', 'All 28 States and 8 Union Territories'],
              ] as const
            ).map(([id, label, desc]) => (
              <button
                key={id}
                onClick={() => {
                  setGovernment(id);
                  setUnits({});
                }}
                className={cn('rounded-xl border px-3 py-2.5 text-left transition-colors', government === id ? 'border-brand/50 bg-brand/[0.07]' : 'border-line bg-surface-2 hover:border-line-strong')}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  {government === id && <Check className="h-3.5 w-3.5 text-brand" />} {label}
                </span>
                <span className="block text-[11px] text-ink-3">{desc}</span>
              </button>
            ))}
          </div>
        </Step>

        <Step n={2} title="Organisation" hint={government === 'central' ? 'Ministry, then optionally an organisation under it' : 'State or UT, then the department or agency'}>
          {government === 'central' ? (
            <CentralPicker h={h} ministry={ministry} centralOrg={centralOrg} onMinistry={(v) => { setMinistry(v); setCentralOrg(''); setUnits({}); }} onCentralOrg={(v) => { setCentralOrg(v); setUnits({}); }} />
          ) : (
            <StatePicker h={h} stateName={stateName} stateOrg={stateOrg} onState={(v) => { setStateName(v); setStateOrg(''); setUnits({}); }} onStateOrg={(v) => { setStateOrg(v); setUnits({}); }} />
          )}
        </Step>

        <Step n={3} title="Jurisdiction" hint="Leave a level on “All” to hold the position above it">
          {!orgId ? (
            <p className="text-[12px] text-ink-3">Choose an organisation first.</p>
          ) : !options.data ? (
            <p className="text-[12px] text-ink-3">{options.error ? options.error.message : 'Loading levels…'}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(['region', 'state', 'division', 'district'] as const)
                .filter((lv) => options.data!.options[lv] !== undefined && (lv !== 'district' || options.data!.options.district!.length > 0))
                .map((lv) => {
                  const opts = options.data!.options[lv]!;
                  const fixed = lv === 'state' && government === 'state';
                  const label = lv === 'region' ? options.data!.position.chain.find((r) => r.level === 'region')?.label ?? 'Region / Zone' : lv === 'state' ? 'State / UT' : lv === 'division' ? 'Division' : 'District';
                  if (fixed) return null;
                  if (lv === 'division' && opts.length === 0) return null;
                  return (
                    <Select
                      key={lv}
                      label={label}
                      value={units[lv] ?? ''}
                      onChange={(v) => setUnit(lv, v)}
                      options={[{ label: { region: 'All regions / zones', state: 'All States & UTs', division: 'All divisions', district: 'All districts' }[lv], value: '' }, ...opts.map((o) => ({ label: `${o.label}${o.projects ? ` · ${o.projects} project${o.projects === 1 ? '' : 's'}` : ' · no demo projects'}`, value: o.id }))]}
                    />
                  );
                })}
            </div>
          )}
        </Step>

        <Step n={4} title="Role" hint="Roles normally held at this level">
          <Select label="Role" value={role} onChange={(v) => setRole(v as RoleId)} options={(options.data?.roles ?? []).map((r) => ({ label: r.permissions || /read-only/.test(r.label) ? r.label : `${r.label} (read-only)`, value: r.id }))} />
          {options.data && role && <p className="mt-1.5 text-[11px] text-ink-3">{options.data.roles.find((r) => r.id === role)?.summary}</p>}
        </Step>
      </div>

      <div className="card flex flex-col p-5">
        <p className="label-xs">Position preview</p>
        {options.data ? (
          <>
            <p className="mt-2 font-display text-[16px] font-extrabold leading-snug text-ink">{options.data.position.organisation.name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge className="border-brand/25 bg-brand/10 text-brand">{options.data.position.tierLabel} scope</Badge>
              <Badge>{options.data.position.organisation.kindLabel}</Badge>
            </div>
            <AdministrativeChain position={options.data.position} className="mt-4" />
            <div className="mt-4 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[12px] text-ink-2">
              <p>
                <span className="font-display text-[18px] font-extrabold text-ink num">{options.data.projectsInPosition}</span> demo project{options.data.projectsInPosition === 1 ? '' : 's'} in this scope
              </p>
              <p className="mt-0.5 text-[11px] text-ink-3">Portfolio: {options.data.position.portfolio.label}</p>
              {options.data.projectsInPosition === 0 && <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">The synthetic corpus has no projects here. The position still works; screens will show empty states.</p>}
            </div>
            {options.data.position.organisation.illustrative && <p className="mt-2 text-[11px] text-ink-3">{options.data.position.organisation.description}</p>}
          </>
        ) : (
          <p className="mt-3 text-[12px] text-ink-3">Choose an organisation to preview the position.</p>
        )}
        {error && <p className="mt-3 text-[12px] font-medium text-rose-600">{error}</p>}
        <div className="mt-auto pt-5">
          <Button className="w-full gap-2" disabled={!options.data || !role || busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Sign in with this position
          </Button>
          <p className="mt-2 text-center text-[10.5px] text-ink-3">Session-only demo officer. National administration is available from the directory.</p>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-brand text-[10.5px] font-bold text-white">{n}</span>
        <p className="font-display text-[14px] font-bold text-ink">{title}</p>
        <p className="text-[11px] text-ink-3">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function CentralPicker({ h, ministry, centralOrg, onMinistry, onCentralOrg }: { h: HierarchyConfig; ministry: string; centralOrg: string; onMinistry: (v: string) => void; onCentralOrg: (v: string) => void }) {
  const tops = h.organisations.filter((o) => o.kind === 'ministry' || o.kind === 'coordinating_authority');
  const children = h.organisations.filter((o) => o.parentId === ministry && o.kind === 'central_organisation');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label="Ministry / national authority"
        value={ministry}
        onChange={onMinistry}
        options={tops.map((o) => ({ label: `${o.name}${o.lens === 'oversight' ? ' (oversight)' : ''}`, value: o.id }))}
      />
      <Select
        label="Organisation (optional)"
        value={centralOrg}
        onChange={onCentralOrg}
        options={[{ label: children.length ? 'Ministry level' : 'No organisations configured', value: '' }, ...children.map((o) => ({ label: o.name, value: o.id }))]}
      />
      <p className="text-[11px] leading-relaxed text-ink-3 sm:col-span-2">{h.organisations.find((o) => o.id === (centralOrg || ministry))?.description ?? `Portfolio: ${h.organisations.find((o) => o.id === (centralOrg || ministry))?.portfolio ?? ''}`}</p>
    </div>
  );
}

function StatePicker({ h, stateName, stateOrg, onState, onStateOrg }: { h: HierarchyConfig; stateName: string; stateOrg: string; onState: (v: string) => void; onStateOrg: (v: string) => void }) {
  const state = h.states.find((s) => s.id === stateName);
  const govId = state ? `st:${state.code}` : '';
  const departments = h.organisations.filter((o) => o.parentId === govId && o.kind === 'state_department');
  const agencies = h.organisations.filter((o) => o.parentId === govId && o.kind === 'state_agency');
  const states = h.states.filter((s) => s.type === 'State');
  const uts = h.states.filter((s) => s.type !== 'State');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label="State / Union Territory"
        value={stateName}
        onChange={onState}
        options={[{ label: 'Select a State or UT', value: '' }, ...states.map((s) => ({ label: s.label, value: s.id })), ...uts.map((s) => ({ label: `${s.label} (UT)`, value: s.id }))]}
      />
      <Select
        label="Department / agency"
        value={stateOrg}
        onChange={onStateOrg}
        options={
          state
            ? [{ label: `${state.government} (whole government)`, value: '' }, ...departments.map((o) => ({ label: o.name, value: o.id })), ...agencies.map((o) => ({ label: `Agency · ${o.name}`, value: o.id }))]
            : [{ label: 'Select a State or UT first', value: '' }]
        }
      />
      {state && (
        <p className="text-[11px] leading-relaxed text-ink-3 sm:col-span-2">
          {state.officialName} · {state.type} · {state.zonalCouncil} zone · {state.profile === 'configured' ? 'state profile configured in the registry' : 'generic designations (no state profile configured yet)'}
          {state.divisions ? ` · ${state.divisions} revenue divisions` : ''}
        </p>
      )}
    </div>
  );
}
