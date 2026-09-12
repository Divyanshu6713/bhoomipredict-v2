import type { ReactNode } from 'react';
import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Select } from '@/components/ui';

export interface FilterSelect {
  key: string;
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  width?: string;
}

/**
 * Shared filter row. Every filtered screen drives the API with the same
 * vocabulary, so the bar is declarative: give it selects and it reports changes.
 */
export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  selects,
  onChange,
  onReset,
  activeCount = 0,
  extra,
  className,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  selects: FilterSelect[];
  onChange: (key: string, value: string) => void;
  onReset?: () => void;
  activeCount?: number;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-line px-5 pb-4', className)}>
      <div className="flex flex-wrap items-end gap-3">
        {onSearch && (
          <div className="relative min-w-[200px] flex-1">
            <label className="label-xs mb-1.5 block">Search</label>
            <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-ink-3" />
            <input
              value={search ?? ''}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 pl-9 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus-ring"
            />
          </div>
        )}

        {selects.map((s) => (
          <Select
            key={s.key}
            label={s.label}
            value={s.value}
            onChange={(v) => onChange(s.key, v)}
            className={s.width ?? 'w-[160px]'}
            options={s.options}
          />
        ))}

        {extra}

        {activeCount > 0 && onReset && (
          <Button size="md" variant="ghost" onClick={onReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      {activeCount > 0 && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-3">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {activeCount} filter{activeCount > 1 ? 's' : ''} active · applied server-side across the full corpus
        </p>
      )}
    </div>
  );
}

export const allOption = (label: string) => ({ label, value: 'all' });

export const toOptions = (values: readonly string[] = []) => values.map((v) => ({ label: v, value: v }));
