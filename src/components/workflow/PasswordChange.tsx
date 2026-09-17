import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';
import { Field, inputClass } from '@/components/ui/Modal';
import { changePassword } from '@/api/client';

/** Set your own password (directory profiles). Policy: 10+ characters, letters and digits, not the shared demo password. */
export function PasswordChange({ configured }: { configured: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (configured) return null;
  return (
    <Card>
      <CardHeader title="Sign-in security" subtitle="Scrypt-hashed password · five failed attempts lock the profile · sessions expire after 60 idle minutes" icon={<KeyRound className="h-4 w-4" />} />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Current password">
          <input type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="10+ characters with letters and digits">
          <input type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Button
          disabled={busy || !current || !next}
          onClick={async () => {
            setBusy(true);
            try {
              await changePassword(current, next);
              setMsg({ ok: true, text: 'Password changed. Use it next time you sign in.' });
              setCurrent('');
              setNext('');
            } catch (err) {
              setMsg({ ok: false, text: (err as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        >
          Change
        </Button>
        {msg && <p className={`sm:col-span-3 text-xs font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}
