import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EstadoChip } from '../../components/EstadoChip/EstadoChip';
import { VerdictChip } from '../../components/VerdictChip/VerdictChip';
import { obtenerDetalleLlamada, type DetalleLlamada as Detalle } from '../../services/detalleService';
import styles from './DetalleLlamada.module.css';

function formatearDuracion(seg: number | null): string {
  if (seg === null) return 'duración desconocida';
  const min = Math.floor(seg / 60);
  const resto = seg % 60;
  return `${min}:${String(resto).padStart(2, '0')} min`;
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

export function DetalleLlamada() {
  const { id } = useParams<{ id: string }>();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verTranscripcion, setVerTranscripcion] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    try {
      setDetalle(await obtenerDetalleLlamada(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <div className={styles.estadoPagina}>Cargando detalle…</div>;
  if (error) {
    return (
      <div className={styles.page}>
        <Link to="/panel" className={styles.volver}>
          ← Volver al panel
        </Link>
        <div className={styles.errorBanner}>No se pudo cargar el detalle: {error}</div>
      </div>
    );
  }
  if (!detalle) return <div className={styles.estadoPagina}>Llamada no encontrada.</div>;

  // Los "3 indicadores" del negocio son las 3 categorías (CLAUDE.md): con 2
  // en SI la venta cuenta. Se muestra el conteo para que el veredicto final
  // sea auditable de un vistazo, no un resultado opaco.
  const categoriasSi = detalle.categorias.filter((c) => c.veredicto === 'SI').length;

  return (
    <div className={styles.page}>
      <Link to="/panel" className={styles.volver}>
        ← Volver al panel
      </Link>

      <header className={styles.header}>
        <div>
          <h1 className={styles.titulo}>{detalle.asesor}</h1>
          <div className={styles.meta}>
            {formatearFecha(detalle.fechaHora)} · {formatearDuracion(detalle.duracionSeg)}
            {detalle.correoAsesor && ` · ${detalle.correoAsesor}`}
          </div>
        </div>
        <EstadoChip
          estado={detalle.estado}
          veredictoVenta={detalle.veredictoVenta}
          requiereRevision={detalle.requiereRevision}
        />
      </header>

      {!detalle.calificacionId ? (
        <div className={styles.card}>
          <div className={styles.sinEvaluar}>
            Esta llamada no tiene una evaluación vigente.
            {detalle.estado === 'cargada' && ' Usá "Evaluar" en el panel para disparar el pipeline.'}
            {detalle.estado === 'error' && ' El último intento terminó en error — revisá el log del worker.'}
            {/* Caso real, no hipotético: una llamada ya calificada cuya
                calificación se marcó vigente=false (reproceso o descarte
                manual) queda acá. El historial no se borra, solo sale de
                circulación — ver migración 023. */}
            {detalle.estado === 'calificada' &&
              ' Fue evaluada antes, pero esa calificación se marcó como no vigente (reproceso o descarte manual). El historial sigue en la base, fuera de los KPIs.'}
          </div>
        </div>
      ) : (
        <>
          <section className={`${styles.card} ${styles.resumen}`}>
            <div>
              <div className={styles.resumenLabel}>Veredicto de la venta</div>
              <div
                className={
                  detalle.veredictoVenta === 'CUENTA' ? styles.veredictoCuenta : styles.veredictoNoCuenta
                }
              >
                {detalle.veredictoVenta === 'CUENTA' ? 'CUENTA' : 'NO CUENTA'}
              </div>
            </div>
            <div className={styles.regla}>
              {categoriasSi} de {detalle.categorias.length} categorías en SI — la venta cuenta con al menos 2.
              {detalle.requiereRevision && (
                <div className={styles.avisoRevision}>
                  Requiere revisión humana: alguna categoría quedó sin veredicto (todas sus preguntas
                  resultaron n/a).
                </div>
              )}
            </div>
            <div className={styles.origen}>
              Evaluado {detalle.origen === 'ia' ? 'por IA' : 'a mano'}
              {detalle.fechaEvaluacion && ` · ${formatearFecha(detalle.fechaEvaluacion)}`}
            </div>
          </section>

          {detalle.categorias.map((categoria) => (
            <section className={styles.card} key={categoria.categoriaId}>
              <div className={styles.catHeader}>
                <div>
                  <h2 className={styles.catNombre}>{categoria.nombre}</h2>
                  <div className={styles.catConteo}>
                    {categoria.preguntasAprobadas} de {categoria.preguntasTotales} preguntas aplicables aprobadas
                    {categoria.preguntasNoAplica > 0 && ` · ${categoria.preguntasNoAplica} no aplica(n)`}
                  </div>
                </div>
                <VerdictChip veredicto={categoria.veredicto} />
              </div>

              {categoria.preguntas.map((p) => (
                <article className={styles.pregunta} key={p.parametroId}>
                  <div className={styles.preguntaTop}>
                    <span className={styles.preguntaTexto}>{p.pregunta}</span>
                    <span
                      className={`${styles.valor} ${
                        p.noAplica ? styles.valorNa : p.valor === 2 ? styles.valorSi : styles.valorNo
                      }`}
                    >
                      {p.noAplica ? 'n/a' : p.valor}
                    </span>
                  </div>
                  {p.justificacionIa && <p className={styles.justificacion}>{p.justificacionIa}</p>}
                  {p.comentario && (
                    <p className={styles.comentarioHumano}>
                      <strong>Nota humana:</strong> {p.comentario}
                    </p>
                  )}
                  {p.corregidoPorHumano && <span className={styles.corregido}>Corregido por un humano</span>}
                </article>
              ))}
            </section>
          ))}
        </>
      )}

      {detalle.transcripcion && (
        <section className={styles.card}>
          <button
            type="button"
            className={styles.toggleTranscripcion}
            onClick={() => setVerTranscripcion((v) => !v)}
            aria-expanded={verTranscripcion}
          >
            {verTranscripcion ? '▾' : '▸'} Transcripción
            {detalle.modeloTranscripcion && (
              <span className={styles.modelo}> · {detalle.modeloTranscripcion}</span>
            )}
          </button>
          {verTranscripcion && <pre className={styles.transcripcion}>{detalle.transcripcion}</pre>}
        </section>
      )}
    </div>
  );
}
