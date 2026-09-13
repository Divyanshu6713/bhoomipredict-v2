import { Ban, CheckCircle2, CircleDashed, Clock, Timer } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RISK_HEX, riskFromScore } from '@/lib/risk';
import { STAGE_STATUS_LABEL } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { ProjectStage, StageStatus } from '@/data/types';

const ICON: Record<StageStatus, typeof CheckCircle2> = {
  COMPLETED: CheckCircle2,
  IN_PROGRESS: Clock,
  DELAYED: Timer,
  BLOCKED: Ban,
  PENDING: CircleDashed,
};

const TONE: Record<StageStatus, { ring: string; text: string; line: string }> = {
  COMPLETED: { ring: 'border-emerald-500 bg-emerald-500 text-white', text: 'text-emerald-600 dark:text-emerald-400', line: 'bg-emerald-500' },
  IN_PROGRESS: { ring: 'border-sky-500 bg-sky-500 text-white', text: 'text-sky-600 dark:text-sky-400', line: 'bg-sky-500' },
  DELAYED: { ring: 'border-amber-500 bg-amber-500 text-white', text: 'text-amber-700 dark:text-amber-400', line: 'bg-amber-500' },
  BLOCKED: { ring: 'border-rose-500 bg-rose-500 text-white', text: 'text-rose-600 dark:text-rose-400', line: 'bg-rose-500' },
  PENDING: { ring: 'border-line-strong bg-surface text-ink-3', text: 'text-ink-3', line: 'bg-line' },
};

/**
 * Case backlog shown under a stage, deliberately separate from the stage
 * status above it: a stage can be statutorily COMPLETED while residual cases
 * attached to it are still open.
 */
