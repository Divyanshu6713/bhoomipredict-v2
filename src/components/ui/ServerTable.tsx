import { type ReactNode } from 'react';
import { ArrowDown, ChevronLeft, ChevronRight, ChevronsUpDown, Loader2, SearchX } from 'lucide-react';
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
  /** Leave out of the stacked mobile layout (e.g. purely decorative columns). */
  hideOnMobile?: boolean;
}

const alignClass = (align?: string) => (align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left');

/**
 * Table over a server-paginated result set.
 *
 * Sorting and paging are the API's job — the corpus is far too large to sort in
 * the browser — so this component only reports intent and renders the page it is
 * given. The previous page stays on screen while the next one loads, which keeps
 * the layout from jumping on every keystroke in a filter.
 *
 * Below the md breakpoint rows become stacked cards: the first column is the
 * title, the last column (usually status or risk) sits beside it, and the rest
 * form a two-column definition list.
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
  emptyDescription = 'Try widening the risk band or clearing a filter. Filters apply across the full dataset, not just this page.',
  emptyAction,
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
  emptyAction?: ReactNode;
  dense?: boolean;
  minWidth?: number;
  footNote?: ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-px p-4" aria-busy="true" aria-label="Loading records">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2.5">
            <Skeleton className="h-4 flex-[2]" />
            <Skeleton className="hidden h-4 flex-1 sm:block" />
            <Skeleton className="hidden h-4 flex-1 md:block" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const windowStart = Math.max(1, Math.min(page - 2, pages - 4));
  const [primary, ...others] = columns;
  const trailing = others.length > 1 ? others[others.length - 1] : undefined;
  const middle = (trailing ? others.slice(0, -1) : others).filter((c) => !c.hideOnMobile);

  return (
    <div className="relative" aria-busy={refreshing || undefined}>
      {refreshing && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-brand/10">
          <div className="h-full w-1/3 animate-indeterminate bg-brand" />
        </div>
      )}

      {/* ≥ md: table */}
      <div className={cn('relative hidden overflow-x-auto md:block', refreshing && 'opacity-70 transition-opacity')}>
        <table className="w-full border-collapse" style={{ minWidth }}>
          <thead>
            <tr className="border-y border-line bg-surface-2">
              {columns.map((col) => {
                const isSorted = col.sortKey && sort === col.sortKey;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={isSorted ? 'descending' : undefined}
                    className={cn('whitespace-nowrap px-3 py-2 text-xs font-medium text-ink-3 first:pl-5 last:pr-5', alignClass(col.align), col.headerClassName)}
                  >
                    {col.sortKey && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.sortKey!)}
                        className={cn('inline-flex items-center gap-1 rounded transition-colors hover:text-ink focus-ring', isSorted && 'text-ink', col.align === 'right' && 'flex-row-reverse')}
                      >
                        {col.header}
                        {isSorted ? <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-50" />}
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
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn('border-b border-line transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none')}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn(dense ? 'py-2' : 'py-3', 'px-3 align-top text-sm text-ink-2 first:pl-5 last:pr-5', alignClass(col.align), col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < md: stacked cards */}
      <ul className={cn('divide-y divide-line border-t border-line md:hidden', refreshing && 'opacity-70')}>
        {rows.map((row) => {
          const content = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">{primary.render(row)}</div>
                {trailing && <div className="shrink-0 text-right">{trailing.render(row)}</div>}
              </div>
              {middle.length > 0 && (
                <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                  {middle.map((col) => (
                    <div key={col.key} className="min-w-0">
                      <dt className="text-2xs text-ink-3">{col.header}</dt>
                      <dd className="mt-0.5 min-w-0 text-sm text-ink-2 [&_*]:!text-left [&_.items-end]:!items-start [&_.justify-end]:!justify-start">{col.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );
          return (
            <li key={rowKey(row)}>
              {onRowClick ? (
                // A div, not a button: cells may contain their own links and buttons.
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onRowClick(row)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  className="block w-full cursor-pointer px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  {content}
                </div>
              ) : (
                <div className="px-4 py-3.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length === 0 && <EmptyState icon={<SearchX />} title={emptyTitle} description={emptyDescription} action={emptyAction} className="border-t border-line" />}

      {(total > pageSize || footNote) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
          <p className="text-sm text-ink-3">
            {total > 0 ? (
              <>
                <span className="num">
                  {start.toLocaleString('en-IN')}–{end.toLocaleString('en-IN')}
                </span>{' '}
                of <span className="font-medium text-ink num">{total.toLocaleString('en-IN')}</span>
              </>
            ) : (
              'No matching records'
            )}
            {footNote && <span className="ml-2 hidden text-xs sm:inline">· {footNote}</span>}
          </p>
          {pages > 1 && (
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className="px-2">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, pages) }).map((_, i) => {
                const p = windowStart + i;
                if (p > pages) return null;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPage(p)}
                    aria-current={p === page ? 'page' : undefined}
                    className={cn('hidden h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors num focus-ring sm:inline-block', p === page ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:bg-surface-3 hover:text-ink')}
                  >
                    {p}
                  </button>
                );
              })}
              <span className="px-2 text-sm text-ink-3 num sm:hidden">
                {page} / {pages}
              </span>
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" className="px-2">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
