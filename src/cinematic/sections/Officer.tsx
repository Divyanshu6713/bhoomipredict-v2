import { useState } from 'react';
import { useStore } from '../lib/store';
import { world, hero, today } from '../lib/dataset';
import { OFFICER_CHECKS } from '../lib/content';
import { CHECK_FOR } from '../lib/parcelInfo';
import { pct } from '../lib/palette';
import { appendAudit } from '../lib/audit';
import { Reveal } from '../components/Interactive';
import { InApp } from '../components/InApp';

const FLOW = [
  { k: 'AI identifies risk', ai: true },
  { k: 'AI explains contributing signals', ai: true },
  { k: 'AI suggests checks', ai: true },
  { k: 'The authorized officer decides', ai: false },
];

/** The same three choices an officer has on an intervention in the dashboard: Accept, Escalate, No action needed. */
const DECISIONS = ['Accept — assign the checks', 'Escalate to senior officer', 'No action needed'] as const;

export function Officer() {
  const focusId = useStore((s) => s.focusId);
  const parcel = world.byId.get(focusId) ?? hero;
  const sc = today[parcel.idx].score;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [decision, setDecision] = useState<(typeof DECISIONS)[number] | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ seq: number; hash: string } | null>(null);
  const [err, setErr] = useState('');
  const isHero = parcel === hero;
  const contributors = sc ? sc.rows.filter((r) => r.contribution > 0.05).slice(0, 3) : [];
  const checks = isHero
    ? OFFICER_CHECKS
    : contributors.map((c, i) => ({ id: `x${i}`, text: CHECK_FOR[c.key], owner: 'Assigned desk' })).concat([OFFICER_CHECKS[3]]);
  const reviewed = checks.filter((c) => checked[c.id]).length;
  const step = done ? 3 : reviewed > 0 ? 2 : 1;

  const submit = async () => {
    if (!decision) return setErr('Choose a decision.');
    if (reviewed === 0) return setErr('Review at least one suggested check first.');
    if (note.trim().length < 4) return setErr('Add a short officer note — decisions need a recorded reason.');
    setErr('');
    const e = await appendAudit('Demo Officer (LAO)', `${parcel.id}: ${decision} — ${reviewed}/${checks.length} checks reviewed — "${note.trim()}"`);
    setDone({ seq: e.seq, hash: e.hash });
  };
  const reset = () => {
    setChecked({});
    setDecision(null);
    setNote('');
    setDone(null);
  };

  return (
    <section id="officer" className="relative min-h-[100svh]" aria-labelledby="off-title">
      <div className="scrim-right absolute inset-0 hidden md:block" />
      <div className="absolute inset-0 bg-cine-950/60 md:hidden" />
      <div className="relative mx-auto grid min-h-[100svh] max-w-content items-center gap-10 px-4 py-24 md:px-8 lg:grid-cols-[1fr_520px]">
        <Reveal className="order-2 self-end lg:order-1">
          <p className="cine-eyebrow">Decision support — not a decision maker</p>
          <h2 id="off-title" className="h-section mt-3 max-w-[520px]">
            What should the officer do?
          </h2>
          <InApp to="/queue" className="mt-5">
            Interventions — accept, escalate or close each one with a recorded note
          </InApp>
          <ol className="mt-8 max-w-[380px] space-y-2" aria-label="Who does what">
            {FLOW.map((f, i) => (
              <li
                key={f.k}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-500 ${
                  !f.ai ? 'border-mist-50/40 bg-mist-50/[0.06]' : i <= step - 1 ? 'border-white/15 bg-white/[0.03]' : 'border-white/[0.06]'
                }`}
              >
                <span className={`font-mono text-[10.5px] ${f.ai ? 'text-gis-400' : 'text-mist-50'}`}>{f.ai ? 'AI' : 'YOU'}</span>
                <span className={`text-[14px] ${f.ai ? 'text-mist-200' : 'font-semibold text-mist-50'}`}>{f.k}</span>
              </li>
            ))}
          </ol>
        </Reveal>

        <div className="pe order-1 lg:order-2">
          <div className="panel p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#ff9b6a]">
                  {sc && sc.p >= 0.55 ? 'High-risk case' : 'Case review'} · {parcel.id}
                </p>
                <p className="mt-1 text-[14px] text-mist-300">
                  Predicted probability{' '}
                  <b className="font-grotesk text-xl font-semibold text-mist-50">{sc ? pct(sc.p) : '—'}</b>
                  {sc?.nextMilestone && <span className="text-mist-400"> · next: {sc.nextMilestone}</span>}
                </p>
              </div>
              <span className="tag tag-warn shrink-0">Human review required</span>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="cine-eyebrow !text-[10px] !text-mist-400">Top contributors</p>
                <ul className="mt-2 space-y-1.5 text-[13.5px] text-mist-100">
                  {contributors.map((c) => (
                    <li key={c.key} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-risk-med" /> {c.label}
                    </li>
                  ))}
                </ul>
              </div>
              <fieldset disabled={!!done}>
                <legend className="cine-eyebrow !text-[10px] !text-mist-400">Suggested checks</legend>
                <ul className="mt-2 space-y-1">
                  {checks.map((c, i) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 text-[13px] text-mist-100 hover:bg-white/[0.04]">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-[#72b8c8]"
                          checked={!!checked[c.id]}
                          onChange={(e) => setChecked({ ...checked, [c.id]: e.target.checked })}
                        />
                        <span>
                          <span className="mr-1 font-mono text-[10.5px] text-mist-500">{i + 1}.</span>
                          {c.text}
                          <span className="block text-[11px] text-mist-500">{c.owner}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </div>

            {!done ? (
              <div className="mt-5 border-t pt-5 hair">
                <p className="cine-eyebrow !text-[10px] !text-mist-400">Officer decision</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Officer decision">
                  {DECISIONS.map((d) => (
                    <button key={d} role="radio" aria-checked={decision === d} aria-pressed={decision === d} className="seg-btn !py-1.5 !text-[12px]" onClick={() => setDecision(d)}>
                      {d}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block">
                  <span className="sr-only">Officer note</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Officer note (required) — e.g. payment file requested from compensation desk"
                    className="w-full resize-none rounded-lg border border-white/10 bg-cine-950/60 px-3 py-2 text-[13px] text-mist-100 placeholder:text-mist-500 focus:border-gis-400/60 focus:outline-none"
                  />
                </label>
                {err && (
                  <p className="mt-2 text-[12.5px] text-[#ff9b6a]" role="alert">
                    {err}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[11.5px] text-mist-500">Local demo — nothing leaves this page.</p>
                  <button className="btn btn-primary !px-5 !py-2.5 !text-[11px]" onClick={submit} data-cursor="inspect">
                    Record decision
                  </button>
                </div>
              </div>
            ) : (
              <div className="fx-in mt-5 rounded-xl border border-ok/40 bg-ok/[0.06] p-4">
                <p className="text-[14px] font-semibold text-[#8fd1ae]">Decision recorded by the officer.</p>
                <p className="mt-1 text-[12.5px] text-mist-300">
                  {decision} · audit entry #{done.seq} · <span className="font-mono">{done.hash.slice(0, 16)}…</span>
                </p>
                <p className="mt-1 text-[11.5px] text-mist-500">The entry is hash-chained — see it in the security section below.</p>
                <button className="mt-3 text-[12px] text-gis-300 underline-offset-4 hover:underline" onClick={reset}>
                  Review another decision
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
