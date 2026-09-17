import { useState } from 'react';
import { History } from 'lucide-react';
import { humanise } from '@/lib/status';
import type { AuditEntry } from '@/data/types';

const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-ink-3">—</span>;
  if (typeof v !== 'object') return <span>{String(v)}</span>;
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x !== 'object' || x === null);
  return (
    <span className="block space-y-0.5">
      {entries.slice(0, 8).map(([k, x]) => (
        <span key={k} className="block">
          <span className="text-ink-3">{k}:</span> {String(x)}
        </span>
      ))}
    </span>
  );
}

/** Compact audit list: who, role, what, when, before → after. */
export function AuditTimeline({ entries, empty = 'No audit entries.' }: { entries: AuditEntry[]; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!entries.length) return <p className="py-6 text-center text-xs text-ink-3">{empty}</p>;
  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1 grid h-2.5 w-2.5 place-items-center rounded-full bg-brand ring-4 ring-surface" />
          <button onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full text-left">
            <p className="text-sm font-semibold text-ink">
              {humanise(e.action.replace('.', ' '))} <span className="font-mono text-xs font-medium text-ink-3">{e.entityId}</span>
            </p>
            <p className="text-xs text-ink-3">
              {e.user.name} · {humanise(e.user.role)} · {fmt(e.timestamp)}
            </p>
            {e.note && <p className="mt-0.5 text-xs text-ink-2">“{e.note}”</p>}
          </button>
          {open === e.id && (e.oldValue !== null || e.newValue !== null) && (
            <div className="mt-1.5 grid gap-2 rounded-lg border border-line bg-surface-2 p-2.5 text-xs sm:grid-cols-2">
              <div>
                <p className="label-xs mb-1">Before</p>
                <Value v={e.oldValue} />
              </div>
              <div>
                <p className="label-xs mb-1">After</p>
                <Value v={e.newValue} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export const AuditIcon = History;
