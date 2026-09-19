import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { PortalLink, type PortalVariant } from '@/components/transition/Portal';
import { useAuth } from '@/auth/AuthContext';
import { useStore } from '../lib/store';

/**
 * Landing links into the app. The camera dives into the land while the
 * transition veil closes; signed-in visitors rise straight into the dashboard.
 */
export function CineLink({ to, children, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { user } = useAuth();
  const variant: PortalVariant = to.startsWith('/login') || !user ? 'dive' : 'rise';
  return (
    <PortalLink to={to} variant={variant} onClose={() => useStore.getState().set({ dive: true })} {...rest}>
      {children}
    </PortalLink>
  );
}
