import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing/Landing';
import styles from './App.module.css';

// Carga diferida: recharts (usado solo en /panel) pesaba ~500kB del bundle
// principal, incluido en la landing pública que ni lo necesita. Con esto la
// landing no descarga el dashboard, y viceversa.
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));

// TODO: /panel no tiene guard de sesión todavía — falta wirear Supabase Auth
// (client.ts del agente y el login real de authService.ts) antes de proteger
// la ruta. Hoy cualquiera que conozca la URL entra sin loguearse.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/panel"
          element={
            <Suspense fallback={<div className={styles.routeLoading}>Cargando panel…</div>}>
              <Dashboard />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
