import { Cpu, Database, PencilLine, PlugZap, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { DataMode } from '@/data/types';

/**
 * Where a figure comes from. Four modes are used in the prototype; 'official'
 * exists in the contract but no adapter produces it, so it never appears.
 */
export const PROVENANCE: Record<DataMode, { label: string; short: string; className: string; icon: typeof Database; description: string }> = {
  synthetic: {
    label: 'Synthetic demo data',
    short: 'Synthetic',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    icon: Database,
    description: 'Generated for demonstration and model development. Not an official record.',
  },
  user: {
    label: 'User-entered',
    short: 'User-entered',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    icon: PencilLine,
    description: 'Entered through a form or CSV upload in this prototype.',
  },
  model: {
    label: 'Model-generated',
    short: 'Model output',
    className: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    icon: Cpu,
    description: 'Estimated by the delay-risk model or rule engine. An estimate, not an observation.',
  },
  integration: {
    label: 'Integration-ready · not connected',
    short: 'Integration-ready',
    className: 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400',
    icon: PlugZap,
    description: 'Contract and adapter slot defined; no government system is connected.',
  },
  official: {
    label: 'Official source',
    short: 'Official',
    className: 'border-brand/30 bg-brand/10 text-brand',
    icon: ShieldCheck,
    description: 'Retrieved from a connected government system.',
  },
};

export function ProvenanceBadge({ mode, compact = false, className }: { mode: DataMode; compact?: boolean; className?: string }) {
  const p = PROVENANCE[mode];
  const Icon = p.icon;
  return (
    <span title={p.description} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.06em]', p.className, className)}>
      <Icon className="h-3 w-3" />
      {compact ? p.short : p.label}
    </span>
  );
}

/** A compact legend explaining the four modes, linking to the Data Sources screen. */
export function ProvenanceLegend({ className, modes = ['synthetic', 'user', 'model', 'integration'] }: { className?: string; modes?: DataMode[] }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-ink-3', className)}>
      <span className="font-semibold text-ink-2">Data provenance:</span>
      {modes.map((m) => (
        <ProvenanceBadge key={m} mode={m} compact />
      ))}
      <Link to="/data-sources" className="font-semibold text-brand hover:underline">
        About data sources
      </Link>
    </div>
  );
}
