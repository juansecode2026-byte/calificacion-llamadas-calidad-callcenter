import styles from './EstadoChip.module.css';

// Los 5 estados reales de llamadas.estado (db/migrations/004_estado_llamada.sql).
// El mock original (dashboard-final.html) solo cubría 4 — "error" faltaba.
export type EstadoLlamada = 'pendiente' | 'transcribiendo' | 'evaluando' | 'calificada' | 'error';

// veredicto_venta de calificaciones (migración 011). Solo tiene sentido
// cuando estado='calificada'. Puede venir null si requiere_revision=true
// (alguna categoría quedó SIN_VEREDICTO) — ver docs/revision-backend-db-2026-08-18.md.
export type VeredictoVenta = 'CUENTA' | 'NO_CUENTA' | null;

interface EstadoChipProps {
  estado: EstadoLlamada;
  veredictoVenta?: VeredictoVenta;
  requiereRevision?: boolean;
}

export function EstadoChip({ estado, veredictoVenta, requiereRevision }: EstadoChipProps) {
  if (estado === 'calificada') {
    if (requiereRevision) {
      return <span className={`${styles.chip} ${styles.revision}`}>Requiere revisión</span>;
    }
    if (veredictoVenta === 'CUENTA') {
      return <span className={`${styles.chip} ${styles.cuenta}`}>Cuenta · SI</span>;
    }
    if (veredictoVenta === 'NO_CUENTA') {
      return <span className={`${styles.chip} ${styles.noCuenta}`}>No cuenta · NO</span>;
    }
  }

  const ETIQUETA: Record<Exclude<EstadoLlamada, 'calificada'>, string> = {
    pendiente: 'Pendiente',
    transcribiendo: 'Transcribiendo…',
    evaluando: 'Evaluando…',
    error: 'Error',
  };
  const CLASE: Record<Exclude<EstadoLlamada, 'calificada'>, string> = {
    pendiente: styles.pendiente,
    transcribiendo: styles.enProceso,
    evaluando: styles.enProceso,
    error: styles.error,
  };

  if (estado === 'calificada') {
    // calificada sin veredictoVenta ni requiereRevision explícitos: dato
    // incompleto llegando del caller, no un estado real del negocio.
    return <span className={`${styles.chip} ${styles.pendiente}`}>Calificada</span>;
  }

  return <span className={`${styles.chip} ${CLASE[estado]}`}>{ETIQUETA[estado]}</span>;
}
