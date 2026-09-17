import { useState } from 'react';
import { CheckCircle2, DatabaseZap } from 'lucide-react';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { Field, inputClass } from '@/components/ui/Modal';
import { recordCaseOutcome } from '@/api/client';
import { formatDate } from '@/lib/format';
import type { RecordedOutcome } from '@/data/types';

/**
 * Record what actually happened to an open milestone. The outcome is stored
 * with the prediction the model made beforehand, monitored prospectively and
 * used at the next retraining.
 */
export function OutcomeRecorder({ caseId, dueDate, today, canRecord, recorded, onRecorded }: { caseId: string; dueDate: string; today: string; canRecord: boolean; recorded: RecordedOutcome | null | undefined; onRecorded: () => void }) {
  const [mode, setMode] = useState<'completed' | 'pending'>('completed');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (recorded) {
    return (
      <Card>
        <CardHeader title="Recorded outcome" subtitle="Feeds live monitoring now and the model at the next retraining" icon={<DatabaseZap className="h-4 w-4" />} />
        <div className="space-y-1.5 px-5 pb-5 text-xs text-ink-2">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {recorded.delayed ? 'Milestone delayed more than 30 days' : 'Milestone met within 30 days'}
            <Badge className="border-line bg-surface-2 text-ink-3">{recorded.source}</Badge>
          </p>
          <p>
            {recorded.completedOn ? `Completed ${formatDate(recorded.completedOn)} (${recorded.actualDelayDays! >= 0 ? `${recorded.actualDelayDays} days after` : `${Math.abs(recorded.actualDelayDays!)} days before`} the due date)` : recorded.note}
          </p>
          <p>
            Model had predicted <span className="font-bold num">{Math.round(recorded.predictedProbability * 100)}%</span> ({recorded.predictedBand}) with {recorded.modelVersion ?? 'the serving model'}.
          </p>
          <p className="text-xs text-ink-3">
            Recorded by {recorded.recordedBy.name} on {formatDate(recorded.recordedAt)}.
          </p>
        </div>
      </Card>
    );
  }
  if (!canRecord) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await recordCaseOutcome(caseId, mode === 'completed' ? { completedOn: date } : { stillPendingOn: date });
      onRecorded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Record milestone outcome" subtitle={`Due ${formatDate(dueDate)} · recording date limit ${formatDate(today)}`} icon={<DatabaseZap className="h-4 w-4" />} />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === 'completed'} onChange={() => setMode('completed')} /> Milestone achieved on
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === 'pending'} onChange={() => setMode('pending')} /> Still pending on
          </label>
        </div>
        <Field label="Date" hint={mode === 'pending' ? 'Only a known delay once more than 30 days past the due date.' : 'Delay is measured against the due date; more than 30 days counts as delayed.'}>
          <input type="date" className={inputClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        <Button onClick={submit} disabled={busy || !date} className="w-full">
          {busy ? 'Recording…' : 'Record outcome'}
        </Button>
        <p className="text-xs text-ink-3">The prediction made before this outcome is kept alongside it, so the model is evaluated on data it had not seen. Written to the audit trail.</p>
      </div>
    </Card>
  );
}
