import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KpiTile } from '../../components/KpiTile/KpiTile';
import { EstadoChip } from '../../components/EstadoChip/EstadoChip';
import { CategoryBar } from '../../components/CategoryBar/CategoryBar';
import { TrendChart } from '../../charts/TrendChart/TrendChart';
import { useAuthStore } from '../../stores/authStore';
import { signOut } from '../../services/authService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import {
  obtenerKpis,
  obtenerTendencia,
  obtenerPipelineEnVivo,
  obtenerCategorias,
  obtenerAsesoresDestacados,
  type Kpis,
  type FilaPipeline,
  type FilaCategoria,
  type FilaAsesor,
} from '../../services/dashboardService';
import {
  buscarAsesorPorCorreo,
  subirLlamada,
  dispararEvaluacion,
  type AsesorEncontrado,
} from '../../services/ingestaService';
import type { PuntoTendencia } from '../../charts/TrendChart/TrendChart';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [correo, setCorreo] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [asesorEncontrado, setAsesorEncontrado] = useState<AsesorEncontrado | null>(null);
  const [buscandoAsesor, setBuscandoAsesor] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [mensajeCarga, setMensajeCarga] = useState<{ texto: string; error: boolean } | null>(null);
  const [evaluandoId, setEvaluandoId] = useState<string | null>(null);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [tendencia, setTendencia] = useState<PuntoTendencia[]>([]);
  const [pipeline, setPipeline] = useState<FilaPipeline[]>([]);
  const [categorias, setCategorias] = useState<FilaCategoria[]>([]);
  const [asesores, setAsesores] = useState<FilaAsesor[]>([]);

  const cargarTodo = useCallback(async () => {
    try {
      const [k, t, p, c, a] = await Promise.all([
        obtenerKpis(),
        obtenerTendencia(),
        obtenerPipelineEnVivo(),
        obtenerCategorias(),
        obtenerAsesoresDestacados(),
      ]);
      setKpis(k);
      setTendencia(t);
      setPipeline(p);
      setCategorias(c);
      setAsesores(a);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el panel.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  // Vuelve a pedir todo cuando cambia una llamada o una calificación —
  // ver hooks/useRealtimeRefresh.ts. cargarTodo es estable (useCallback,
  // sin deps), así que la suscripción no se rearma en cada render.
  useRealtimeRefresh(cargarTodo);

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  // Autocompletado con confirmación visual del nombre (CLAUDE.md, paso 1)
  // — debounced para no golpear la base en cada tecla.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!correo.trim()) {
      setAsesorEncontrado(null);
      return;
    }
    setBuscandoAsesor(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const encontrado = await buscarAsesorPorCorreo(correo);
        setAsesorEncontrado(encontrado);
      } catch {
        setAsesorEncontrado(null);
      } finally {
        setBuscandoAsesor(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [correo]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!asesorEncontrado || !archivo || subiendo) return;

    setSubiendo(true);
    setMensajeCarga(null);
    try {
      const resultado = await subirLlamada(correo, archivo);
      setMensajeCarga({
        texto: `Llamada cargada para ${resultado.asesor}. Ya aparece en "Estado en tiempo real" — usá "Evaluar" cuando quieras disparar el pipeline.`,
        error: false,
      });
      setCorreo('');
      setArchivo(null);
      setAsesorEncontrado(null);
      await cargarTodo();
    } catch (err) {
      setMensajeCarga({
        texto: err instanceof Error ? err.message : 'No se pudo subir la llamada.',
        error: true,
      });
    } finally {
      setSubiendo(false);
    }
  }

  async function handleEvaluar(llamadaId: string) {
    setEvaluandoId(llamadaId);
    try {
      await dispararEvaluacion(llamadaId);
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo disparar la evaluación.');
    } finally {
      setEvaluandoId(null);
    }
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <b>Calidad</b>IA
        </div>
        <div className={styles.links}>
          <span className={styles.active}>Panel</span>
          <span>Asesores</span>
          <span>Llamadas</span>
          <span>Plantillas</span>
        </div>
        <div className={styles.right}>
          <div className={styles.badgeLive}>
            <span className={styles.dot} /> Evaluación en vivo
          </div>
          {user?.email && <span className={styles.userEmail}>{user.email}</span>}
          <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </nav>

      <h1 className={styles.hero}>Panel de calidad</h1>
      <div className={styles.heroSub}>Resultados de evaluación automática por asesor</div>

      {error && <div className={styles.errorBanner}>No se pudo cargar el panel: {error}</div>}

      <form className={styles.upload} onSubmit={handleSubmit}>
        <div className={styles.uploadTitle}>Subir una llamada</div>
        <div className={styles.uploadSub}>
          Se busca al asesor por correo — confirmá el nombre antes de subir el audio.
        </div>
        <div className={styles.uploadRow}>
          <div className={styles.field}>
            <label htmlFor="correo-asesor">Correo del asesor</label>
            <input
              id="correo-asesor"
              type="email"
              placeholder="correo@empresa.com"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              disabled={subiendo}
            />
            {correo.trim() && (
              <span className={asesorEncontrado ? styles.asesorOk : styles.asesorFalta}>
                {buscandoAsesor
                  ? 'Buscando…'
                  : asesorEncontrado
                    ? `✓ ${asesorEncontrado.nombres} ${asesorEncontrado.apellidos}`
                    : 'No se encontró ningún asesor activo con ese correo'}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="archivo-audio">Archivo de audio</label>
            <label className={styles.fileBtn} htmlFor="archivo-audio">
              {archivo ? archivo.name : 'Seleccionar archivo — ningún archivo elegido'}
            </label>
            <input
              id="archivo-audio"
              type="file"
              accept="audio/*"
              className={styles.fileInput}
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              disabled={subiendo}
            />
          </div>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!asesorEncontrado || !archivo || subiendo}
          >
            {subiendo ? 'Subiendo…' : 'Subir llamada'}
          </button>
        </div>
        {mensajeCarga && (
          <div className={mensajeCarga.error ? styles.errorBanner : styles.okBanner}>
            {mensajeCarga.texto}
          </div>
        )}
      </form>

      {cargando ? (
        <div className={styles.cargandoPanel}>Cargando panel…</div>
      ) : (
        <>
          <div className={styles.grid4}>
            <KpiTile
              label="Ventas que cuentan"
              value={kpis?.ventasQueCuentanPct === null ? '—' : `${kpis?.ventasQueCuentanPct}%`}
              accent
              delta={
                kpis?.ventasQueCuentanPct === null
                  ? { texto: 'Sin calificaciones todavía', direccion: 'neutral' }
                  : undefined
              }
            />
            <KpiTile label="Llamadas auditadas" value={(kpis?.llamadasAuditadas ?? 0).toLocaleString('es')} />
            <KpiTile
              label="En proceso ahora"
              value={kpis?.enProceso ?? 0}
              accent
              delta={{ texto: 'transcribiendo / evaluando', direccion: 'neutral' }}
            />
            <KpiTile
              label="Requiere revisión"
              value={kpis?.requiereRevision ?? 0}
              delta={{ texto: 'calificaciones con categoría sin veredicto', direccion: 'neutral' }}
            />
          </div>

          <div className={styles.grid2}>
            <div className={styles.card}>
              <div className={styles.stitle}>Tendencia de ventas que cuentan</div>
              <div className={styles.ssub}>últimas 12 semanas</div>
              {tendencia.length === 0 ? (
                <div className={styles.sinDatos}>Todavía no hay calificaciones para graficar.</div>
              ) : (
                <TrendChart datos={tendencia} />
              )}
            </div>
            <div className={styles.card}>
              <div className={styles.stitle}>Estado en tiempo real</div>
              <div className={styles.ssub}>se actualiza solo al terminar cada llamada</div>
              {pipeline.length === 0 ? (
                <div className={styles.sinDatos}>No hay ninguna llamada cargada todavía.</div>
              ) : (
                pipeline.map((fila) => (
                  <div className={styles.pipeRow} key={fila.id}>
                    <span className={styles.pipeId}>#{fila.id.slice(0, 8)}</span>
                    <span className={styles.pipeName}>{fila.asesor}</span>
                    <EstadoChip
                      estado={fila.estado}
                      veredictoVenta={fila.veredictoVenta}
                      requiereRevision={fila.requiereRevision}
                    />
                    {fila.estado === 'cargada' && (
                      <button
                        type="button"
                        className={styles.evaluarBtn}
                        disabled={evaluandoId === fila.id}
                        onClick={() => handleEvaluar(fila.id)}
                      >
                        {evaluandoId === fila.id ? 'Disparando…' : 'Evaluar'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.card}>
              <div className={styles.stitle}>Puntaje por categoría</div>
              <div className={styles.ssub}>promedio del mes — plantilla "LID de montos grandes"</div>
              {categorias.length === 0 ? (
                <div className={styles.sinDatos}>La plantilla activa no tiene categorías.</div>
              ) : (
                categorias.map((cat) => <CategoryBar key={cat.nombre} {...cat} />)
              )}
            </div>
            <div className={styles.card}>
              <div className={styles.stitle}>Asesores destacados</div>
              <div className={styles.ssub}>mayor % de ventas que cuentan este mes</div>
              {asesores.length === 0 ? (
                <div className={styles.sinDatos}>Todavía no hay asesores evaluados este mes.</div>
              ) : (
                asesores.map((asesor) => (
                  <div className={styles.simpleBar} key={asesor.nombre}>
                    <div className={styles.top}>
                      <span>{asesor.nombre}</span>
                      <span className={styles.accentText}>{asesor.porcentajeCuenta}%</span>
                    </div>
                    <div className={styles.bar}>
                      <span className={styles.fill} style={{ width: `${asesor.porcentajeCuenta}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
