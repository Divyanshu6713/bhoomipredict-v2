import { Cpu, Database, PencilLine, PlugZap, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { TONE_CHIP } from '@/lib/tone';
import type { DataMode } from '@/data/types';

/**
 * Where a figure comes from. Four modes are used in the prototype; 'official'
 * exists in the contract but no adapter produces it, so it never appears.
 */
export const PROVENANCE: Record<DataMode, { label: string; short: string; className: string; icon: typeof Database; description: string }> = {
  synthetic: {
    label: 'Synthetic demo data',
    short: 'Synthetic',
    className: TONE_CHIP.warning,
    icon: Database,
    description: 'Generated for demonstration and model development. Not an official record.',
  },
  user: {
    label: 'User-entered',
    short: 'User-entered',
    className: TONE_CHIP.info,
    icon: PencilLine,
    description: 'Entered through a form or CSV upload in this prototype.',
  },
  model: {
    label: 'Model-generated',
    short: 'Model output',
    className: TONE_CHIP.neutral,
    icon: Cpu,
    description: 'Estimated by the delay-risk model or rule engine. An estimate, not an observation.',
  },
  integration: {
    label: 'Integration-ready · not connected',
    short: 'Integration-ready',
    className: TONE_CHIP.success,
    icon: PlugZap,
    description: 'Contract and adapter slot defined; no government system is connected.',
  },
  official: {
    label: 'Official source',
    short: 'Official',
    className: TONE_CHIP.brand,
    icon: ShieldCheck,
    description: 'Retrieved from a connected government system.',
  },
};

export function ProvenanceBadge({ mode, compact = false, className }: { mode: DataMode; compact?: boolean; className?: string }) {
  const p = PROVENANCE[mode];
  const Icon = p.icon;
  return (
    <span title={p.description} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4', p.className, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {compact ? p.short : p.label}
    </span>
  );
}

/** A compact legend explaining the four modes, linking to the Data Sources screen. */
export function ProvenanceLegend({ className, modes = ['synthetic', 'user', 'model', 'integration'] }: { className?: string; modes?: DataMode[] }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-3', className)}>
      <span className="font-medium text-ink-2">Data provenance:</span>
      {modes.map((m) => (
        <ProvenanceBadge key={m} mode={m} compact />
      ))}
      <Link to="/data-sources" className="link">
        About data sources
      </Link>
    </div>
  );
}
