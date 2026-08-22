import styles from './EstadoChip.module.css';

// Los 6 estados reales de llamadas.estado (migraciones 004 y 028).
// "cargada" se agregó el 2026-08-20 para separar "adjuntar el audio" de
// "disparar la evaluación" (CLAUDE.md: el disparo es manual, un botón).
export type EstadoLlamada =
  | 'cargada'
  | 'pendiente'
  | 'transcribiendo'
  | 'evaluando'
  | 'calificada'
  | 'error';

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
    // calificada sin veredictoVenta ni requiereRevision explícitos: dato
    // incompleto llegando del caller, no un estado real del negocio.
    return <span className={`${styles.chip} ${styles.pendiente}`}>Calificada</span>;
  }

  const ETIQUETA: Record<Exclude<EstadoLlamada, 'calificada'>, string> = {
    cargada: 'Cargada',
    pendiente: 'Pendiente',
    transcribiendo: 'Transcribiendo…',
    evaluando: 'Evaluando…',
    error: 'Error',
  };
  const CLASE: Record<Exclude<EstadoLlamada, 'calificada'>, string> = {
    cargada: styles.cargada,
    pendiente: styles.pendiente,
    transcribiendo: styles.enProceso,
    evaluando: styles.enProceso,
    error: styles.error,
  };

  return <span className={`${styles.chip} ${CLASE[estado]}`}>{ETIQUETA[estado]}</span>;
}
