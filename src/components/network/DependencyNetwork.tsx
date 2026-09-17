import { useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Landmark, MapPinned, Scale, ShieldCheck, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui';
import { BASIS_LABEL } from '@/lib/status';
import type { DependencyNode, Framework, ScenarioNode } from '@/data/types';

const LEVEL_ORDER = ['central', 'state', 'district', 'sub-district'] as const;
const LEVEL_LABEL: Record<string, string> = {
  central: 'Central / project authority',
  state: 'State departments',
  district: 'District administration',
  'sub-district': 'Sub-district revenue office',
};
const LEVEL_ICON: Record<string, typeof Building2> = { central: Landmark, state: Building2, district: MapPinned, 'sub-district': Users };

const BASIS_CLASS: Record<string, string> = {
  statute: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  configured: 'border-line bg-surface-2 text-ink-3',
  project: 'border-brand/25 bg-brand/10 text-brand',
};

type AnyNode = DependencyNode | ScenarioNode;
const isScenario = (n: AnyNode): n is ScenarioNode => 'influence' in n;

/**
 * The authorities an acquisition depends on, grouped by administrative level.
 * Each row states why the dependency exists, which stages it gates, whether an
 * action is pending (from case data, or the scenario toggles) and its basis.
 */
export function DependencyNetwork({
  nodes,
  framework,
  currentStage,
  note,
  onTogglePending,
  compact = false,
}: {
  nodes: AnyNode[];
  framework?: Framework;
  currentStage?: string;
  note?: string;
  onTogglePending?: (code: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {framework && (
        <div className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">{framework.name}</p>
            <p className="text-xs text-ink-3">
              {framework.mode === 'ownership' ? 'Acquisition of ownership' : framework.mode === 'right_of_user' ? 'Acquisition of a right of user' : 'Right of way — land is not acquired'}
              {framework.siaRequired ? ' · Social Impact Assessment required' : ' · SIA chapter not applicable'}
            </p>
            {framework.note && <p className="mt-1 text-xs text-ink-2">{framework.note}</p>}
          </div>
        </div>
      )}

      {LEVEL_ORDER.map((level) => {
        const rows = nodes.filter((n) => n.level === level);
        if (!rows.length) return null;
        const Icon = LEVEL_ICON[level];
        return (
          <div key={level}>
            <p className="mb-1.5 flex items-center gap-1.5 label-xs">
              <Icon className="h-3.5 w-3.5" /> {LEVEL_LABEL[level]}
            </p>
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {rows.map((n) => {
                const key = `${n.code}-${n.name}`;
                const expanded = open === key;
                const scenario = isScenario(n);
                const relevant = scenario ? n.relevantToStage : currentStage ? n.stages.includes(currentStage as never) : true;
                const pending = scenario ? n.pending : (n.pendingCurrentStage ?? 0) > 0;
                const share = !scenario ? n.pendingShareCurrentStage ?? 0 : null;
                return (
                  <div key={key} className={cn('bg-surface', !relevant && 'opacity-75')}>
                    <div className="flex items-start gap-2.5 px-3 py-2.5">
                      <button onClick={() => setOpen(expanded ? null : key)} className="mt-0.5 text-ink-3 hover:text-ink" aria-label={expanded ? 'Collapse' : 'Expand'}>
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="eyebrow">{n.role}</span>
                          {n.gate && (
                            <Badge className="border-red-500/20 bg-red-500/5 px-1.5 py-0.5 text-2xs text-red-700 dark:text-red-300">
                              <ShieldCheck className="h-3 w-3" /> gates stage
                            </Badge>
                          )}
                          <Badge className={cn('px-1.5 py-0.5 text-2xs', BASIS_CLASS[n.basis])}>{BASIS_LABEL[n.basis]}</Badge>
                        </div>
                        <p className="mt-0.5 text-sm font-semibold leading-snug text-ink">{n.name}</p>
                        {!compact && (
                          <p className="mt-0.5 text-xs text-ink-3">
                            Affects: {n.stages.join(' · ')}
                            {currentStage && (relevant ? ` — gates ${currentStage}` : ` — not active at ${currentStage}`)}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {scenario ? (
                          relevant ? (
                            <button
                              onClick={() => onTogglePending?.(n.code)}
                              disabled={!onTogglePending}
                              className={cn(
                                'rounded-lg border px-2 py-1 text-xs font-semibold transition-colors',
                                pending ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-line bg-surface-2 text-ink-3 hover:border-line-strong',
                              )}
                            >
                              {pending ? 'Action pending' : 'No pending action'}
                            </button>
                          ) : (
                            <span className="text-xs text-ink-3">not at this stage</span>
                          )
                        ) : pending ? (
                          <span className="text-xs font-bold text-red-700 dark:text-red-300 num">
                            pending on {(n.pendingCurrentStage ?? 0).toLocaleString('en-IN')} cases
                            <span className="block text-2xs font-medium text-ink-3">{Math.round((share ?? 0) * 100)}% of current-stage cases</span>
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">{relevant ? 'nothing pending now' : '—'}</span>
                        )}
                        {scenario && relevant && (
                          <p className="mt-1 text-2xs text-ink-3 num">
                            {pending ? `+${n.influence.pointsIfPending.toFixed(1)} pts when pending` : `+${n.influence.pointsIfPending.toFixed(1)} pts if pending`}
                          </p>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <div className="border-t border-line bg-surface-2 px-10 py-2.5 text-xs text-ink-2">
                        <p>
                          <span className="font-semibold text-ink">Why this dependency exists: </span>
                          {n.why}
                        </p>
                        <p className="mt-1">
                          <span className="font-semibold text-ink">Typical pending action: </span>
                          {n.pendingActionText}
                        </p>
                        {scenario && <p className="mt-1">{n.explanation}</p>}
                        {!scenario && (n.pendingOpenCases ?? 0) > 0 && (
                          <p className="mt-1">
                            Across all stages, an action from this office is pending on {(n.pendingOpenCases ?? 0).toLocaleString('en-IN')} open cases.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {note && <p className="text-xs text-ink-3">{note}</p>}
    </div>
  );
}
