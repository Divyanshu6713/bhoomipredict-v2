import { Link } from 'react-router-dom';
import { Download, FileStack } from 'lucide-react';
import { Badge, Card, CardHeader, DemoDataBadge } from '@/components/ui';
import { ErrorState } from '@/components/ui/primitives';
import { FilterBar, allOption } from '@/components/ui/FilterBar';
import { useApi, useFilters } from '@/hooks';
import { documentDownloadUrl, fetchDocuments } from '@/api/client';
import { humanise } from '@/lib/status';
import { formatDate } from '@/lib/format';

/**
 * Repository across every project in the user's jurisdiction. Uploads happen on
 * the project page, where the stage and case context is known.
 */
export default function Documents() {
  const { values, set, reset, activeCount } = useFilters({ type: 'all', status: 'all' });
  const docs = useApi((signal) => fetchDocuments({ type: values.type, status: values.status }, signal), [values.type, values.status]);
  if (docs.error) return <ErrorState error={docs.error} onRetry={docs.reload} />;
  const d = docs.data;
  return (
    <Card>
      <CardHeader title="Document repository" subtitle={`${d?.total ?? 0} documents in your jurisdiction · upload from a project or case page`} icon={<FileStack className="h-4 w-4" />} action={<DemoDataBadge />} />
      <FilterBar
        selects={[
          { key: 'type', label: 'Type', value: values.type, options: [allOption('All types'), ...(d?.types ?? []).map((t) => ({ label: humanise(t), value: t }))] },
          { key: 'status', label: 'Status', value: values.status, options: [allOption('Any status'), ...['SUBMITTED', 'VERIFIED', 'REJECTED'].map((s) => ({ label: humanise(s), value: s }))] },
        ]}
        onChange={(k, v) => set({ [k]: v })}
        onReset={reset}
        activeCount={activeCount}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              {['Document', 'Type', 'Project / stage / case', 'Uploaded', 'Version', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d?.documents ?? []).map((doc) => (
              <tr key={doc.id} className="border-b border-line/70">
                <td className="px-4 py-2.5">
                  <p className="text-[12.5px] font-semibold text-ink">{doc.title}</p>
                  <p className="font-mono text-[10.5px] text-ink-3">{doc.id}</p>
                </td>
                <td className="px-4 py-2.5 text-[12px]">{humanise(doc.type)}</td>
                <td className="px-4 py-2.5 text-[12px]">
                  <Link to={`/projects/${doc.projectId}`} className="font-semibold text-brand hover:underline">
                    {doc.projectName}
                  </Link>
                  <p className="text-[11px] text-ink-3">
                    {doc.stage ?? 'No stage'}
                    {doc.caseId && (
                      <>
                        {' · '}
                        <Link to={`/cases/${doc.caseId}`} className="font-mono text-brand">
                          {doc.caseId}
                        </Link>
                      </>
                    )}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-[11.5px] text-ink-2">
                  {doc.uploaded_by.name}
                  <p className="text-ink-3">{formatDate(doc.uploaded_at)}</p>
                </td>
                <td className="px-4 py-2.5 text-[12px] num">v{doc.version}</td>
                <td className="px-4 py-2.5">
                  <Badge>{humanise(doc.status)}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <a href={documentDownloadUrl(doc.id)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d?.documents.length === 0 && <p className="px-5 py-10 text-center text-[12px] text-ink-3">No documents yet. Open a project to upload notifications, awards, land records or survey files.</p>}
      </div>
      <p className="border-t border-line px-5 py-3 text-[11px] text-ink-3">A working MVP repository: files are stored on the server with versions, review status and an audit entry for every upload, review and download. It is not a certified government records system.</p>
    </Card>
  );
}
