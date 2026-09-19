import { useMemo, useState } from 'react';
import { CineLink as Link } from '../components/CineLink';
import { useStore, LAYERS, ROLES, type LayerId } from '../lib/store';
import { world, today, alerts, openCases, segmentsToday, parcelById, PROJECT_NAME } from '../lib/dataset';
import { ADMIN_UNITS, TODAY } from '../lib/world';
import { parcelInfo, CHECK_FOR } from '../lib/parcelInfo';
import { C, STAGE_RAMP, LANDUSE_COLOR, VILLAGE_COLOR, pct, riskColor } from '../lib/palette';
import { STAGES } from '../lib/stages';
import { scrollToId } from '../lib/scroll';
import { ParcelBody } from '../components/ParcelCards';
import { ROLE_META, roleKpis } from '../lib/roles';

const LEGENDS: Record<LayerId, { c: string; l: string }[]> = {
  parcels: [
    { c: C.gis, l: 'Right-of-way parcel' },
    { c: '#1a222b', l: 'Context parcel' },
  ],
  status: [
    { c: '#475a66', l: 'Pre-award' },
    { c: '#34505e', l: 'Compensation' },
    { c: C.legal, l: 'Litigation' },
    { c: '#50818c', l: 'Possession' },
    { c: C.ok, l: 'Handed over' },
  ],
  risk: [
    { c: C.low, l: 'Low < 30%' },
    { c: C.med, l: 'Medium 30–55%' },
    { c: C.high, l: 'High ≥ 55%' },
  ],
  stage: [
    { c: STAGE_RAMP[0], l: 'Identification' },
    { c: STAGE_RAMP[5], l: 'Valuation' },
    { c: STAGE_RAMP[8], l: 'Litigation' },
    { c: STAGE_RAMP[11], l: 'Handover' },
    { c: STAGE_RAMP[12], l: 'Complete' },
  ],
  ownership: [
    { c: '#263540', l: 'Records reconciled' },
    { c: C.med, l: 'Records unresolved (height = share)' },
    { c: C.gis, l: 'Shared ownership record' },
  ],
  litigation: [
    { c: C.legal, l: 'Active case' },
    { c: '#4a2531', l: 'Case closed' },
  ],
  compensation: [
    { c: C.med, l: 'Pending — not initiated' },
    { c: '#bba374', l: 'Payment in process' },
    { c: C.ok, l: 'Disbursed' },
    { c: '#263540', l: 'Not due yet' },
  ],
  rr: [
    { c: C.med, l: 'R&R pending (height = families)' },
    { c: C.ok, l: 'R&R complete' },
  ],
  construction: [
    { c: C.high, l: 'Blocking a work front' },
    { c: C.med, l: 'Pending' },
    { c: '#316349', l: 'Available for construction' },
  ],
  landuse: Object.entries(LANDUSE_COLOR).map(([l, c]) => ({ c, l })),
  infra: [
    { c: '#a7b4bb', l: 'Existing roads' },
    { c: C.gis, l: 'Power line' },
    { c: '#3a4550', l: 'Planned corridor (dashed)' },
  ],
  admin: ADMIN_UNITS.map((u, i) => ({ c: VILLAGE_COLOR[i], l: `${u.name} (synthetic village)` })),
};