function Backlog({ s, compact = false }: { s: ProjectStage; compact?: boolean }) {
  if (s.totalCases === 0) {
    return <p className="text-[10px] leading-tight text-ink-3">{s.status === 'PENDING' ? 'no cases yet' : 'no case records'}</p>;
  }
  const resolved = s.resolutionPct ?? 0;
  const label =
    s.status === 'COMPLETED'
      ? s.openCases > 0
        ? `${s.openCases.toLocaleString('en-IN')} residual open`
        : 'all cases resolved'
      : s.status === 'PENDING'
        ? `${s.openCases.toLocaleString('en-IN')} parcel${s.openCases === 1 ? '' : 's'} ahead`
        : `${s.openCases.toLocaleString('en-IN')} open`;
  return (
    <div className={cn(compact ? 'w-full' : 'mx-auto w-[92px]')}>
      <p className="text-[9px] font-bold uppercase tracking-wider text-ink-3">Case backlog</p>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-3" title={`${resolved}% of ${s.totalCases} cases resolved`}>
        <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${resolved}%` }} />
      </div>
      <p className={cn('mt-0.5 text-[10px] font-semibold leading-tight num', s.status === 'COMPLETED' && s.openCases > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-ink-2')}>{label}</p>
      <p className="text-[9.5px] text-ink-3 num">{resolved}% of {s.totalCases.toLocaleString('en-IN')} resolved</p>
    </div>
  );
}

export function StageTimeline({
  stages,
  currentIndex,
  onSelect,
  selectedIndex,
}: {
  stages: ProjectStage[];
  currentIndex: number;
  onSelect?: (index: number) => void;
  selectedIndex?: number;
}) {
  return (
    <div className="px-5 pb-5">
      {/* Horizontal rail on wide screens */}
      <div className="hidden xl:block">
        <div className="relative flex">
          {stages.map((s, i) => {
            const Icon = ICON[s.status];
            const tone = TONE[s.status];
            const isCurrent = i === currentIndex;
            const isSelected = selectedIndex === i;
            const risk = s.riskProbability !== null ? Math.round(s.riskProbability * 100) : null;
            return (
              <button
                key={s.name}
                onClick={() => onSelect?.(i)}
                className={cn('relative flex-1 rounded-xl px-1 pb-2 text-center transition-colors', onSelect && 'cursor-pointer hover:bg-surface-2', isSelected && 'bg-surface-2')}
              >
                {i > 0 && (
                  <span className={cn('absolute right-1/2 top-[19px] h-0.5 w-full', stages[i - 1].status === 'COMPLETED' ? 'bg-emerald-500/60' : 'bg-line')} />
                )}
                <div className={cn('relative z-10 mx-auto grid h-10 w-10 place-items-center rounded-full border-2 shadow-card', tone.ring, isCurrent && 'ring-4 ring-brand/20', isSelected && 'ring-4 ring-brand/35')}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <p className="mt-2 text-[11.5px] font-bold leading-tight text-ink">{s.name}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-ink-3">Stage status</p>
                <p className={cn('text-[10.5px] font-bold uppercase tracking-wider', tone.text)}>{STAGE_STATUS_LABEL[s.status]}</p>
                <p className="text-[10px] text-ink-3 num">
                  {s.status === 'COMPLETED' && s.actualCompletion ? formatDate(s.actualCompletion) : `due ${formatDate(s.expectedCompletion)}`}
                </p>
                {s.status === 'COMPLETED' && s.delayDays > 0 && <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 num">+{s.delayDays}d late</p>}
                {(s.status === 'DELAYED' || s.status === 'BLOCKED') && s.delayDays > 0 && <p className="text-[10px] font-bold text-rose-500 num">{s.delayDays}d overdue</p>}
                {s.status === 'IN_PROGRESS' && <p className="text-[10px] font-semibold text-ink-3 num">{s.daysRemaining}d left</p>}
                <div className="mt-2 border-t border-line pt-1.5">
                  <Backlog s={s} />
                </div>
                {risk !== null && (
                  <p className="mt-1 text-[10px] font-bold num" style={{ color: RISK_HEX[riskFromScore(risk)] }}>
                    {risk}% milestone risk
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Vertical rail on narrower screens */}
      <div className="xl:hidden">
        {stages.map((s, i) => {
          const Icon = ICON[s.status];
          const tone = TONE[s.status];
          const risk = s.riskProbability !== null ? Math.round(s.riskProbability * 100) : null;
          return (
            <button key={s.name} onClick={() => onSelect?.(i)} className={cn('flex w-full gap-3.5 rounded-xl px-2 text-left', onSelect && 'cursor-pointer', selectedIndex === i && 'bg-surface-2')}>
              <div className="flex flex-col items-center pt-1">
                <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full border-2', tone.ring)}>
                  <Icon className="h-4 w-4" />
                </div>
                {i < stages.length - 1 && <div className={cn('w-0.5 flex-1', s.status === 'COMPLETED' ? 'bg-emerald-500/60' : 'bg-line')} />}
              </div>
              <div className="min-w-0 flex-1 pb-4 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-bold text-ink">{s.name}</p>
                  {risk !== null && (
                    <span className="text-[11px] font-bold num" style={{ color: RISK_HEX[riskFromScore(risk)] }}>
                      {risk}% milestone risk
                    </span>
                  )}
                </div>
                <p className={cn('text-[11px] font-semibold', tone.text)}>
                  Stage: {STAGE_STATUS_LABEL[s.status]} ·{' '}
                  {s.status === 'COMPLETED' && s.actualCompletion ? `completed ${formatDate(s.actualCompletion)}` : `due ${formatDate(s.expectedCompletion)}`}
                  {(s.status === 'DELAYED' || s.status === 'BLOCKED') && s.delayDays > 0 && <span className="text-rose-500"> · {s.delayDays}d overdue</span>}
                </p>
                <div className="mt-1.5 max-w-xs">
                  <Backlog s={s} compact />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3">
        {(['COMPLETED', 'IN_PROGRESS', 'DELAYED', 'BLOCKED', 'PENDING'] as StageStatus[]).map((st) => (
          <span key={st} className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <span className={cn('h-2.5 w-2.5 rounded-full', TONE[st].line, st === 'PENDING' && 'border border-line-strong')} />
            {STAGE_STATUS_LABEL[st]}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-ink-3">
          Stage status tracks the statutory milestone; the case backlog bar tracks individual cases attached to that stage.
        </span>
      </div>
    </div>
  );
}
