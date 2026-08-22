import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing/Landing';
import { RequireAuth } from './components/RequireAuth/RequireAuth';
import { useAuthBoot } from './hooks/useAuthBoot';
import styles from './App.module.css';

// Carga diferida: recharts (usado solo en /panel) pesaba ~500kB del bundle
// principal, incluido en la landing pública que ni lo necesita. Con esto la
// landing no descarga el dashboard, y viceversa.
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const DetalleLlamada = lazy(() =>
  import('./pages/DetalleLlamada/DetalleLlamada').then((m) => ({ default: m.DetalleLlamada })),
);

export default function App() {
  // Sincroniza el store de auth con la sesión real de Supabase — una sola
  // vez acá, no en cada página (ver hooks/useAuthBoot.ts).
  useAuthBoot();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/panel"
          element={
            <RequireAuth>
              <Suspense fallback={<div className={styles.routeLoading}>Cargando panel…</div>}>
                <Dashboard />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/llamada/:id"
          element={
            <RequireAuth>
              <Suspense fallback={<div className={styles.routeLoading}>Cargando detalle…</div>}>
                <DetalleLlamada />
              </Suspense>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
