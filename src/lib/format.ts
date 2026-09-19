export const formatNumber = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat('en-IN', opts).format(n);

export const formatCompact = (n: number) => {
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
};

export const formatCrore = (cr: number) =>
  cr >= 1000 ? `₹${(cr / 1000).toFixed(2)}K Cr` : `₹${formatNumber(cr, { maximumFractionDigits: 0 })} Cr`;

export const formatHa = (ha: number) => `${formatNumber(Math.round(ha))} ha`;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const zoneFor = (iso: string) => (DATE_ONLY.test(iso) ? { timeZone: 'UTC' } : {});

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...zoneFor(iso) });

export const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...zoneFor(iso) });

/** "177 days after target" / "12 days before target" / "on target". */
export const formatVsTarget = (days: number) =>
  days === 0 ? 'on target' : `${Math.abs(days).toLocaleString('en-IN')} day${Math.abs(days) === 1 ? '' : 's'} ${days > 0 ? 'after' : 'before'} target`;

export const formatRelative = (iso: string, now = new Date('2026-09-11T09:00:00Z')) => {
  const diff = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
};

export const pct = (v: number, decimals = 0) => `${v.toFixed(decimals)}%`;

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
