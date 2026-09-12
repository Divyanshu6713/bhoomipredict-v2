import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
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

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

/** The parcel registry was renamed to the case registry; old links still work. */
function ParcelsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/cases${search}`} replace />;
}

function ParcelRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/cases/${id}`} replace />;
}

function Shell() {
  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/parcels" element={<ParcelsRedirect />} />
        <Route path="/parcels/:id" element={<ParcelRedirect />} />
        <Route path="/predict" element={<Prediction />} />
        <Route path="/risk" element={<RiskAnalysis />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/map" element={<GeographicMap />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/data" element={<DataAndModel />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/*" element={<Shell />} />
      </Routes>
    </BrowserRouter>
  );
}
