import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Info, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, DemoDataBadge } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { useApi } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { fetchDemoUsers } from '@/api/client';

/**
 * Profile selection for the demonstration. Each profile carries a real role,
 * jurisdiction and permission set that the API enforces; there is no password
 * because there is no identity provider in the prototype.
 */
export default function Login() {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const users = useApi((signal) => fetchDemoUsers(signal), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = params.get('next') || '/dashboard';

  const grouped = useMemo(() => {
    const out = new Map<string, NonNullable<typeof users.data>['users']>();
    for (const u of users.data?.users ?? []) {
      const k = u.scope === 'national' ? 'National' : u.state ?? u.department;
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(u);
    }
    return Array.from(out.entries());
  }, [users.data]);

  if (user) return <Navigate to={next} replace />;

  const choose = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await signIn(id);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 grid-lines">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Logo tone="light" />
          <DemoDataBadge />
        </div>
        <h1 className="mt-10 font-display text-[28px] font-extrabold tracking-tight text-white sm:text-[34px]">Sign in to BhoomiPredict</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-white/60">
          Choose a department profile. What you see and what you can change follows the role: jurisdiction, intervention categories, document types and administrative actions are all enforced by the API.
        </p>
        <div className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[12px] leading-relaxed text-amber-100/90">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{users.data?.note ?? 'Demonstration profiles.'} Names are illustrative personas, not real officials.</span>
        </div>
        {error && <p className="mt-4 text-[13px] font-medium text-rose-300">{error}</p>}

        {users.loading && <p className="mt-10 text-white/60">Loading profiles…</p>}
        {users.error && <p className="mt-10 text-rose-300">Could not reach the API: {users.error.message}</p>}

        <div className="mt-8 space-y-7">
          {grouped.map(([group, list]) => (
            <div key={group}>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">{group}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => choose(u.id)}
                    disabled={busy !== null}
                    className={cn('group rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-all hover:border-brand/50 hover:bg-white/[0.07]', busy === u.id && 'border-brand/60')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-white">{u.name}</p>
                        <p className="mt-0.5 text-[12px] leading-snug text-white/60">{u.designation}</p>
                      </div>
                      {busy === u.id ? <Loader2 className="h-4 w-4 animate-spin text-white/60" /> : <ArrowRight className="h-4 w-4 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" />}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge className="border-brand/30 bg-brand/15 text-[#9DBBFF]">
                        <ShieldCheck className="h-3 w-3" /> {u.roleLabel}
                      </Badge>
                      <Badge className="border-white/15 bg-white/5 text-white/60">{u.scopeLabel}</Badge>
                    </div>
                    <p className="mt-2.5 text-[11px] leading-relaxed text-white/45">{u.roleSummary}</p>
                    <p className="mt-1.5 text-[10.5px] text-white/35">{u.permissions.length ? `${u.permissions.length} write permissions` : 'Read-only'}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="mt-10 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => navigate('/')}>
          Back to overview
        </Button>
      </div>
    </div>
  );
}
