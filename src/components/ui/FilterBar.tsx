import { useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
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
 * On small screens the selects fold behind a "Filters" toggle so the result list
 * stays visible.
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
  const [open, setOpen] = useState(false);
  const collapsible = selects.length > 2;

  return (
    <div className={cn('px-4 pb-4 sm:px-5', className)}>
      <div className="flex items-center gap-2">
        {onSearch && (
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <label className="sr-only" htmlFor="filterbar-search">
              Search
            </label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input id="filterbar-search" type="search" value={search ?? ''} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} className="input pl-8" />
          </div>
        )}
        {collapsible && (
          <Button type="button" variant="secondary" size="md" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn('md:hidden', !onSearch && 'w-full')}>
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeCount > 0 && <span className="rounded bg-brand px-1.5 text-xs text-white num">{activeCount}</span>}
          </Button>
        )}
        {activeCount > 0 && onReset && (
          <Button type="button" size="md" variant="ghost" onClick={onReset} className="hidden md:inline-flex">
            <X className="h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>

      <div className={cn('mt-3 flex-wrap items-end gap-2.5', collapsible && !open ? 'hidden md:flex' : 'flex')}>
        {selects.map((s) => (
          <div key={s.key} className="w-full sm:w-[var(--fw)]" style={{ ['--fw' as string]: `${/(\d+)px/.exec(s.width ?? '')?.[1] ?? 160}px` }}>
            <Select label={s.label} value={s.value} onChange={(v) => onChange(s.key, v)} options={s.options} />
          </div>
        ))}
        {extra}
        {activeCount > 0 && onReset && (
          <Button type="button" size="md" variant="ghost" onClick={onReset} className="md:hidden">
            <X className="h-3.5 w-3.5" /> Clear {activeCount} filter{activeCount > 1 ? 's' : ''}
          </Button>
        )}
      </div>
    </div>
  );
}

export const allOption = (label: string) => ({ label, value: 'all' });

export const toOptions = (values: readonly string[] = []) => values.map((v) => ({ label: v, value: v }));
