import { TONE_CHIP, TONE_DOT } from './tone';
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
  COMPLETED: TONE_CHIP.success,
  IN_PROGRESS: TONE_CHIP.info,
  DELAYED: TONE_CHIP.warning,
  BLOCKED: TONE_CHIP.danger,
  PENDING: TONE_CHIP.neutral,
};

export const STAGE_STATUS_DOT: Record<StageStatus, string> = {
  COMPLETED: TONE_DOT.success,
  IN_PROGRESS: TONE_DOT.info,
  DELAYED: TONE_DOT.warning,
  BLOCKED: TONE_DOT.danger,
  PENDING: TONE_DOT.neutral,
};

export const SEVERITY_CLASS: Record<Severity, string> = {
  Critical: TONE_CHIP.danger,
  High: TONE_CHIP.orange,
  Medium: TONE_CHIP.warning,
  Low: TONE_CHIP.info,
};

export const INTERVENTION_STATUS_LABEL: Record<InterventionStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
};

export const INTERVENTION_STATUS_CLASS: Record<InterventionStatus, string> = {
  OPEN: TONE_CHIP.danger,
  ACKNOWLEDGED: TONE_CHIP.warning,
  IN_PROGRESS: TONE_CHIP.info,
  RESOLVED: TONE_CHIP.success,
  DISMISSED: TONE_CHIP.neutral,
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
  UNREAD: TONE_CHIP.brand,
  ACKNOWLEDGED: TONE_CHIP.warning,
  RESOLVED: TONE_CHIP.success,
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
