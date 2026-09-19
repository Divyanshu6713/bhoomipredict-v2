import type { ProjectStage, StageName } from '@/data/types';

/**
 * Plain-language wording for the acquisition lifecycle, written for a land
 * acquisition officer rather than an analyst.
 *
 * Every stage is tracked on two levels that can legitimately disagree:
 *   the PROJECT STEP  — has the formal milestone been achieved for the project
 *                       as a whole (notification published, award declared…)?
 *   the PARCELS       — each parcel has its own case file, and some can stay
 *                       pending after the project step is done.
 * The helpers below always say which of the two they are talking about.
 */

/** The parcel-level work that typically keeps a case open at each step. */
export const STAGE_PENDING_WORK: Record<StageName, string> = {
  'Land Identification': 'the parcel is not yet confirmed in the land schedule',
  'Survey & Verification': 'joint measurement or record verification is not finished',
  Notification: 'the notice has not been served or published for the parcel',
  'Objection / Claims': 'an objection or claim has not yet been heard and disposed',
  Valuation: 'the value of land, structures, crops or trees is not finalised',
  Compensation: 'the awarded amount has not been paid or deposited',
  Possession: 'physical possession has not been taken',
  'Rehabilitation & Resettlement': 'R&R entitlements have not been delivered',
  Closure: 'mutation and the land-records update are not done',
};

/** What "done" means for the project at each step. */
export const STAGE_DONE_MEANS: Record<StageName, string> = {
  'Land Identification': 'the land schedule for the alignment was fixed',
  'Survey & Verification': 'the joint survey was completed for the project',
  Notification: 'the acquisition notification was published',
  'Objection / Claims': 'the objection hearing window was closed',
  Valuation: 'the valuation and award were declared',
  Compensation: 'the compensation deposit was made for the project',
  Possession: 'possession was declared for the project',
  'Rehabilitation & Resettlement': 'the R&R scheme was declared delivered',
  Closure: 'the project was closed',
};

export const fmtN = (n: number) => n.toLocaleString('en-IN');
export const parcels = (n: number) => `${fmtN(n)} parcel${n === 1 ? '' : 's'}`;

export type StageTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Short label for the parcel line under a stage. */
export function parcelLine(s: ProjectStage): { text: string; sub: string | null; tone: StageTone } {
  const cleared = s.resolvedCases;
  if (s.totalCases === 0) return { text: s.status === 'PENDING' ? 'No parcels here yet' : 'No parcel records', sub: null, tone: 'neutral' };
  if (s.status === 'COMPLETED') {
    return s.openCases > 0
      ? { text: `${parcels(s.openCases)} still pending`, sub: `${fmtN(cleared)} of ${fmtN(s.totalCases)} cleared`, tone: 'warning' }
      : { text: `All ${fmtN(s.totalCases)} parcels cleared`, sub: null, tone: 'success' };
  }
  if (s.status === 'PENDING') {
    return {
      text: `${parcels(s.totalCases)} started early`,
      sub: cleared ? `${fmtN(cleared)} already cleared` : 'none cleared yet',
      tone: 'info',
    };
  }
  return {
    text: `${parcels(s.openCases)} pending`,
    sub: `${fmtN(cleared)} of ${fmtN(s.totalCases)} cleared`,
    tone: s.status === 'IN_PROGRESS' ? 'info' : s.status === 'BLOCKED' ? 'danger' : 'warning',
  };
}

/** One-sentence headline for the project step itself. */
export function stepHeadline(s: ProjectStage): string {
  switch (s.status) {
    case 'COMPLETED':
      return s.openCases > 0 ? 'Step done for the project — some parcels still pending' : 'Step done — every parcel cleared';
    case 'IN_PROGRESS':
      return 'Current step — on schedule';
    case 'DELAYED':
      return `Current step — ${s.delayDays} day${s.delayDays === 1 ? '' : 's'} past its deadline`;
    case 'BLOCKED':
      return 'Current step — held up by a department';
    default:
      return s.totalCases > 0 ? 'Not started for the project — some parcels are already here' : 'Not started yet';
  }
}

/**
 * "What this means" and "what to do" for one stage, in the officer's words.
 * `blockers` is the list of department names holding a blocked stage.
 */
export function stageStory(s: ProjectStage): { means: string; todo: string | null } {
  const work = STAGE_PENDING_WORK[s.name];
  const done = STAGE_DONE_MEANS[s.name];
  switch (s.status) {
    case 'COMPLETED':
      return s.openCases > 0
        ? {
            means: `The project finished this step — ${done}. But ${parcels(s.openCases)} were left behind: for each of them ${work}. These are left-over cases; they do not reopen the step, yet the parcels cannot move on until they are closed.`,
            todo: `Clear the ${parcels(s.openCases)} one by one, oldest first. They are listed below.`,
          }
        : { means: `The project finished this step — ${done} — and every one of its ${parcels(s.totalCases)} has been cleared.`, todo: null };
    case 'BLOCKED':
      return {
        means: `This is the step the project is on, and it is held up: ${s.blockedBy.map((b) => b.name).join(', ') || 'a department'} has action pending on a large share of the parcels. ${parcels(s.openCases)} are still pending.`,
        todo: 'Take up the pending department action first — see "Authorities and departments" below.',
      };
    case 'DELAYED':
      return {
        means: `This is the step the project is on. Its deadline passed ${s.delayDays} day${s.delayDays === 1 ? '' : 's'} ago and ${parcels(s.openCases)} are still pending (usually because ${work}).`,
        todo: 'Work through the pending parcels with the highest risk first, and record the milestone once the step is achieved.',
      };
    case 'IN_PROGRESS':
      return {
        means: `This is the step the project is on, within its deadline. ${parcels(s.openCases)} are still pending.`,
        todo: s.openCases > 0 ? 'Keep the pending parcels moving; the highest-risk ones are listed below.' : null,
      };
    default:
      return s.totalCases > 0
        ? {
            means: `The project has not reached this step yet, but ${parcels(s.totalCases)} have moved ahead of the rest and are already being processed here${s.resolvedCases ? ` (${fmtN(s.resolvedCases)} already cleared)` : ''}. This is normal and needs no action by itself.`,
            todo: null,
          }
        : { means: 'The project has not reached this step yet.', todo: null };
  }
}

/** Where one parcel stands relative to its project, for the case page. */
export function parcelPosition(caseStageIndex: number, projectStageIndex: number, caseOpen: boolean): string {
  if (!caseOpen) return 'This parcel’s file is closed at this step.';
  if (caseStageIndex < projectStageIndex) return 'This parcel is behind the project: the project has moved on, this parcel has not.';
  if (caseStageIndex > projectStageIndex) return 'This parcel is ahead of the project: it reached this step before the project as a whole.';
  return 'This parcel is at the same step as the project.';
}
