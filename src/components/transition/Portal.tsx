/**
 * Route transitions that make landing → sign-in → dashboard feel like one space.
 *
 *   dive  — dark veil with a converging survey grid (into the land, e.g. to sign in)
 *   rise  — the same veil opening as a light iris onto the dashboard
 *
 * The veil closes, the route changes underneath it, then it opens. With
 * reduced motion the route simply changes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoMark } from '@/components/layout/Logo';

export type PortalVariant = 'dive' | 'rise';
type Phase = 'idle' | 'closing' | 'opening';

interface PortalApi {
  go: (to: string, variant?: PortalVariant, onClose?: () => void) => void;
  busy: boolean;
}

const PortalCtx = createContext<PortalApi>({ go: () => undefined, busy: false });
export const usePortal = () => useContext(PortalCtx);

const CLOSE_MS = 720;
const OPEN_MS = 820;
const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');

export function PortalProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [variant, setVariant] = useState<PortalVariant>('dive');
  const [label, setLabel] = useState('');
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const go = useCallback(
    (to: string, v: PortalVariant = 'dive', onClose?: () => void) => {
      if (phase !== 'idle') return;
      if (reducedMotion()) {
        navigate(to);
        return;
      }
      onClose?.();
      setVariant(v);
      setLabel(
        to === '/experience'
          ? 'Entering the 3D experience'
          : to === '/'
            ? 'Opening the standard view'
            : v === 'rise'
              ? 'Opening your dashboard'
              : to.startsWith('/login')
                ? 'Entering the land'
                : 'Opening the platform',
      );
      setPhase('closing');
      timers.current.push(
        window.setTimeout(() => {
          navigate(to);
          window.scrollTo(0, 0);
          setPhase('opening');
          timers.current.push(window.setTimeout(() => setPhase('idle'), OPEN_MS));
        }, CLOSE_MS),
      );
    },
    [navigate, phase],
  );

  const api = useMemo(() => ({ go, busy: phase !== 'idle' }), [go, phase]);
  return (
    <PortalCtx.Provider value={api}>
      {children}
      {phase !== 'idle' && <Veil phase={phase} variant={variant} label={label} />}
    </PortalCtx.Provider>
  );
}

function Veil({ phase, variant, label }: { phase: Phase; variant: PortalVariant; label: string }) {
  const closing = phase === 'closing';
  const rise = variant === 'rise';
  return (
    <div className={`portal-veil ${closing ? 'is-closing' : 'is-opening'} ${rise ? 'is-rise' : 'is-dive'}`} aria-hidden="true">
      <div className="portal-dark">
        <svg className="portal-grid" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="pv-fade" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#72b8c8" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#72b8c8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g stroke="url(#pv-fade)" strokeWidth="1">
            {Array.from({ length: 21 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="1000" />
            ))}
            {Array.from({ length: 21 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 50} x2="1000" y2={i * 50} />
            ))}
          </g>
          <circle cx="500" cy="500" r="120" fill="none" stroke="#72b8c8" strokeOpacity="0.5" className="portal-ring" />
        </svg>
        <div className="portal-label">
          <LogoMark className="h-9 w-9" />
          <span>{label}</span>
        </div>
      </div>
      {rise && <div className="portal-iris" />}
    </div>
  );
}

/** A link that routes through the portal transition. */
export function PortalLink({
  to,
  variant,
  onClose,
  children,
  ...rest
}: { to: string; variant?: PortalVariant; onClose?: () => void; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { go } = usePortal();
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        rest.onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(to, variant ?? (to.startsWith('/login') ? 'dive' : 'rise'), onClose);
      }}
    >
      {children}
    </a>
  );
}
