import type { AlertStatus, InterventionStatus, Severity, StageStatus } from '@/data/types';

/**
 * Presentation for workflow and lifecycle statuses. The statuses themselves are
 * decided server-side; this file only names and colours them.
 */

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DELAYED: 'Delayed',
  BLOCKED: 'Blocked',
};

export const STAGE_STATUS_CLASS: Record<StageStatus, string> = {
  COMPLETED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  IN_PROGRESS: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
  DELAYED: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  BLOCKED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
  PENDING: 'bg-slate-500/10 text-ink-3 border-line-strong',
};

export const STAGE_STATUS_DOT: Record<StageStatus, string> = {
  COMPLETED: 'bg-emerald-500',
  IN_PROGRESS: 'bg-sky-500',
  DELAYED: 'bg-amber-500',
  BLOCKED: 'bg-rose-500',
  PENDING: 'bg-slate-400',
};

export const SEVERITY_CLASS: Record<Severity, string> = {
  Critical: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
  High: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25',
  Medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
  Low: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
};

export const INTERVENTION_STATUS_LABEL: Record<InterventionStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
};

export const INTERVENTION_STATUS_CLASS: Record<InterventionStatus, string> = {
  OPEN: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
  ACKNOWLEDGED: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
  IN_PROGRESS: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
  RESOLVED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  DISMISSED: 'bg-slate-500/10 text-ink-3 border-line-strong',
};

/** Allowed next statuses, mirroring server/lib/workflow.mjs. */
export const INTERVENTION_NEXT: Record<InterventionStatus, InterventionStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'DISMISSED', 'OPEN'],
  IN_PROGRESS: ['RESOLVED', 'ACKNOWLEDGED', 'DISMISSED'],
  RESOLVED: ['OPEN'],
  DISMISSED: ['OPEN'],
};

export const ALERT_STATUS_CLASS: Record<AlertStatus, string> = {
  UNREAD: 'bg-brand/10 text-brand border-brand/25',
  ACKNOWLEDGED: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
  RESOLVED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
};

export const CATEGORY_LABEL: Record<string, string> = {
  risk: 'Model risk',
  schedule: 'Schedule',
  dependency: 'Department dependency',
  compensation: 'Compensation',
  legal: 'Legal',
  documentation: 'Documentation',
  approval: 'Approvals',
  rr: 'R&R',
  stakeholder: 'Stakeholders',
  coordination: 'Coordination',
  backlog: 'Case backlog',
  possession: 'Possession',
};

export const RISK_BASIS_LABEL: Record<string, string> = {
  ensemble: 'Deployed ensemble — expected share of open current-stage parcels that slip > 30 days',
  'ensemble+adjustment': 'Deployed ensemble, moved by the model’s estimate of recorded edits',
  'ensemble-profile': 'Deployed ensemble on the project-level record (no case records attached)',
  'next-milestone': 'Deployed ensemble — expected share of open current-stage parcels that slip > 30 days',
  surrogate: 'Linear reference model on the project-level record (legacy)',
};

export const BASIS_LABEL: Record<string, string> = {
  statute: 'Statutory',
  configured: 'Configured',
  project: 'Project record',
};

export const humanise = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (m) => m.toUpperCase());
