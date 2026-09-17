/**
 * Semantic tones. Every status chip, risk band and alert in the product is one
 * of these, so a colour always means the same thing on every screen.
 */
export type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'orange' | 'danger';

export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2 text-ink-2',
  brand: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-300',
  info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300',
  orange: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300',
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300',
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink-2',
  brand: 'text-blue-700 dark:text-blue-300',
  info: 'text-sky-700 dark:text-sky-300',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  orange: 'text-orange-700 dark:text-orange-300',
  danger: 'text-red-700 dark:text-red-300',
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  brand: 'bg-blue-600',
  info: 'bg-sky-500',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  orange: 'bg-orange-500',
  danger: 'bg-red-600',
};

/** Soft panel background for callouts and highlighted result blocks. */
export const TONE_PANEL: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2',
  brand: 'border-blue-200 bg-blue-50/60 dark:border-blue-400/20 dark:bg-blue-400/[0.06]',
  info: 'border-sky-200 bg-sky-50/60 dark:border-sky-400/20 dark:bg-sky-400/[0.06]',
  success: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06]',
  warning: 'border-amber-200 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/[0.06]',
  orange: 'border-orange-200 bg-orange-50/60 dark:border-orange-400/20 dark:bg-orange-400/[0.06]',
  danger: 'border-red-200 bg-red-50/60 dark:border-red-400/20 dark:bg-red-400/[0.06]',
};
