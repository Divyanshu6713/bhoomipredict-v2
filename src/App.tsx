import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { SkeletonCard } from '@/components/ui';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import ProjectForm from '@/pages/ProjectForm';
import Cases from '@/pages/Cases';
import CaseDetail from '@/pages/CaseDetail';
import Prediction from '@/pages/Prediction';
import RiskAnalysis from '@/pages/RiskAnalysis';
import Queue from '@/pages/Queue';
import GeographicMap from '@/pages/GeographicMap';
import Analytics from '@/pages/Analytics';
import DataAndModel from '@/pages/DataAndModel';
import Alerts from '@/pages/Alerts';
import Reports from '@/pages/Reports';
import About from '@/pages/About';
import Admin from '@/pages/Admin';
import Audit from '@/pages/Audit';
import Documents from '@/pages/Documents';
import Profile from '@/pages/Profile';
import Registry from '@/pages/Registry';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function ParcelsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/cases${search}`} replace />;
}

function ParcelRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/cases/${id}`} replace />;
}

/** Screens that need a permission render a clear refusal instead of a dead page. */
function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { can, user } = useAuth();
  if (!can(permission)) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-[16px] font-bold text-ink">Not available for your role</p>
        <p className="mt-1 text-[12.5px] text-ink-3">
          {user?.roleLabel} does not have the <code className="font-mono">{permission}</code> permission. Switch to a profile with that role to use this screen.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function Shell() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-10">
        <SkeletonCard lines={6} />
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/new" element={<RequirePermission permission="project.create"><ProjectForm /></RequirePermission>} />
        <Route path="/projects/:id/edit" element={<RequirePermission permission="project.edit"><ProjectForm /></RequirePermission>} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/parcels" element={<ParcelsRedirect />} />
        <Route path="/parcels/:id" element={<ParcelRedirect />} />
        <Route path="/predict" element={<Prediction />} />
        <Route path="/risk" element={<RiskAnalysis />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/interventions" element={<Navigate to="/queue" replace />} />
        <Route path="/map" element={<GeographicMap />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/data" element={<DataAndModel />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/registry" element={<Registry />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<RequirePermission permission="admin.view"><Admin /></RequirePermission>} />
        <Route path="/audit" element={<RequirePermission permission="audit.view"><Audit /></RequirePermission>} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
