import { useState } from 'react';
import { CheckCircle2, Download, FilePlus2, FileText, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Select } from '@/components/ui';
import { Modal, Field, inputClass } from '@/components/ui/Modal';
import { documentDownloadUrl, fetchDocuments, reviewDocument, uploadDocument, uploadDocumentVersion } from '@/api/client';
import { humanise } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { DocumentList, DocumentRecord } from '@/data/types';

const STATUS_CLASS: Record<string, string> = {
  SUBMITTED: 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  VERIFIED: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  REJECTED: 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Upload, version, review and download documents for one project. */
export function DocumentPanel({
  projectId,
  stages,
  initial,
  canUpload,
  canReview,
  caseId,
  onChanged,
}: {
  projectId: string;
  stages: string[];
  initial: DocumentList;
  canUpload: boolean;
  canReview: boolean;
  caseId?: string;
  onChanged?: () => void;
}) {
  const [list, setList] = useState<DocumentList>(initial);
  const [open, setOpen] = useState(false);
  const [versionFor, setVersionFor] = useState<DocumentRecord | null>(null);
  const [reviewFor, setReviewFor] = useState<{ doc: DocumentRecord; status: 'VERIFIED' | 'REJECTED' } | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState(initial.allowedTypes[0] ?? 'other');
  const [stage, setStage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setList(await fetchDocuments({ projectId, caseId }));
    onChanged?.();
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (versionFor) await uploadDocumentVersion(versionFor.id, file);
      else await uploadDocument({ projectId, title, type, stage: stage || undefined, caseId }, file);
      setOpen(false);
      setVersionFor(null);
      setFile(null);
      setTitle('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    if (!reviewFor) return;
    setBusy(true);
    setError(null);
    try {
      await reviewDocument(reviewFor.doc.id, { status: reviewFor.status, note: note || undefined });
      setReviewFor(null);
      setNote('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 pb-3">
        <p className="text-[11.5px] text-ink-3">
          {list.total} document{list.total === 1 ? '' : 's'} · you can file: {list.allowedTypes.length ? list.allowedTypes.map(humanise).join(', ') : 'none (read-only role)'}
        </p>
        {canUpload && list.allowedTypes.length > 0 && (
          <Button size="sm" className="gap-1.5" onClick={() => { setVersionFor(null); setError(null); setOpen(true); }}>
            <FilePlus2 className="h-3.5 w-3.5" /> Upload document
          </Button>
        )}
      </div>
      <div className="divide-y divide-line">
        {list.documents.map((d) => (
          <div key={d.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
            <div className="min-w-[200px] flex-1">
              <p className="text-[12.5px] font-semibold text-ink">{d.title}</p>
              <p className="text-[11px] text-ink-3">
                <span className="font-mono">{d.id}</span> · {humanise(d.type)}
                {d.stage && ` · ${d.stage}`}
                {d.caseId && ` · ${d.caseId}`} · v{d.version} · {kb(d.versions[d.versions.length - 1].bytes)}
              </p>
              <p className="text-[11px] text-ink-3">
                {d.uploaded_by.name} ({humanise(d.uploaded_by.role)}) · {formatDate(d.uploaded_at)}
              </p>
              {d.review && (
                <p className="mt-0.5 text-[11px] text-ink-2">
                  Reviewed by {d.review.by.name}: {d.review.note ?? humanise(d.status)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className={STATUS_CLASS[d.status]}>{humanise(d.status)}</Badge>
              <a href={documentDownloadUrl(d.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-3 hover:text-brand" title="Download latest version">
                <Download className="h-3.5 w-3.5" />
              </a>
              {canUpload && list.allowedTypes.includes(d.type) && (
                <Button size="sm" variant="ghost" onClick={() => { setVersionFor(d); setError(null); setOpen(true); }}>
                  New version
                </Button>
              )}
              {canReview && d.status === 'SUBMITTED' && (
                <>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setReviewFor({ doc: d, status: 'VERIFIED' })}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Verify
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => setReviewFor({ doc: d, status: 'REJECTED' })}>
                    <XCircle className="h-3.5 w-3.5 text-rose-500" /> Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {list.documents.length === 0 && <p className="px-5 py-8 text-center text-[12px] text-ink-3">No documents filed yet.</p>}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={versionFor ? `New version of ${versionFor.title}` : 'Upload document'}
        subtitle="PDF, image, CSV, text, DOCX or XLSX up to 10 MB. The upload is audited."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !file || (!versionFor && title.trim().length < 3)}>
              {busy ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {!versionFor && (
            <>
              <Field label="Title">
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Preliminary notification — Maddur taluk" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Type" value={type} onChange={setType} options={list.allowedTypes.map((t) => ({ label: humanise(t), value: t }))} />
                <Select label="Stage" value={stage} onChange={setStage} options={[{ label: 'Not stage-specific', value: '' }, ...stages.map((s) => ({ label: s, value: s }))]} />
              </div>
            </>
          )}
          <Field label="File">
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.json,.docx,.xlsx" className={cn(inputClass, 'py-2 h-auto')} />
          </Field>
          {error && <p className="text-[12px] font-medium text-rose-600">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={reviewFor !== null}
        onClose={() => setReviewFor(null)}
        title={reviewFor?.status === 'VERIFIED' ? 'Verify document' : 'Reject document'}
        subtitle={reviewFor?.doc.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewFor(null)}>
              Cancel
            </Button>
            <Button variant={reviewFor?.status === 'REJECTED' ? 'danger' : 'primary'} onClick={submitReview} disabled={busy || (reviewFor?.status === 'REJECTED' && note.trim().length < 3)}>
              Confirm
            </Button>
          </>
        }
      >
        <Field label={reviewFor?.status === 'REJECTED' ? 'Reason (required)' : 'Note (optional)'} hint="A document cannot be reviewed by the person who uploaded it.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(inputClass, 'h-auto py-2')} />
        </Field>
        {error && <p className="mt-2 text-[12px] font-medium text-rose-600">{error}</p>}
      </Modal>
    </div>
  );
}
