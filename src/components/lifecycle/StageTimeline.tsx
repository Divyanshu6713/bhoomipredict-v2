import { CheckCircle2, CircleDashed, Clock, Timer } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RISK_CLASS, RISK_HEX } from '@/lib/risk';
import { formatDate } from '@/lib/format';
import type { ProjectStage, StageRisk, StageStatus } from '@/data/types';

const ICON: Record<StageStatus, typeof CheckCircle2> = {
  Completed: CheckCircle2,
  'In Progress': Clock,
  Delayed: Timer,
  Pending: CircleDashed,
};

const TONE: Record<StageStatus, { ring: string; text: string; line: string }> = {
  Completed: {
    ring: 'border-emerald-500 bg-emerald-500 text-white',
    text: 'text-emerald-600 dark:text-emerald-400',
    line: 'bg-emerald-500',
  },
  'In Progress': { ring: 'border-brand bg-brand text-white', text: 'text-brand', line: 'bg-brand' },
  Delayed: { ring: 'border-rose-500 bg-rose-500 text-white', text: 'text-rose-600 dark:text-rose-400', line: 'bg-rose-500' },
  Pending: { ring: 'border-line-strong bg-surface text-ink-3', text: 'text-ink-3', line: 'bg-line' },
};

/**
 * The nine-stage statutory lifecycle with, for each stage, its schedule position
 * and the model's risk for the open cases sitting in it.
 *
 * A stage with no open cases carries no live prediction — it is labelled by what
 * was observed instead, rather than showing a number that would imply a forecast
 * nobody made.
 */
export function StageTimeline({
  stages,
  risk,
  currentIndex,
  onSelect,
  selectedIndex,
}: {
  stages: ProjectStage[];
  risk: StageRisk[];
  currentIndex: number;
  onSelect?: (index: number) => void;
  selectedIndex?: number;
}) {
  return (
    <div className="px-5 pb-5">
      {/* Horizontal rail on wide screens */}
      <div className="hidden xl:block">
        <div className="relative flex">
          <div className="absolute left-8 right-8 top-[19px] h-0.5 bg-line" />
          {stages.map((s, i) => {
            const Icon = ICON[s.status];
            const tone = TONE[s.status];
            const r = risk[i];
            const isCurrent = i === currentIndex;
            const isSelected = selectedIndex === i;
            return (
              <button
                key={s.name}
                onClick={() => onSelect?.(i)}
                className={cn(
                  'relative flex-1 px-1 pt-0 text-center transition-transform duration-200',
                  onSelect && 'cursor-pointer hover:-translate-y-0.5',
                )}
              >
                {i > 0 && (
                  <span
                    className={cn(
                      'absolute right-1/2 top-[19px] h-0.5 w-full',
                      stages[i - 1].status === 'Completed' ? tone.line : 'bg-line',
                    )}
                    style={{ opacity: stages[i - 1].status === 'Completed' ? 0.65 : 1 }}
                  />
                )}
                <div
                  className={cn(
                    'relative z-10 mx-auto grid h-10 w-10 place-items-center rounded-full border-2 shadow-card transition-all duration-300',
                    tone.ring,
                    isCurrent && 'ring-4 ring-brand/20',
                    isSelected && 'scale-110 ring-4 ring-brand/30',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <p className="mt-2.5 text-[11.5px] font-bold leading-tight text-ink">{s.name}</p>
                <p className={cn('mt-0.5 text-[10px] font-semibold uppercase tracking-wider', tone.text)}>
                  {s.status}
                </p>
                <p className="mt-1 text-[10px] text-ink-3 num">
                  {s.status === 'Completed' && s.actualCompletion
                    ? formatDate(s.actualCompletion)
                    : formatDate(s.expectedCompletion)}
                </p>
                {s.status === 'Completed' && s.slipDays > 0 && (
                  <p className="text-[10px] font-bold text-rose-500 num">+{s.slipDays}d slip</p>
                )}
                {s.status === 'Delayed' && (
                  <p className="text-[10px] font-bold text-rose-500 num">{Math.abs(s.daysRemaining)}d overdue</p>
                )}
                {s.status === 'In Progress' && (
                  <p className="text-[10px] font-semibold text-ink-3 num">{s.daysRemaining}d left</p>
                )}

                {r?.riskScore !== null && r?.riskScore !== undefined ? (
                  <div className="mx-auto mt-2 w-[86px]">
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full animate-grow-bar"
                        style={{
                          ['--bar-w' as string]: `${r.riskScore}%`,
                          width: `${r.riskScore}%`,
                          background: RISK_HEX[r.band ?? 'Low'],
                          animationDelay: `${i * 70}ms`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] font-bold num" style={{ color: RISK_HEX[r.band ?? 'Low'] }}>
                      {r.riskScore}% risk
                    </p>
                    {/* A closed stage can still hold parcels that never moved with
                        the rest of the project — those stragglers are the point. */}
                    <p className="text-[9.5px] text-ink-3 num">
                      {r.openCases.toLocaleString('en-IN')} {s.status === 'Completed' ? 'still open' : 'open'}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-[9.5px] leading-tight text-ink-3">
                    {s.status === 'Completed' ? 'closed — no open cases' : 'not yet active'}
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
          const r = risk[i];
          return (
            <button
              key={s.name}
              onClick={() => onSelect?.(i)}
              className={cn(
                'flex w-full gap-3.5 text-left',
                onSelect && 'cursor-pointer',
                selectedIndex === i && 'bg-surface-2',
              )}
            >
              <div className="flex flex-col items-center">
                <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full border-2', tone.ring)}>
                  <Icon className="h-4 w-4" />
                </div>
                {i < stages.length - 1 && (
                  <div className={cn('w-0.5 flex-1', s.status === 'Completed' ? tone.line : 'bg-line')} />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-bold text-ink">{s.name}</p>
                  {r?.riskScore !== null && r?.riskScore !== undefined && (
                    <span
                      className={cn('text-[11.5px] font-bold num', RISK_CLASS[r.band ?? 'Low'].text)}
                    >
                      {r.riskScore}% risk · {r.openCases.toLocaleString('en-IN')} open
                    </span>
                  )}
                </div>
                <p className={cn('text-[11px] font-semibold', tone.text)}>
                  {s.status} ·{' '}
                  {s.status === 'Completed' && s.actualCompletion
                    ? `closed ${formatDate(s.actualCompletion)}`
                    : `due ${formatDate(s.expectedCompletion)}`}
                  {s.status === 'Completed' && s.slipDays > 0 && (
                    <span className="text-rose-500"> · +{s.slipDays}d slip</span>
                  )}
                  {s.status === 'Delayed' && (
                    <span className="text-rose-500"> · {Math.abs(s.daysRemaining)}d overdue</span>
                  )}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{s.milestone}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
