import { type ReactNode } from 'react';
import { ArrowDown, ChevronLeft, ChevronRight, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, EmptyState, Skeleton } from '@/components/ui';

export interface ServerColumn<T> {
  key: string;
  header: string;
  /** Sort key sent to the API. Omit to make the column unsortable. */
  sortKey?: string;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'right' | 'center';
}

/**
 * Table over a server-paginated result set.
 *
 * Sorting and paging are the API's job — the corpus is far too large to sort in
 * the browser — so this component only reports intent and renders the page it is
 * given. The previous page stays on screen while the next one loads, which keeps
 * the layout from jumping on every keystroke in a filter.
 */
export function ServerTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  total,
  page,
  pages,
  pageSize,
  sort,
  onSort,
  onPage,
  loading = false,
  refreshing = false,
  emptyTitle = 'No records match these filters',
  emptyDescription = 'Widen the risk band or clear a filter to see more.',
  dense = false,
  minWidth = 900,
  footNote,
}: {
  rows: T[];
  columns: ServerColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  sort?: string;
  onSort?: (sortKey: string) => void;
  onPage: (page: number) => void;
  loading?: boolean;
  refreshing?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  dense?: boolean;
  minWidth?: number;
  footNote?: ReactNode;
}) {
  const alignClass = (align?: string) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (loading) {
    return (
      <div className="space-y-2 p-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const windowStart = Math.max(1, Math.min(page - 2, pages - 4));

  return (
    <div className={cn('relative', refreshing && 'opacity-[0.72] transition-opacity')}>
      {refreshing && (
        <div className="pointer-events-none absolute right-4 top-3 z-20 flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-3 shadow-card">
          <Loader2 className="h-3 w-3 animate-spin" /> updating
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth }}>
          <thead>
            <tr className="border-b border-line">
              {columns.map((col) => {
                const isSorted = col.sortKey && sort === col.sortKey;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'sticky top-0 z-10 bg-surface px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3',
                      alignClass(col.align),
                      col.headerClassName,
                    )}
                  >
                    {col.sortKey && onSort ? (
                      <button
                        onClick={() => onSort(col.sortKey!)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-ink',
                          isSorted && 'text-brand',
                          col.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {col.header}
                        {isSorted ? <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                style={{ animationDelay: `${Math.min(i, 12) * 16}ms` }}
                className={cn(
                  'border-b border-line/70 animate-fade-in transition-colors last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-2',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      dense ? 'px-3 py-2.5' : 'px-3 py-3.5',
                      'text-[13px] text-ink-2',
                      alignClass(col.align),
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <EmptyState title={emptyTitle} description={emptyDescription} />}

      {(total > pageSize || footNote) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-[12px] text-ink-3">
            {total > 0 ? (
              <>
                Showing <span className="font-semibold text-ink num">{start.toLocaleString('en-IN')}</span>–
                <span className="font-semibold text-ink num">{end.toLocaleString('en-IN')}</span> of{' '}
                <span className="font-semibold text-ink num">{total.toLocaleString('en-IN')}</span>
              </>
            ) : (
              'No matching records'
            )}
            {footNote && <span className="ml-2 text-ink-3">{footNote}</span>}
          </p>
          {pages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(5, pages) }).map((_, i) => {
                const p = windowStart + i;
                if (p > pages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => onPage(p)}
                    className={cn(
                      'h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition-colors num',
                      p === page ? 'bg-brand text-white' : 'border border-line text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
