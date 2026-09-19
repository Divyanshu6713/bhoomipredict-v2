import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { SECURITY } from '../lib/content';
import { appendAudit, verifyChain } from '../lib/audit';
import { hero } from '../lib/dataset';
import { Reveal } from '../components/Interactive';
import { InApp } from '../components/InApp';

/** A synthetic incoming record and what the privacy boundary does to each field. */
const RECORD = [
  { f: 'owner_name', raw: 'R. K•••• (synthetic)', out: 'OWN-7F3A-12', act: 'pseudonymised' },
  { f: 'aadhaar_no', raw: '•••• •••• 4821', out: null, act: 'dropped' },
  { f: 'bank_account', raw: 'XXXXXXXX9310', out: null, act: 'dropped' },
  { f: 'parcel_id', raw: hero.id, out: hero.id, act: 'kept' },
  { f: 'survey_no', raw: '112/4B', out: 'hash:9c1e…', act: 'hashed' },
  { f: 'compensation', raw: 'Not initiated', out: 'Not initiated', act: 'kept' },
  { f: 'legal_case', raw: 'Case no. + parties', out: 'active: true', act: 'status only' },
];

const ROLE_VIEW: Record<string, string[]> = {
  'Land Acquisition Officer': ['owner_name', 'parcel_id', 'survey_no', 'compensation', 'legal_case'],
  'Project Authority': ['parcel_id', 'compensation'],
  'Legal Officer': ['parcel_id', 'legal_case'],
};

let seeded = false;

export function Security() {
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [role, setRole] = useState<keyof typeof ROLE_VIEW>('Land Acquisition Officer');
  const audit = useStore((s) => s.audit);
  const reduced = useStore((s) => s.reduced);
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!seeded) {
      seeded = true;
      (async () => {
        await appendAudit('system', 'Dataset snapshot v-synthetic-0918 loaded (1 239 parcels)');
        await appendAudit('system', 'Model demo-logit 0.4 scored 161 open cases');
        await appendAudit('Demo Admin', 'Viewed alert center');
      })();
    }
  }, []);
  useEffect(() => {
    verifyChain(audit).then(setValid);
  }, [audit]);

  const run = async () => {
    setRunning(true);
    await new Promise((r) => setTimeout(r, reduced ? 0 : 900));
    setRan(true);
    setRunning(false);
    await appendAudit('ingest', `Record ${hero.id} passed privacy boundary: 2 fields dropped, 1 pseudonymised`);
  };

  return (
    <section id="security" className="relative py-28 md:py-36" aria-labelledby="sec-title">
      <div className="absolute inset-0 bg-cine-950/85" />
      <div className="relative mx-auto max-w-content px-4 md:px-8">
        <Reveal className="max-w-[720px]">
          <p className="cine-eyebrow">Security & privacy</p>
          <h2 id="sec-title" className="h-section mt-3">
            Privacy is a boundary, not a policy page.
          </h2>
          <InApp to="/integrations" className="mt-5">
            APIs &amp; security — sessions, scoped keys and the hash-chained audit trail
          </InApp>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <div className="pe panel overflow-hidden p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-400">Incoming record → analytics layer</p>
              <button className="btn btn-ghost !px-4 !py-2 !text-[11px]" onClick={run} disabled={running} data-cursor="inspect">
                {running ? 'Passing boundary…' : ran ? 'Run again' : 'Run through boundary'}
              </button>
            </div>
            <div className="relative mt-5 grid grid-cols-[1fr_auto_1fr] gap-3 text-[12.5px]">
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">Source (synthetic)</p>
                <ul className="space-y-1.5">
                  {RECORD.map((r) => (
                    <li key={r.f} className="rounded-md border border-white/[0.07] bg-cine-950/50 px-2.5 py-1.5">
                      <span className="block font-mono text-[10px] text-mist-500">{r.f}</span>
                      <span className="text-mist-200">{r.raw}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative flex w-8 justify-center" aria-hidden="true">
                <div className="h-full w-px bg-gradient-to-b from-transparent via-gis-400/70 to-transparent" />
                {running && <div className="absolute inset-x-0 top-0 h-10 animate-[scan_0.9s_linear] bg-gradient-to-b from-transparent via-gis-400/40 to-transparent" />}
                <span className="absolute top-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.2em] text-gis-400">
                  Privacy boundary
                </span>
              </div>
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">Stored for analysis</p>
                <ul className="space-y-1.5">
                  {RECORD.map((r, i) => (
                    <li
                      key={r.f}
                      className={`rounded-md border px-2.5 py-1.5 transition-all duration-500 ${
                        !ran ? 'border-dashed border-white/[0.07] text-transparent' : r.out ? 'border-white/[0.1] bg-cine-950/50' : 'border-[#e0612f]/30 bg-[#e0612f]/[0.05]'
                      }`}
                      style={{ transitionDelay: `${i * 80}ms` }}
                    >
                      <span className={`block font-mono text-[10px] ${ran ? 'text-mist-500' : 'text-transparent'}`}>
                        {r.f} · {r.act}
                      </span>
                      <span className={ran ? (r.out ? 'text-mist-100' : 'text-[#ff9b6a]') : ''}>{ran ? (r.out ?? 'Never stored') : '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {ran && (
              <div className="fx-in mt-5 border-t pt-4 hair">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">Role-based view of the stored record</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.keys(ROLE_VIEW).map((r) => (
                    <button key={r} className="seg-btn !py-1 !text-[11.5px]" aria-pressed={role === r} onClick={() => setRole(r as keyof typeof ROLE_VIEW)}>
                      {r}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] text-mist-300">
                  Sees: {RECORD.filter((r) => r.out && ROLE_VIEW[role].includes(r.f)).map((r) => r.f).join(', ')}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <ul className="grid grid-cols-2 gap-2">
              {SECURITY.map((s, i) => (
                <li key={s.k} className="pe">
                  <Reveal delay={i * 40} className="h-full">
                    <div className="group panel h-full p-3.5 transition-colors hover:!border-gis-400/40" tabIndex={0}>
                      <p className={`text-[13px] font-semibold ${s.k.startsWith('No ') ? 'text-[#8fd1ae]' : 'text-mist-50'}`}>{s.k}</p>
                      <p className="mt-1 text-[11.5px] leading-snug text-mist-400">{s.d}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
            <div className="pe panel p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mist-400">Audit log · this session</p>
                <span className={`font-mono text-[10.5px] ${valid ? 'text-[#8fd1ae]' : 'text-[#ff9b6a]'}`}>{valid == null ? '…' : valid ? 'chain verified ✓' : 'chain broken'}</span>
              </div>
              <ol className="mt-2 max-h-[190px] space-y-1 overflow-y-auto pr-1">
                {[...audit].reverse().map((a) => (
                  <li key={a.seq} className="fx-in grid grid-cols-[28px_1fr] gap-2 border-b py-1.5 text-[12px] hair">
                    <span className="font-mono text-mist-500">#{a.seq}</span>
                    <span>
                      <span className="text-mist-100">{a.action}</span>
                      <span className="block font-mono text-[10px] text-mist-500">
                        {a.actor} · {a.hash.slice(0, 12)}… ← {a.prev.slice(0, 8)}…
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[11px] text-mist-500">SHA-256 chain computed in your browser. Each hash covers the previous one, so edits are detectable.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
