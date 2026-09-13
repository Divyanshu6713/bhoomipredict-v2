import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { FilterBar, allOption } from '@/components/ui/FilterBar';
import { AuditTimeline } from '@/components/workflow/AuditTimeline';
import { useApi, useDebounced, useFilters } from '@/hooks';
import { fetchAudit } from '@/api/client';
import { formatNumber } from '@/lib/format';

const ENTITIES = ['project', 'intervention', 'alert', 'case', 'document', 'upload', 'model', 'user'];

export default function Audit() {
  const { values, set, reset, activeCount } = useFilters({ entity: 'all', q: '', page: '1' });
  const [search, setSearch] = useState(values.q);
  const q = useDebounced(search, 300);
  useEffect(() => {
    if (q !== values.q) set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const audit = useApi((signal) => fetchAudit({ entity: values.entity, q: values.q || undefined, page: values.page, pageSize: 40 }, signal), [values.entity, values.q, values.page]);
  if (audit.error) return <ErrorState error={audit.error} onRetry={audit.reload} />;
  const d = audit.data;
  return (
    <Card>
      <CardHeader title="Audit trail" subtitle={`${formatNumber(d?.total ?? 0)} entries · user, role, action, entity, timestamp, before and after`} icon={<History className="h-4 w-4" />} />
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Project id, user, action…"
        selects={[{ key: 'entity', label: 'Entity', value: values.entity, options: [allOption('All entities'), ...ENTITIES.map((e) => ({ label: e, value: e }))] }]}
        onChange={(k, v) => set({ [k]: v })}
        onReset={() => {
          setSearch('');
          reset();
        }}
        activeCount={activeCount}
      />
      <div className="px-6 py-5">
        <AuditTimeline entries={d?.entries ?? []} empty={audit.loading ? 'Loading…' : 'No audit entries match.'} />
      </div>
      {d && d.pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <p className="text-[11.5px] text-ink-3 num">
            Page {d.page} of {d.pages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={d.page <= 1} onClick={() => set({ page: String(d.page - 1) })}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" disabled={d.page >= d.pages} onClick={() => set({ page: String(d.page + 1) })}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