export function Command() {
  const role = useStore((s) => s.role);
  const layer = useStore((s) => s.layer);
  const selected = useStore((s) => s.selected);
  const follow = useStore((s) => s.followCorridor);
  const zoom = useStore((s) => s.zoom);
  useStore((s) => s.audit.length); // KPIs include recorded decisions
  const set = useStore((s) => s.set);
  const [query, setQuery] = useState('');
  const [miss, setMiss] = useState(false);
  const roleDef = ROLES.find((r) => r.id === role)!;

  const chooseRole = (id: (typeof ROLES)[number]['id']) => {
    const r = ROLES.find((x) => x.id === id)!;
    set({ role: id, layer: r.layer, selected: -1 });
  };
  const select = (idx: number) => set({ selected: idx, followCorridor: false });
  const find = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parcelById(query);
    setMiss(!p);
    if (p) select(p.idx);
  };

  return (
    <section id="command" className="relative min-h-[100svh]" aria-labelledby="cc-title">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-cine-950/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-cine-950/80 to-transparent" />
      <div className="relative mx-auto flex min-h-[100svh] max-w-[1480px] flex-col px-4 pb-6 pt-20 md:px-6">
        {/* top bar */}
        <div className="pe flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="cine-eyebrow">Interactive GIS command center · preview</p>
            <h2 id="cc-title" className="mt-1 font-grotesk text-[clamp(1.6rem,2.6vw,2.3rem)] font-semibold tracking-[-0.02em] text-mist-50">
              {PROJECT_NAME} <span className="text-mist-500">· day {TODAY}</span>
            </h2>
          </div>
          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">
              Preview a role on the illustrative scene —{' '}
              <Link to="/login?next=%2Fmap" className="text-mist-200 underline underline-offset-4 hover:text-mist-50">
                sign in for the live command center
              </Link>
            </p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Preview role">
              {ROLES.map((r) => (
                <button key={r.id} role="radio" aria-checked={role === r.id} aria-pressed={role === r.id} className="seg-btn !py-1.5 !text-[12px]" onClick={() => chooseRole(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="pe mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-[13px] text-mist-300">{roleDef.focus}</p>
          <dl className="flex flex-wrap gap-x-6 gap-y-2" aria-label={`${roleDef.label} indicators`}>
            {roleKpis(role).map((k) => (
              <div key={k.l} className="flex items-baseline gap-2">
                <dt className="sr-only">{k.l}</dt>
                <dd
                  className={`font-grotesk text-lg font-semibold ${
                    k.tone === 'high' ? 'text-[#ff9b6a]' : k.tone === 'med' ? 'text-[#f0c77f]' : k.tone === 'ok' ? 'text-[#8fd1ae]' : 'text-mist-50'
                  }`}
                >
                  {k.v}
                </dd>
                <span className="text-[11.5px] text-mist-400" aria-hidden="true">
                  {k.l}
                </span>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-4 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[236px_1fr_340px]">
          {/* layers */}
          <div className="pe panel flex min-w-0 flex-col self-start p-3 lg:max-h-[calc(100svh-230px)]">
            <p className="px-2 pb-2 pt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-mist-400">Layers</p>
            <div role="radiogroup" aria-label="Map layer" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {LAYERS.map((l) => (
                <button
                  key={l.id}
                  role="radio"
                  aria-checked={layer === l.id}
                  onClick={() => set({ layer: l.id })}
                  className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 py-[7px] text-left text-[12.5px] transition-colors ${
                    layer === l.id ? 'bg-mist-50 text-cine-950' : 'text-mist-300 hover:bg-white/5 hover:text-mist-50'
                  }`}
                >
                  {l.label}
                  {layer === l.id && <span className="h-1.5 w-1.5 rounded-full bg-cine-950" />}
                </button>
              ))}
            </div>
            <div className="mt-3 hidden border-t pt-3 hair lg:block">
              <label className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] text-mist-200">
                Follow corridor with cursor
                <input type="checkbox" className="accent-[#72b8c8]" checked={follow} onChange={(e) => set({ followCorridor: e.target.checked, selected: -1 })} />
              </label>
              <div className="mt-1 flex items-center gap-1 px-1">
                <button className="seg-btn !px-3 !py-1" aria-label="Zoom out" onClick={() => set({ zoom: Math.max(0.6, zoom / 1.25) })}>
                  −
                </button>
                <button className="seg-btn !px-3 !py-1" aria-label="Zoom in" onClick={() => set({ zoom: Math.min(3, zoom * 1.25) })}>
                  +
                </button>
                <button className="seg-btn !px-3 !py-1 !text-[11.5px]" onClick={() => set({ zoom: 1, selected: -1, followCorridor: false })}>
                  Reset view
                </button>
              </div>
            </div>
          </div>

          <div className="hidden lg:block" />

          {/* right panel */}
          <div className="pe panel flex max-h-[40svh] min-w-0 flex-col self-start overflow-hidden lg:max-h-[calc(100svh-230px)]">
            {selected >= 0 ? <Drawer idx={selected} onClose={() => set({ selected: -1 })} /> : <RolePanel panel={roleDef.panel} onSelect={select} />}
          </div>
        </div>

        {/* bottom: legend + search */}
        <div className="pe mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5" aria-label={`Legend: ${LAYERS.find((l) => l.id === layer)!.label}`}>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">{LAYERS.find((l) => l.id === layer)!.label}</span>
            {LEGENDS[layer].map((x) => (
              <span key={x.l} className="flex items-center gap-1.5 text-[12px] text-mist-200">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.c }} />
                {x.l}
              </span>
            ))}
          </div>
          <form onSubmit={find} className="panel flex items-center gap-2 px-3 py-1.5" role="search">
            <label htmlFor="pq" className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">
              Find
            </label>
            <input
              id="pq"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMiss(false);
              }}
              placeholder="P-1042"
              className="w-28 bg-transparent py-1 font-mono text-[13px] text-mist-50 placeholder:text-mist-500 focus:outline-none"
            />
            <button className="seg-btn !px-3 !py-1 !text-[11.5px]">Go</button>
            {miss && (
              <span className="text-[12px] text-[#ff9b6a]" role="alert">
                Not found
              </span>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

function Drawer({ idx, onClose }: { idx: number; onClose: () => void }) {
  const set = useStore((s) => s.set);
  const role = useStore((s) => s.role);
  const meta = ROLE_META[role];
  const full = parcelInfo(idx);
  // need-to-know: some roles do not see case contributors
  const info = meta.showContributors ? full : { ...full, contributors: [], next: null };
  return (
    <div className="fx-in overflow-y-auto p-5" role="region" aria-label={`Parcel ${info.id}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-gis-400">Inspecting</span>
        <button className="text-[12px] text-mist-400 hover:text-mist-50" onClick={onClose}>
          Close ✕
        </button>
      </div>
      <ParcelBody info={info} />
      {!meta.showContributors && full.contributors.length > 0 && (
        <p className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-mist-400">
          Case contributors are hidden for the {ROLES.find((r) => r.id === role)!.label} role (need-to-know).
        </p>
      )}
      {info.risk != null && (
        <div className="mt-3">
          <div className="kv">
            <span>Next milestone</span>
            <span>{info.nextMilestone}</span>
          </div>
          <div className="kv">
            <span>Work front</span>
            <span>{info.segment}</span>
          </div>
        </div>
      )}
      {info.risk != null && meta.showContributors && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn btn-primary !px-4 !py-2.5 !text-[11px]"
            data-cursor="explain"
            onClick={() => {
              set({ focusId: info.id, whatIf: {} });
              scrollToId('xai');
            }}
          >
            Explain risk
          </button>
          <button
            className="btn btn-ghost !px-4 !py-2.5 !text-[11px]"
            onClick={() => {
              set({ focusId: info.id });
              scrollToId('officer');
            }}
          >
            Officer review
          </button>
        </div>
      )}
      <p className="mt-4 text-[11.5px] text-mist-500">Dependencies are drawn on the map. Illustrative parcel — live cases are in the dashboard.</p>
    </div>
  );
}

function RolePanel({ panel, onSelect }: { panel: (typeof ROLES)[number]['panel']; onSelect: (idx: number) => void }) {
  const queue = useMemo(
    () =>
      openCases
        .filter((p) => {
          const top = today[p.idx].score!.rows[0];
          return (top.key === 'comp' || top.key === 'owner') && today[p.idx].score!.p >= 0.3;
        })
        .sort((a, b) => today[b.idx].score!.p - today[a.idx].score!.p)
        .slice(0, 14),
    [],
  );
  const cases = useMemo(
    () =>
      openCases
        .filter((p) => p.acq!.legal && TODAY >= p.acq!.entries[3] && TODAY < p.acq!.entries[9])
        .sort((a, b) => today[b.idx].score!.p - today[a.idx].score!.p),
    [],
  );
  const Title = ({ t, n }: { t: string; n?: number }) => (
    <div className="flex items-center justify-between border-b px-5 py-3.5 hair">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-300">{t}</p>
      {n != null && <span className="font-mono text-[11px] text-mist-500">{n}</span>}
    </div>
  );
  const Row = ({ idx, children }: { idx: number; children: React.ReactNode }) => (
    <li>
      <button onClick={() => onSelect(idx)} className="block w-full border-b px-5 py-3 text-left transition-colors hair hover:bg-white/[0.04]" data-cursor="inspect">
        {children}
      </button>
    </li>
  );

  if (panel === 'alerts')
    return (
      <>
        <Title t="Alert center" n={alerts.length} />
        <ul className="overflow-y-auto">
          {alerts.map((a, i) => (
            <Row key={a.id} idx={a.idx}>
              <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ff9b6a]">
                <span aria-hidden="true">⚠</span> High-risk case detected {i === 0 && <span className="rounded bg-[#e0612f]/20 px-1.5 text-[9px]">new</span>}
              </p>
              <p className="mt-1 flex items-baseline justify-between text-[13.5px] text-mist-50">
                <span>
                  Parcel {a.id} <span className="text-mist-500">· {a.segment}</span>
                </span>
                <span className="font-grotesk text-lg font-semibold text-[#ff9b6a]">{pct(a.p)}</span>
              </p>
              <p className="text-[12px] text-mist-400">
                Next: {a.next} · Top contributor: {a.top}
              </p>
            </Row>
          ))}
        </ul>
      </>
    );
  if (panel === 'queue')
    return (
      <>
        <Title t="Intervention queue" n={queue.length} />
        <ul className="overflow-y-auto">
          {queue.map((p) => {
            const s = today[p.idx].score!;
            return (
              <Row key={p.id} idx={p.idx}>
                <p className="flex items-baseline justify-between text-[13.5px] text-mist-50">
                  Parcel {p.id}
                  <span className="font-mono text-[12px]" style={{ color: riskColor(s.p) }}>
                    {pct(s.p)}
                  </span>
                </p>
                <p className="text-[12px] text-mist-300">Check: {CHECK_FOR[s.rows[0].key]}</p>
              </Row>
            );
          })}
        </ul>
      </>
    );
  if (panel === 'fronts')
    return (
      <>
        <Title t="Construction work fronts" n={segmentsToday.length} />
        <ul className="overflow-y-auto">
          {segmentsToday.map((s) => {
            const worst = world.row
              .filter((p) => p.segment === s.segment && today[p.idx].band)
              .sort((a, b) => today[b.idx].score!.p - today[a.idx].score!.p)[0];
            return (
              <Row key={s.name} idx={worst ? worst.idx : -1}>
                <p className="flex items-baseline justify-between text-[13.5px] text-mist-50">
                  Work front {s.name}
                  <span className="font-mono text-[11.5px] text-mist-400">
                    {s.ready}/{s.total} possessed
                  </span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${s.share * 100}%`, background: s.share >= 0.8 ? C.ok : s.high >= 6 ? C.high : C.med }} />
                </div>
                <p className="mt-1.5 text-[12px] text-mist-400">{s.high} high-risk parcels pending{worst ? ` · worst ${worst.id}` : ''}</p>
              </Row>
            );
          })}
        </ul>
      </>
    );
  if (panel === 'cases')
    return (
      <>
        <Title t="Active legal matters" n={cases.length} />
        <ul className="overflow-y-auto">
          {cases.map((p) => {
            const s = today[p.idx].score!;
            return (
              <Row key={p.id} idx={p.idx}>
                <p className="flex items-baseline justify-between text-[13.5px] text-mist-50">
                  Parcel {p.id} <span className="text-[12px] text-mist-500">work front C{p.segment + 1}</span>
                </p>
                <p className="text-[12px] text-mist-400">
                  Stage {STAGES[Math.min(11, s.stage)]} · risk {pct(s.p)} · case status only (no case content)
                </p>
              </Row>
            );
          })}
        </ul>
      </>
    );
  // survey
  const byUse = world.parcels.reduce<Record<string, number>>((a, p) => ((a[p.landUse] = (a[p.landUse] ?? 0) + 1), a), {});
  return (
    <>
      <Title t="Survey & boundaries" />
      <div className="overflow-y-auto p-5">
        <p className="text-[12.5px] text-mist-300">Parcel geometry is synthetic (Voronoi) — not cadastral data.</p>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">Land use</p>
        <ul className="mt-2 space-y-1">
          {Object.entries(byUse).map(([k, v]) => (
            <li key={k} className="flex items-center justify-between text-[12.5px] text-mist-200">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LANDUSE_COLOR[k] }} />
                {k}
              </span>
              <span className="font-mono text-mist-400">{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">Administrative units</p>
        <ul className="mt-2 space-y-1">
          {ADMIN_UNITS.map((u, i) => (
            <li key={u.name} className="flex items-center justify-between text-[12.5px] text-mist-200">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: VILLAGE_COLOR[i] }} />
                {u.name}
              </span>
              <span className="font-mono text-mist-400">{world.parcels.filter((p) => p.village === i).length} parcels</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
