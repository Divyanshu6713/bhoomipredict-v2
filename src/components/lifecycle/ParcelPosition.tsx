import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { STAGE_DONE_MEANS, STAGE_PENDING_WORK, fmtN } from '@/lib/plainStage';
import { LIFECYCLE_STAGES, type ProjectStage } from '@/data/types';

const SHORT: Record<string, string> = {
  'Land Identification': 'Identify',
  'Survey & Verification': 'Survey',
  Notification: 'Notify',
  'Objection / Claims': 'Claims',
  Valuation: 'Value',
  Compensation: 'Pay',
  Possession: 'Possess',
  'Rehabilitation & Resettlement': 'R&R',
  Closure: 'Close',
};

/**
 * Where one parcel stands next to its project, in plain words: a nine-step
 * rail with a marker for the project and one for this parcel, and one
 * paragraph saying why they differ.
 */
export function ParcelPosition({
  parcelStageIndex,
  projectStageIndex,
  stage,
  open,
}: {
  parcelStageIndex: number;
  projectStageIndex: number;
  /** The project's record of the step this parcel is at. */
  stage: ProjectStage;
  open: boolean;
}) {
  const behind = parcelStageIndex < projectStageIndex;
  const ahead = parcelStageIndex > projectStageIndex;
  const others = Math.max(0, stage.openCases - (open ? 1 : 0));

  let headline: string;
  let body: string;
  if (!open) {
    headline = 'This parcel’s file is closed';
    body = `Its ${stage.name} milestone has an observed outcome, so the parcel is kept as history and used to check the model’s predictions.`;
  } else if (behind || stage.status === 'COMPLETED') {
    headline = 'Left behind: the project has moved on, this parcel has not';
    body = `The project finished ${stage.name}${stage.actualCompletion ? ` on ${formatDate(stage.actualCompletion)}` : ''} — ${STAGE_DONE_MEANS[stage.name]}. For this parcel, ${STAGE_PENDING_WORK[stage.name]}. That does not reopen the step for the project, but this parcel cannot move to the next step until it is cleared${others ? `. ${fmtN(others)} other parcel${others === 1 ? ' is' : 's are'} in the same position` : ''}.`;
  } else if (ahead) {
    headline = 'Ahead of the project';
    body = `This parcel has reached ${stage.name} before the project as a whole. That is normal and needs no action by itself; its own deadline is shown below.`;
  } else {
    headline = 'At the same step as the project';
    body = `The project is working on ${stage.name} now. For this parcel, ${STAGE_PENDING_WORK[stage.name]}.`;
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3.5">
      <p className="text-xs font-medium text-ink-3">Where this parcel stands</p>
      <ol className="mt-3 grid grid-cols-9 gap-0.5" aria-label="Acquisition steps">
        {LIFECYCLE_STAGES.map((name, i) => {
          const isParcel = i === parcelStageIndex;
          const isProject = i === projectStageIndex;
          return (
            <li key={name} className="flex min-w-0 flex-col items-center" aria-current={isParcel ? 'step' : undefined}>
              <span className={cn('h-4 text-2xs font-semibold leading-4', isProject ? 'text-brand' : 'text-transparent')} aria-hidden={!isProject}>
                {isProject ? 'Project' : '·'}
              </span>
              <span
                className={cn(
                  'h-2 w-full rounded-full',
                  i < projectStageIndex ? 'bg-emerald-500/60' : i === projectStageIndex ? 'bg-brand/70' : 'bg-line',
                )}
              />
              <span className={cn('mt-1 grid h-5 w-5 place-items-center rounded-full border-2 text-2xs font-bold', isParcel ? (open && (behind || stage.status === 'COMPLETED') ? 'border-amber-500 bg-amber-500 text-white' : 'border-ink bg-ink text-surface') : 'border-transparent text-transparent')}>
                {isParcel ? '●' : ''}
              </span>
              <span className={cn('mt-0.5 w-full truncate text-center text-2xs', isParcel || isProject ? 'font-semibold text-ink' : 'text-ink-3')} title={name}>
                {SHORT[name] ?? name}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 flex flex-wrap gap-x-4 text-2xs text-ink-3">
        <span>
          <span className="font-semibold text-brand">Project</span> = step the project is on
        </span>
        <span>● = this parcel</span>
      </p>
      <p className="mt-3 text-sm font-medium text-ink">{headline}</p>
      <p className="mt-1 text-sm text-ink-2">{body}</p>
    </div>
  );
}
