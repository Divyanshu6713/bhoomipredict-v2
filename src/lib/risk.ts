import type { RiskLevel } from '@/data/types';

/**
 * Risk banding.
 *
 * The API bands every record itself. These helpers are for values the UI
 * colours locally, which are all aggregates — mean project risk of a state,
 * district, type or stage — so they use the project-level cut-offs
 * (ml/train.py PROJECT_RISK_BAND_THRESHOLDS). A single case uses
 * CASE_RISK_BAND_CUTS (RISK_BAND_THRESHOLDS).
 */
export const RISK_BAND_CUTS = { medium: 30, high: 45, critical: 60 } as const;
export const CASE_RISK_BAND_CUTS = { medium: 30, high: 55, critical: 78 } as const;

export const riskFromScore = (score: number): RiskLevel =>
  score >= RISK_BAND_CUTS.critical
    ? 'Critical'
    : score >= RISK_BAND_CUTS.high
      ? 'High'
      : score >= RISK_BAND_CUTS.medium
        ? 'Medium'
        : 'Low';

export const RISK_ORDER: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export const RISK_HEX: Record<RiskLevel, string> = {
  Low: '#10B981',
  Medium: '#F59E0B',
  High: '#F97316',
  Critical: '#E11D48',
};

/** Tailwind class bundles for each risk level (chips, dots, bars). */
export const RISK_CLASS: Record<RiskLevel, { chip: string; dot: string; bar: string; text: string; ring: string }> = {
  Low: {
    chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500/30',
  },
  Medium: {
    chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500/30',
  },
  High: {
    chip: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25',
    dot: 'bg-orange-500',
    bar: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-500/30',
  },
  Critical: {
    chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-500/30',
  },
};

/** Stage status colours live with the other workflow statuses. */
export { STAGE_STATUS_CLASS } from './status';

export const OUTCOME_CLASS: Record<string, string> = {
  Delayed: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
  'On time': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  Pending: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
};

export const PRIORITY_CLASS: Record<string, string> = {
  Critical: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
  Important: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
  Routine: 'bg-slate-500/10 text-ink-3 border-line-strong',
};

export const CHART_COLORS = {
  brand: '#3B72F0',
  brandLight: '#7BA4FF',
  teal: '#0EA5A4',
  violet: '#7C6CF5',
  saffron: '#FF9933',
  slate: '#94A3B8',
  grid: 'rgba(148,163,184,0.18)',
};

/** Stable colour per contributor group, so a factor keeps its colour everywhere. */
const GROUP_PALETTE = [
  '#E11D48', '#F97316', '#F59E0B', '#3B72F0', '#0EA5A4', '#7C6CF5',
  '#DB2777', '#0284C7', '#65A30D', '#9333EA', '#0891B2', '#B45309',
  '#475569', '#16A34A', '#C026D3', '#64748B',
];

const groupColorCache = new Map<string, string>();

export function groupColor(group: string): string {
  const cached = groupColorCache.get(group);
  if (cached) return cached;
  let hash = 0;
  for (let i = 0; i < group.length; i++) hash = (hash * 31 + group.charCodeAt(i)) | 0;
  const color = GROUP_PALETTE[Math.abs(hash) % GROUP_PALETTE.length];
  groupColorCache.set(group, color);
  return color;
}
